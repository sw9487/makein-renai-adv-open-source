import {memo,useEffect,useMemo,useRef,useState} from 'react';
import type {StoryLine} from '@core/types';

type Cursor={page:StoryLine;count:number};

/** Reveal by elapsed time so a delayed frame does not permanently slow the text. */
export const TypewriterText=memo(function TypewriterText({page,speed,paused,instant,onComplete}:{page:StoryLine;speed:number;paused:boolean;instant:boolean;onComplete:(page:StoryLine)=>void}){
  const characters=useMemo(()=>Array.from(page.text),[page.text]);
  const [cursor,setCursor]=useState<Cursor>({page,count:0});
  const progress=useRef<Cursor>({page,count:0});
  const count=instant?characters.length:cursor.page===page?cursor.count:0;

  useEffect(()=>{
    if(progress.current.page!==page)progress.current={page,count:0};
    if(instant||paused)return;
    if(!characters.length){onComplete(page);return;}
    const interval=Math.max(5,65-speed);
    const start=performance.now()-progress.current.count*interval;
    let frame=0;
    const tick=(now:number)=>{
      const next=Math.min(characters.length,Math.floor((now-start)/interval));
      if(next>progress.current.count){
        progress.current={page,count:next};
        if(next===characters.length){onComplete(page);return;}
        setCursor(progress.current);
      }
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(frame);
  },[page,characters.length,speed,paused,instant,onComplete]);

  return <p>{characters.slice(0,count).join('')}</p>;
});
