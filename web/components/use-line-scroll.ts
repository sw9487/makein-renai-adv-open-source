import {useLayoutEffect,useState} from 'react';

/**
 * Keep the conversation pinned to the newest message, including late image
 * loads, until the reader scrolls up.
 *
 * Opening behavior:
 *  - No unread messages  -> jump to the very bottom (newest message).
 *  - Unread new messages -> jump to the FIRST unread message (`unreadKey`),
 *    so the window opens on the new content instead of past it.
 *
 * The unread key is captured at the open moment (before the mark-as-read
 * effect resets it) but its DOM element can appear asynchronously (messages
 * arrive over SSE). So while the panel is settling we keep re-finding the
 * anchor on every resize / image load / tick, and we NEVER fall back to the
 * bottom in the meantime; only if the anchor is still missing after settling
 * do we give up and scroll to the bottom.
 */
export function useLineScroll(conversation:string,unreadKey:string){
  const [node,setNode]=useState<HTMLDivElement|null>(null);
  useLayoutEffect(()=>{
    if(!node)return;
    let following=true;
    // While the panel is settling (entrance + async messages + late image/font
    // layout) we keep forcing the target regardless of transient scroll events.
    let settling=true;
    const settleTimers:number[]=[];
    const stopSettling=()=>{settling=false;settleTimers.forEach(clearTimeout);settleTimers.length=0;};
    const atBottom=()=>node.scrollHeight-node.clientHeight-node.scrollTop<=24;
    // Guard so our own scrollTop assignments are ignored by the scroll
    // listener; only a genuine reader scroll disables following.
    let programmatic=false;
    // Cache the anchor element once found so a re-render that briefly drops the
    // attribute never loses the target.
    let anchor:HTMLElement|null=null;
    // One-shot diagnostic so a misbehaving open can be pinpointed in the console.
    let logged=false;
    const findAnchor=()=>{
      if(anchor&&anchor.isConnected)return anchor;
      anchor=null;
      if(!unreadKey)return null;
      for(const el of node.querySelectorAll<HTMLElement>('[data-message-key]')){
        if(el.getAttribute('data-message-key')===unreadKey){anchor=el;break;}
      }
      if(!logged){logged=true;console.warn('[line-scroll] unreadKey=',unreadKey,'anchorFound=',!!anchor,'msgCount=',node.querySelectorAll('[data-message-key]').length,'scrollHeight=',node.scrollHeight);}
      return anchor;
    };
    /** Scroll the list so the first unread message sits at the top, or to the
     *  very bottom when there is nothing unread. Returns true if it moved. */
    const scrollToTarget=()=>{
      if(unreadKey){
        const target=findAnchor();
        if(!target)return false; // pending anchor — retry on the next tick
        const top=target.getBoundingClientRect().top-node.getBoundingClientRect().top+node.scrollTop;
        node.scrollTop=Math.max(0,top);
        return true;
      }
      node.scrollTop=node.scrollHeight;
      return true;
    };
    const bottom=()=>{if(following||settling){programmatic=true;scrollToTarget();programmatic=false;}};
    let frame=0;
    const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(bottom);};
    const scroll=()=>{if(programmatic)return;following=atBottom();};

    // Re-anchor as messages/images arrive late: ResizeObserver catches content
    // growth and each <img> also hooks load so a slow CG still pulls the list
    // to its target.
    const hookImages=()=>node.querySelectorAll('img').forEach(img=>{if(!img.complete)img.addEventListener('load',schedule,{once:true});});
    const resize=new ResizeObserver(()=>{schedule();hookImages();});
    resize.observe(node);
    const content=node.firstElementChild;
    if(content)resize.observe(content);
    node.addEventListener('scroll',scroll);

    // Open pinned to the target, then re-anchor for a short window so the
    // entrance and late layout never leave the view mid-scroll.
    following=true;
    programmatic=true;scrollToTarget();programmatic=false;
    bottom();schedule();hookImages();
    for(const delay of [0,60,180,420])settleTimers.push(window.setTimeout(()=>{schedule();hookImages();},delay));
    // Only after settling gives up (once) do we allow falling to the bottom.
    settleTimers.push(window.setTimeout(()=>{settling=false;programmatic=true;scrollToTarget();programmatic=false;settleTimers.forEach(clearTimeout);settleTimers.length=0;},800));

    return ()=>{
      cancelAnimationFrame(frame);settleTimers.forEach(clearTimeout);
      resize.disconnect();node.removeEventListener('scroll',scroll);
    };
  },[node,conversation,unreadKey]);
  return setNode;
}