import { ComponentChildren, createContext, render } from 'preact'
import { useContext, useEffect, useState } from 'preact/hooks'

import './index.css'

import Posts from './components/posts'
import NowPlaying from './components/now-playing'
import {Time, TimeContextProvider} from './components/time'
import { DoorbellCard } from './components/doorbell'

import Spinner from "./assets/spinner.svg"
import BackgroundImage from "./assets/bg.jpg"
import CloseIcon from "./assets/close.svg"

import { ServerConnectedCtx, ServerContextData, connect, defaultConnectedCtx } from './lib/api'
import { Game } from './components/game'

const ServerContext = createContext<ServerConnectedCtx>(defaultConnectedCtx());

export function ServerProvider({loading,err,children}: {loading: ComponentChildren, err: (msg: string) => ComponentChildren, children: ComponentChildren}) {
  let [ctx,setCtx] = useState<ServerContextData>({state: "connecting"});

  useEffect(() => connect(setCtx), [])

  if (ctx.state=="connected") {
    return <ServerContext.Provider value={ctx.data} >
      {children}
    </ServerContext.Provider>;
  } else if (ctx.state=="connecting") {
    return <>{loading}</>;
  } else {
    return <>{err(ctx.msg)}</>;
  }
}

export function useServer(): ServerConnectedCtx {
  return useContext(ServerContext);
}

function Modal({children,title}: {children: ComponentChildren, title?: string}) {
  const cls = "p-4 flex flex-row text-black items-center border border-black border-4";

  let [open, setOpen] = useState(true);

  useEffect(() => {
    setOpen(true);
  }, [children, title]);

  if (!open) {
    return <></>;
  }

  return <div className="bg-slate-400/30 z-20 flex flex-col justify-center items-center fixed left-0 top-0 right-0 bottom-0 w-full max-h-full text-lg" >
    <div>
      {title ? <>
        <div className={`bg-amber-550 rounded-t-lg ${cls} text-2xl font-bold`} >
          {title}

          <button onClick={() => setOpen(false)} className="ml-3 w-5" >
            <img src={CloseIcon} />
          </button>
        </div>
        <div className={`${cls} bg-amber-450 border-t-0 rounded-b-lg px-4 py-3`} >
          {children}
        </div>
      </> : <div className={`bg-amber-450 text-xl rounded-lg ${cls}`} disabled>
        {children}
      </div>}
    </div>
  </div>;
}

export const LoadingScreen = () => 
  (<Modal>
    <button className="bg-amber-450 rounded-lg p-4 flex flex-row text-black items-center text-2xl" disabled>
      <img className="animate-spin h-7 mr-3" src={Spinner} /> Connecting...
    </button>
  </Modal>);

export const ErrorScreen = (msg) =>
  (<Modal title="Could not connect to server..." >
    <p>{msg}</p>
  </Modal>);

const Home = () => {
  const songData = {
    title: 'Not playing',
    artist: 'Not playing',
    image: BackgroundImage
  }

  let ctx = useServer();

  return (
    <div
      className="h-screen"
      style={{
        backgroundImage: `url(${songData.image})`,
        backgroundSize: '125vw',
        backgroundPosition: '100% 70%'
      }}
    >
      {ctx.error!==undefined ? ErrorScreen(ctx.error) : <></>}
      <DoorbellCard />

      <div className="h-screen bg-slate-800/50 backdrop-blur-md w-full flex flex-col">

        <Time />

        <div className="flex flex-row gap-x-20 items-start justify-evenly w-full overflow-y-hidden mt-3" >
          {/* <NowPlaying fishData={ctx.fish} songData={songData} /> */}

          <div>
            <Game />
          </div>

          <div className="max-w-md h-full overflow-y-auto" >
            <Posts posts={ctx.recentMsgs.slice(-10)} />
          </div>
        </div>
      </div>
    </div>
  )
}

function App() {
  return <div className="flex font-main h-screen w-full flex-col bg-gray-900 text-white">
    <TimeContextProvider>
      <ServerProvider err={ErrorScreen} loading={<LoadingScreen/>} >
        <Home/>
      </ServerProvider>
    </TimeContextProvider>
  </div>;
}

render(<App />, document.getElementById('app')!)
