type RawPost = {
  images: string[],
  content: string
  avatar: string
  username: string
};

export type Post = RawPost & { time: Date };

export type Cell = number|null;

export type GridChange = {
  by?: number,
  x: number, y: number
};

export type PlayerColor = "red" | "blue" | "green" | "yellow" | "orange" | "purple" | "pink" | "brown" | "teal" | "navy" | "maroon" | "olive" | "cyan" | "magenta" | "lime" | "indigo" | "silver" | "gold" | "coral" | "violet";

export type Player = {
  name: string,
  color: PlayerColor,
  id: number,
  points: number
};

export type ClientMsg =
  {type: "ringBell"}
  | {type: "register", name: string, color: string}
  | {type: "paint", x: number, y: number};

export type ServerMsg =
  {type: "roundOver", gridChanges: GridChange[]}
  | {type: "gameOver", winner: number, players: Player[], gridChanges: GridChange[], grid: Cell[][]}
  | {type: "join", player: Player}
  | {type: "leave", id: number}
  | {type: "bellRung", nextRingable: number}
  | {type: "stopRinging"}
  | {type: "posted", post: RawPost & {time: string}}
  | {type: "init", nextRingable: number, ringing: boolean, fish: string, recentMsgs: Post[], grid: Cell[][], players: Player[], id: number}
  | {type: "err", msg: string};

export type ServerEvent = "roundOver" | "bellRung";

export type ServerConnectedCtx = {
  grid: Cell[][],
  nextRingable: Date,
  recentMsgs: Post[],
  players: {[x: number]: Player},
  fish: string,
  error?: string,
  send: (msg: ClientMsg) => void,
  on: (evt: ServerEvent, cb: () => void) => void,
  removeListener: (evt: ServerEvent, cb: () => void) => void,
  ringing: boolean,
  ringable: boolean
}

export function defaultConnectedCtx(): ServerConnectedCtx {
  return {
    grid: [],
    nextRingable: new Date(),
    recentMsgs: [],
    players: {},
    fish: "",
    error: "Not connected. What the hell!",
    send: (msg) => {},
    ringing: false,
    ringable: false,
    on: (e,c) => {},
    removeListener: (evt, cb) => {}
  };
}

export type ServerContextData =
  {state: "connected", data: ServerConnectedCtx}
  | {state: "connecting"} | {state: "error", msg: string}

export function connect(setCtx: (f: (x: ServerContextData) => ServerContextData) => void): (() => void) {
  let sock: WebSocket|undefined = undefined;
  let closing = false;

  let timeouts = [];
  let listeners: Record<ServerEvent, Set<() => void>> = {
    roundOver: new Set(), bellRung: new Set()
  };

  setCtx((s) => ({state: "connecting"}));

  let reconn = () => {
    if (closing) return;

    if (sock!==undefined) {
      for (let x of timeouts) clearTimeout(x);

      closing=true; sock.close(); sock=undefined;
      console.error("reconnecting in 1s...");

      timeouts.push(window.setTimeout(() => {
        closing=false;
        reconn();
      }, 1000));

      return;
    }

    console.log("connecting...");
    let sockUrl = new URL("/sock", window.location.href);
    sockUrl.protocol = import.meta.env.PROD ? "wss:" : "ws:";

    sock = new WebSocket(sockUrl);

    sock.addEventListener("error", (err) => {
      console.error("socket error", err);
      setCtx((ctx) => {return {state: "error", msg: `websocket error (see console?)`};});
      reconn();
    });

    sock.addEventListener("close", (ev) => {
      if (closing) return;
      console.error("unexpected socket closure");

      setCtx((ctx) => {return {state: "error", msg: "socket unexpectedly closed"};});
      reconn();
    });

    sock.addEventListener("message", (ev) => {
      console.log("socket message", ev);
      try {
        if (ev.data as string === null) throw "message received not a string";
        const msg = JSON.parse(ev.data) as ServerMsg;
        if (msg === null) throw "bad message schema";
        
        let setData = (f: (x: ServerConnectedCtx) => ServerConnectedCtx) => {
          setCtx((x) => {
            let nd;
            if (x.state!=="connected") {
              reconn();
              nd = {state: "error", msg: "out of order messages / not correctly connected"};
            } else {
              nd = {state: "connected", data: f(x.data)};
            }

            console.log("new data", nd);
            return nd;
          })
        };

        let timeoutRingable = (d) =>
          timeouts.push(setTimeout(() => {
            setData((x) => ({...x, ringable: true}));
          }, d));
        
        switch (msg.type) {
          case "stopRinging":
            setData((x) => ({...x, ringing: false}));
            break;
          case "bellRung":
            setData((x) => ({...x, nextRingable: new Date(Date.now() + msg.nextRingable), ringable: false, ringing: true}));

            timeoutRingable(msg.nextRingable);
            for (let cb of listeners["bellRung"]) cb();

            break;
          case "err":
            setData((x) => ({...x, error: msg.msg}));
            break;
          case "init":
            console.log("connected.");

            setCtx((x) => {return {
              state: "connected",
              data: {
                ...msg,
                players: Object.fromEntries(msg.players.map((x) => [x.id, x])),
                nextRingable: new Date(Date.now() + msg.nextRingable),
                error: undefined,
                send: (msg) => {
                  sock.send(JSON.stringify(msg));
                },
                on: (ev, cb) => {
                  listeners[ev].add(cb);
                },
                removeListener: (evt, cb) => {
                  listeners[evt].delete(cb);
                },
                ringable: msg.nextRingable==0
              }
            };});

            timeoutRingable(msg.nextRingable);
            break;
          case "roundOver":
            setData((x) => {
              let nd = {...x};
              for (let up of msg.gridChanges) {
                nd.grid[up.y][up.x] = up.by;
              }

              return nd;
            });

            for (let cb of listeners["roundOver"]) cb();

            break;
          case "gameOver":
            setData((x) => ({...x, players: Object.fromEntries(msg.players.map((x) => [x.id, x])), grid: msg.grid}));

            break;
          case "posted":
            const p: Post = {...msg.post, time: new Date(msg.post.time)};

            setData((x) => ({...x, recentMsgs: [...x.recentMsgs, p]}));

            break;
          case "join":
            setData(x => ({...x, players: {...x.players, [msg.player.id]: msg.player}}));
            break;
          case "leave":
            setData(x => {
              let nd = {...x};
              delete nd.players[msg.id];
              return nd;
            });

            break;
        }
      } catch (err) {
        console.error("socket message handling error", err);
        setCtx((ctx) => {return {state: "error", msg: err};});
        reconn();
      }
    });
  };

  reconn();

  return () => {
    console.log("closing socket...");

    for (let x of timeouts) clearTimeout(x);

    closing=true;
    if (sock!==undefined) {
      sock.close();
      sock=undefined;
    }
  };
}
