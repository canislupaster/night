import { useEffect, useRef, useState } from 'preact/hooks'

import doorbellSound from "../assets/doorbell.mp3"
import { useServer } from '..';
import { ServerContextData } from '../lib/api';

export function DoorbellButton({data: ctx}: {data: ServerContextData}) {
  let ringTheBell = () => {
    if (ctx.state=="connected") {
      ctx.data.send({"type": "ringBell"});
    }
  };

  let isErr = (ctx.state=="connected" && ctx.data.error!==undefined) || ctx.state=="error";
  let clickable = ctx.state == "connected" && (ctx.data.ringable || ctx.data.ringing);

  let buttonLabel = ctx.state=="connecting" ? 'Wiring up…'
    : ctx.state=="connected"
    ? ctx.data.ringing
      ? 'Ringing…'
      : (ctx.data.ringable ? 'Ring the doorbell' : 'Wait a few secs...')
    : 'Bzzt! Error.'

  return (
    <div className="text-center py-4" >
      <button
        className="bg-pink-500 aspect-square rounded-full [width:10ch] [border-bottom-width:12px] border-pink-600 active:border-b-4 p-6 font-bold text-4xl shadow-xl [text-shadow:-1px_-1px_#00000052] relative z-10"
        aria-pressed={ctx.state=="connected" && ctx.data.ringing}
        onClick={ringTheBell}
        disabled={!clickable}
      >
        {buttonLabel}
      </button>

      {isErr ? (<p className="mt-6">
          <a href="mailto:mstanciu@purdue.edu" className="text-white underline">
            <strong>Email Matthew</strong> to let you in
          </a>
        </p>) : <></>}
    </div>
  )
}

export function DoorbellCard() {
  const sound = useRef<HTMLAudioElement|undefined>(undefined);

  let ctx = useServer();

  useEffect(() => {
    if (sound.current!==undefined && sound.current.paused && ctx.ringing)
      sound.current.play();
  }, [ctx.ringing]);

  return (
    <div className="z-10 text-center fixed bottom-10 m-auto left-0 right-0" >
      <audio src={doorbellSound} ref={sound} />
      {ctx.ringing && (<button disabled className="bg-pink-500 text-white rounded-lg shadow-2xl text-4xl font-bold animate-bounce p-4 my-4">
        <div className="animate-pulse absolute inset-0 w-full h-full bg-pink-500 opacity-30 pointer-events-none"></div>
        Someone’s at the door!
      </button>)}

      <p className="text-white/50">Connected</p>
    </div>
  )
}
