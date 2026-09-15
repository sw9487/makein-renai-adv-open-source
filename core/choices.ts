/** Shuffle complete choices once, preserving each choice's attached effects. */
export function shuffleChoices<T>(choices:T[],draw=Math.random):T[]{
 const result=[...choices];
 for(let i=result.length-1;i>0;i--){const j=Math.floor(draw()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
 if(result.length>1&&result.every((choice,i)=>choice===choices[i]))result.push(result.shift()!);
 return result;
}
