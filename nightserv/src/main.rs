use std::{env, time::{Duration, Instant}, sync::Arc, collections::{HashMap, VecDeque, HashSet, BTreeSet, BTreeMap}, str::FromStr, ops::Bound};
use core::pin::Pin;
use tokio::{sync::Mutex, spawn};

use futures::{Sink, StreamExt, SinkExt, future::join_all, join};
use serde::{Deserialize, Serialize};
use anyhow::{Result, anyhow};
use warp::Filter;

use serenity::{async_trait, model::id::ChannelId};
use serenity::model::channel::Message;
use serenity::prelude::*;

use rand::{seq::SliceRandom, distributions::{Distribution,Bernoulli}, SeedableRng};

const COLORS: [&str; 20] = [
	"red", "blue", "green", "yellow", "orange", "purple", "pink", "brown", "teal", "navy", "maroon", "olive", "cyan", "magenta", "lime", "indigo", "silver", "gold", "coral", "violet"
];

const POINT_DECAY: f64 = 0.99;
const MAX_NAMELEN: usize = 20;

type WMessage = warp::filters::ws::Message;

type Cell = Option<usize>;

#[derive(Serialize)]
struct Post {
	images: Vec<String>,
	content: String,
	username: String,
	avatar: String,
	time: String
}

struct Player {
	name: String,
	color: &'static str,
	points: f64
}

#[derive(Serialize)]
struct ClientPlayer<'a> {
	id: usize,
	name: &'a str,
	color: &'static str,
	points: f64
}

#[derive(Deserialize)]
#[serde(tag = "type")]
#[serde(rename_all = "camelCase")]
enum ClientMsg {
	Paint {x: usize, y: usize},
	Register {name: String, color: String},
	RingBell
}

#[derive(Serialize)]
struct GridChange {
	x: usize, y: usize,
	by: Option<usize>
}

type Grid = Box<[Box<[Cell]>]>;

#[derive(Serialize)]
#[serde(tag = "type")]
#[serde(rename_all = "camelCase")]
enum ServerMsg<'a> {
	#[serde(rename_all = "camelCase")]
	RoundOver {grid_changes: Vec<GridChange>},
	#[serde(rename_all = "camelCase")]
	GameOver {winner: usize, players: Vec<ClientPlayer<'a>>, grid_changes: Vec<GridChange>, grid: &'a Grid},
	Join {player: ClientPlayer<'a>},
	Leave {id: usize},
	#[serde(rename_all = "camelCase")]
	BellRung {next_ringable: usize},
	Posted {post: &'a Post},
	#[serde(rename_all = "camelCase")]
	Init {
		id: usize,
		next_ringable: usize,
		fish: &'a str,
		players: Vec<ClientPlayer<'a>>,
		recent_msgs: &'a VecDeque<Post>,
		grid: &'a Grid
	},
	Err {msg: String}
}
struct ConnState {
	sink: Mutex<Pin<Box<dyn Send + Sink<WMessage, Error=warp::Error>>>>,
	player: Option<Player>
}

impl ConnState {
	async fn send<'a>(&self, s: &ServerMsg<'a>) {
		let str = serde_json::to_string(s).expect("send message serialization");
		self.sink.lock().await.send(WMessage::text(str)).await.ok();
	}
}

struct State {
	recent_msgs: VecDeque<Post>,
	max_rec_msg: usize,
	max_player: usize,
	ring_delay: Duration,
	round_timer: Duration,

	round_moves: HashMap<usize, (usize, usize)>,

	num_conn: usize,
	conns: HashMap<usize, ConnState>,
	grid_n: usize,
	default_grid: Box<[Box<[Cell]>]>,
	grid: Box<[Box<[Cell]>]>,
	last_rung: Option<Instant>,
	fish: String
}

impl State {
	fn client_players<'a>(&'a self) -> Vec<ClientPlayer<'a>> {
		self.conns.iter().filter_map(|(&id,c)| c.player.as_ref().map(|p| {
			ClientPlayer {id, name: &p.name, color: &p.color, points: p.points}
		})).collect()
	}

	async fn broadcast<'a>(&self, msg: &ServerMsg<'a>) {
		let str = serde_json::to_string(msg).expect("send message serialization");

		join_all(self.conns.iter().map(|(_, cstate)| {
			async {
				cstate.sink.lock().await.send(WMessage::text(&str)).await.ok();
			}
		})).await;
	}

	async fn paint(&mut self, (x,y): (usize, usize), id: usize) -> Result<()> {
		if x >= self.grid_n || y>=self.grid_n { return Err(anyhow!("coordinates out of range")); }

		if self.conns.get(&id).unwrap().player.is_none() {
			return Err(anyhow!("you must be registered first"));
		}

		self.round_moves.insert(id, (x,y));
		Ok(())
	}

	async fn register(&mut self, id: usize, mut name: String, color: String) -> Result<()> {
		if self.conns.iter().filter(|(id,st)| st.player.is_some())
			.count() >= self.max_player {
			return Err(anyhow!("there are too many players at the moment. check back later, i guess?"));
		}

		let c = COLORS.into_iter().find(|c| c==&color).ok_or(anyhow!("bad color chosen"))?;

		if name.len() == 0 || name.len()>MAX_NAMELEN {
			return Err(anyhow!("your name is too long"));
		} else if name.chars().find(|x| !x.is_alphanumeric() && *x != ' ').is_some() {
			return Err(anyhow!("name can only be alphanumeric"));
		}

		name = name.trim().to_owned();

		self.broadcast(&ServerMsg::Join { player: ClientPlayer { id, name: &name, color: c, points: 0f64 } }).await;

		self.conns.get_mut(&id).unwrap().player = Some(Player {
			name, color: c, points: 0f64
		});

		Ok(())
	}

	fn ringable(&self) -> bool {
		match self.last_rung {
			Some(x) if Instant::now().duration_since(x) < self.ring_delay => false,
			_ => true
		}
	}

	async fn ring(&mut self) -> Result<()> {
		if self.ringable() {
			self.last_rung = Some(Instant::now());
			self.broadcast(&ServerMsg::BellRung { next_ringable: self.ring_delay.as_millis() as usize }).await;
		}

		Ok::<(),anyhow::Error>(())
	}
}

struct Handler {
	state: Arc<Mutex<State>>,
	channel_id: ChannelId
}

#[async_trait]
impl EventHandler for Handler {
	async fn message(&self, ctx: Context, msg: Message) {
		if msg.channel_id!=self.channel_id { return; }

		let mut lock = self.state.lock().await;
		let content = msg.content_safe(&ctx);

		let dm = Post {
			images: msg.attachments.iter()
				.filter(|a| match &a.content_type {
					Some (t) if t.starts_with("image/") => true, _ => false
				})
				.map(|a| a.url.to_owned()).collect(),
			content,
			username: msg.author_nick(&ctx).await
				.unwrap_or_else(|| msg.author.name.to_owned()),
			avatar: msg.author.avatar_url().unwrap_or_else(|| msg.author.default_avatar_url()),
			time: msg.timestamp.to_rfc3339()
		};

		lock.broadcast(&ServerMsg::Posted {post: &dm}).await;
		lock.recent_msgs.push_back(dm);

		if lock.recent_msgs.len() > lock.max_rec_msg {
			lock.recent_msgs.pop_front();
		}
	}
}

async fn run_bot(state: Arc<Mutex<State>>) {
	let token = env::var("DISCORD_TOKEN").expect("token missing");
	let intents = GatewayIntents::GUILD_MESSAGES | GatewayIntents::MESSAGE_CONTENT;
	let mut client = Client::builder(token, intents)
		.event_handler(Handler {
			state,
			channel_id: env::var("DISCORD_CHANNEL").ok().and_then(|x| ChannelId::from_str(&x).ok()).expect("couldn't parse channel id")
		})
		.await
		.expect("Error creating client");

	if let Err(why) = client.start().await {
		println!("An error occurred while running the client: {:?}", why);
	}
}

fn ins(m: &mut BTreeMap<i32, i32>, mut a: i32, mut b: i32) {
	if let Some((&l,&r)) = m.range((Bound::Unbounded, Bound::Included(a))).next_back() {
		if r+1>=a { a=l; }
	}

	let mut to_remove = Vec::new();
	for (&l,&r) in m.range((Bound::Included(a), Bound::Included(b+1))) {
		to_remove.push(l);
		if r>b { b=r; }
	}

	for x in to_remove {
		m.remove(&x);
	}

	m.insert(a,b);
}

fn seed_fill(fill: &mut Vec<BTreeMap<i32,i32>>, xmax: i32) {
	struct Span {
		lx: i32, rx: i32, y: i32, dy: i32
	}

	let mut stack = vec![
		Span {lx: -1, rx: xmax+1, y: 0, dy: 1}
	];

	fill.push(BTreeMap::new());
	fill.insert(0, BTreeMap::new());

	while let Some(Span {lx,rx,y,dy}) = stack.pop() {
		let r = 0i32..fill.len() as i32;
		let uy = y as usize;

		let prevy = if r.contains(&(y-dy)) {
			Some(y-dy)
		} else { None };

		let nexty = if r.contains(&(y+dy)) {
			Some(y+dy)
		} else { None };

		let mut nlx = match fill[uy].range((Bound::Unbounded, Bound::Included(lx))).next_back() {
			Some((&l, &r)) => r+1, _ => -1
		};

		if nlx < lx {
			if let Some(y) = prevy { stack.push(Span {lx: nlx, rx: lx-1, y, dy: -dy}); }
		} else if nlx > rx {
			continue
		}

		let mut to_ins: Vec<(i32, i32)> = Vec::new();
		for (&l,&r) in fill[uy].range((Bound::Included(nlx), Bound::Unbounded)) {
			to_ins.push((nlx, l-1));

			if l-1 > rx {
				if let Some(y) = prevy { 
					stack.push(Span {lx: rx+1, rx: l-1, y, dy: -dy});
				}
			}

			nlx=r+1;
			if nlx > rx {
				break;
			}
		}

		if nlx <= rx {
			to_ins.push((nlx, xmax+1));

			if xmax+1 > rx {
				if let Some(y) = prevy { 
					stack.push(Span {lx: rx+1, rx: xmax+1, y, dy: -dy});
				}
			}
		}

		for (l,r) in to_ins {
			if let Some(y) = nexty {
				stack.push(Span {lx: l, rx: r, y, dy});
			}

			ins(&mut fill[uy],l,r);
		}
	}

	fill.pop();
	fill.remove(0);
}

async fn round_task(state: Arc<Mutex<State>>) -> ! {
	let mut interval = tokio::time::interval(state.lock().await.round_timer);
	interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

	let mut rng: rand::rngs::StdRng = SeedableRng::from_entropy();
	let coin = Bernoulli::new(0.5).expect("bernoulli distribution");

	let grid_n = state.lock().await.grid_n;

	loop {
		interval.tick().await;

		let mut lock = state.lock().await;
		if lock.round_moves.is_empty() {
			continue;
		}

		let mut changes: HashMap<(usize, usize), usize> = HashMap::new();

		let mut moves = lock.round_moves.drain()
			.collect::<Vec<(usize, (usize,usize))>>();
		moves.as_mut_slice().shuffle(&mut rng);

		for (id, (x,y)) in moves {
			if let Some(p) = lock.grid[y][x] {
				if lock.conns.get(&p).is_some() && coin.sample(&mut rng) {
					continue;
				}
			}

			changes.insert((y,x), id);
			lock.grid[y][x] = Some(id);
		}

		struct PData {
			fill: Vec<BTreeMap<i32, i32>>,
			num: usize
		}

		let mut in_grid: HashMap<usize, PData> = HashMap::new();
		for y in 0..grid_n {
			for x in 0..grid_n {
				if let Some(p) = lock.grid[y][x] {
					let g = in_grid.get_mut(&p);
					match g {
						Some(d) => {
							d.num+=1;
							ins(&mut d.fill[y], x as i32,x as i32);
						},
						None => {
							let mut d = PData {
								fill: vec![BTreeMap::new(); grid_n], num: 1
							};

							ins(&mut d.fill[y], x as i32,x as i32);
							in_grid.insert(p, d);
						}
					};
				}
			}
		}

		let mut res = in_grid.into_iter().collect::<Vec<(usize, PData)>>();
		res.as_mut_slice().shuffle(&mut rng);

		let mut winner = None;
		for (id, PData {mut fill, mut num}) in res {
			seed_fill(&mut fill, grid_n as i32);

			for y in 0..grid_n {
				let mut x = -1;
				for (&l,&r) in &fill[y] {
					if l>x {
						for i in x..l {
							changes.insert((y, i as usize), id);
							lock.grid[y][i as usize] = Some(id);
							num+=1
						}
					}

					x = r+1;
				}
			}

			if num >= grid_n*grid_n {
				winner = Some(id);
				break;
			}
		}

		let changes_vec = changes.into_iter()
			.map(|((y,x), id)| GridChange { x,y,by: Some(id) }).collect::<Vec<GridChange>>();

		if let Some(w) = winner {
			for (&id, state) in &mut lock.conns {
				if let Some(p) = &mut state.player {
					p.points *= POINT_DECAY;
					p.points += if id==w { 1f64 } else { -1f64 };
				}
			}

			lock.grid = lock.default_grid.clone();

			lock.broadcast(&ServerMsg::GameOver {
				winner: w, players: lock.client_players(),
				grid_changes: changes_vec, grid: &lock.grid
			}).await;
		} else {
			lock.broadcast(&ServerMsg::RoundOver { grid_changes: changes_vec }).await;
		}
	}
}

#[tokio::main]
async fn main() -> std::io::Result<()> {
	dotenv::dotenv().ok();
	env_logger::init();

	let env_num = |name, default| std::env::var(name).ok().and_then(|x| x.parse::<usize>().ok()).unwrap_or(default);
	let grid_n = env_num("GRID_SIZE", 30);
	let ring_delay = env_num("RING_DELAY", 60);
	let round_timer = env_num("ROUND_TIMER", 100);
	
	let dgrid = vec![
		vec![None; grid_n].into_boxed_slice(); grid_n
	].into_boxed_slice();

	let state = Arc::new(Mutex::new(State {
		recent_msgs: VecDeque::new(),
		max_rec_msg: env_num("MAX_RECENT_POSTS", 10),
		max_player: env_num("MAX_PLAYER", 30),
		ring_delay: Duration::from_secs(ring_delay as u64),
		round_timer: Duration::from_millis(round_timer as u64),
		round_moves: HashMap::new(),
		fish: std::env::var("FISH").expect("no fish"),

		num_conn: 0, conns: HashMap::new(),
		last_rung: None,
		grid_n,
		default_grid: dgrid.clone(),
		grid: dgrid
	}));

	let s1 = state.clone();
	let sock_route = warp::path("sock")
		.and(warp::ws())
		.map(move |ws: warp::ws::Ws| {

		let s2 = s1.clone(); // ugh
		ws.on_upgrade(move |sock| async move {
			let (tx, mut rx) = sock.split();

			let id;
			let cstate = ConnState {
				sink: Mutex::new(Box::pin(tx)),
				player: None
			};

			{
				let mut lock = s2.lock().await;
				id = lock.num_conn;

				cstate.send(&ServerMsg::Init {
					id,
					next_ringable: match lock.last_rung {
						None => 0,
						Some(x) => (x+lock.ring_delay).duration_since(Instant::now()).as_millis() as usize
					},
					recent_msgs: &lock.recent_msgs,
					grid: &lock.grid,
					fish: &lock.fish,
					players: lock.client_players()
				}).await;

				lock.conns.insert(id, cstate);
				lock.num_conn+=1;
			}
			
			while let Some(Ok(msg)) = rx.next().await {
				let dothing = || async {
					if msg.is_close() {
						return Ok(true);
					} else if msg.is_text() {
						let m = serde_json::from_str::<ClientMsg>(msg.to_str().unwrap())?;

						let mut lock = s2.lock().await;
						match m {
							ClientMsg::Paint {x, y} => lock.paint((x,y), id).await?,
							ClientMsg::RingBell => lock.ring().await?,
							ClientMsg::Register { name, color } => lock.register(id, name, color).await?
						}
						
						return Ok(false);
					} else {
						return Err(anyhow!("Non-text message sent thru websocket."));
					}
				};

				match dothing().await {
					Ok(true) => break,
					Ok(false) => continue,
					Err(x) => {
						let mut lock = s2.lock().await;
						lock.conns.get_mut(&id).unwrap().send(&ServerMsg::Err {msg: x.to_string()}).await;
					}
				} 
			}

			let mut lock = s2.lock().await;
			if lock.conns.remove(&id).unwrap().player.is_some() {
				lock.broadcast(&ServerMsg::Leave { id }).await;
			}
		})
	});

	tokio::spawn(round_task(state.clone()));

	let routes = warp::fs::dir("../client/dist")
		.or(warp::path("doorbell").and(warp::fs::file("../client/dist/doorbell.html")))
		.or(sock_route);

	join!(run_bot(state.clone()), warp::serve(routes).run(([127, 0, 0, 1], env_num("PORT", 3030) as u16)));

	Ok(())
}
