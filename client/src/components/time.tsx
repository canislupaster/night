import { useContext, useEffect, useState } from 'preact/hooks'
import {EmojiMarquee} from './emoji-marquee'
import phLogo from '../assets/ph-logo-cropped.png'
import { ComponentChildren, createContext } from 'preact';

import hsvrgb from 'hsv-rgb';
import { DayMS, TimezoneOffset, timeString, toLocal } from '../lib/util';

type TimeContext = {normalTime: string, lightningTimeParts: string[], lightningTimeColors: string[]};

const TimeContext = createContext<TimeContext>({normalTime: "", lightningTimeParts: [], lightningTimeColors: []});

export function TimeContextProvider({children}: {children: ComponentChildren}) {
  const DT = DayMS/65536;

  let [time, setTime] = useState<TimeContext>({
    normalTime: "", lightningTimeParts: new Array(4), lightningTimeColors: new Array(4)
  });

  useEffect(() => {
    let cur_timeout;

    const cb = () => {
      let r = toLocal(Date.now());
      let v = Math.floor(r/DT);

      let p: number[] = new Array(4), c=new Array(3);
      for (let i=3; i>=0; i--) {
        p[i] = v%16;
        if (i<3) c[i] = 16*p[i] + p[i+1];
        v=(v-p[i])/16;
      }

      let x = (r,g,b): string => `rgb(${r}, ${g}, ${b})`;

      setTime({
        lightningTimeParts: p.map((x) => x.toString(16)),
        lightningTimeColors: [
          x(c[0], 161, 0), x(50, c[1], 214), x(246, 133, c[2]),
          x.apply(null, hsvrgb(p[3]*60/16, 100, 100))
        ],
        normalTime: timeString(r)
      });

      cur_timeout = setTimeout(cb, DT-(r%DT));
    };

    cb();
    return () => clearTimeout(cur_timeout);
  }, []);

  return <TimeContext.Provider value={time} >
    {children}
  </TimeContext.Provider>;
}

export function useTime(): TimeContext {
  return useContext(TimeContext);
}

export function Time() {
  let time = useTime();

  return (
    <div className="flex flex-row items-center justify-evenly w-full grid-cols-4 drop-shadow-xl" >
      <div className="flex flex-col items-center justify-center my-4">
        <EmojiMarquee n={6} />
        <h1 className="text-4xl font-bold">
          <img
            alt="purdue hackers logo"
            src={phLogo}
            placeholder="blur"
            className="inline-block h-[3.5rem] w-auto"
          />
          HACK NIGHT
        </h1>
        <div className="flex flex-row gap-x-2">
          <h1 className="text-3xl font-bold text-gray-300">3.12</h1>
          <div className="flex flex-row items-center gap-1">
            <div className="px-1 text-black rounded bg-pink-400">
              <p className="text-sm font-bold">now with more sugary drinks!</p>
            </div>
          </div>
        </div>
        <EmojiMarquee n={6} />
      </div>
      <div className="flex flex-col col-span-2 items-center font-mono">
        <h1
          className="text-[7vw] font-bold underline underline-offset-[12px] text-amber-300 decoration-white decoration-dotted decoration-8 flex space-x-4"
        >
          <span id="bolt" style={{color: time.lightningTimeColors[0]}} >{time.lightningTimeParts[0]}</span> 
          <span>~</span> <span id="zap" style={{color: time.lightningTimeColors[1]}} >{time.lightningTimeParts[1]}</span> 
          <span>~</span> <span id="spark" style={{color: time.lightningTimeColors[2]}} >{time.lightningTimeParts[2]}</span> 
          <span>|</span> <span id="charge" style={{color: time.lightningTimeColors[3]}} >{time.lightningTimeParts[3]}</span> 
        </h1>
        <p className="text-2xl font-bold" >
          ({time.normalTime})
        </p>
      </div>

    </div>
  )
}
