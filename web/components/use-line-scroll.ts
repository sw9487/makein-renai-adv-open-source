import {useLayoutEffect,useState} from 'react';

/** Follow the current conversation, including late image loads, until the reader scrolls up. */
export function useLineScroll(conversation:string){
  const [node,setNode]=useState<HTMLDivElement|null>(null);
  useLayoutEffect(()=>{
    if(!node)return;
    let following=true;
    let frame=0;
    const bottom=()=>{if(following)node.scrollTop=node.scrollHeight;};
    const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(bottom);};
    const scroll=()=>{following=node.scrollHeight-node.clientHeight-node.scrollTop<=24;};
    const resize=new ResizeObserver(schedule);
    resize.observe(node);
    if(node.firstElementChild)resize.observe(node.firstElementChild);
    node.addEventListener('scroll',scroll);
    bottom();schedule();
    return ()=>{cancelAnimationFrame(frame);resize.disconnect();node.removeEventListener('scroll',scroll);};
  },[node,conversation]);
  return setNode;
}
