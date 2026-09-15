import type {Content} from './types';
export const sceneAssets:Record<string,string>={classroom:'101',club:'102',track:'103',cafe:'104',bookstore:'105',station:'106',park:'107',council:'108',home:'109'};
export const eventIllustrations:Record<string,string>={
 'anna-first':'201','anna-trust':'104','anna-route':'104','autumn-lunch':'104',
 'lemon-first':'202','lemon-trust':'202','lemon-route':'103','summer-running':'103','spring-goal':'202',
 'komari-first':'102','komari-trust':'203','komari-route':'203','festival':'203','summer-manuscript':'105','winter-books':'203','senior-farewell':'203','last-club':'203',
 'tiara-trust':'204','tiara-route':'105','exam-future':'105','hiroto-first':'204',
 'new-year-station':'106','umbrella':'206','riko-first':'102','riko-trust':'203','riko-route':'203',
 'kaju-trust':'109','kaju-route':'205','satoshi-first':'107','koharu-first':'104',
};
/** Explicit author migration; normal editor reads never undo image removal. */
export function fillSceneBackgrounds(input:Content){
 const c=structuredClone(input);
 for(const p of c.places){
  const suffix=sceneAssets[p.id];if(!suffix)continue;
  const url=`/assets/authored/backgrounds/00000000-0000-4000-8000-000000000${suffix}.png`;
  if(!p.background)p.background=url;
  if(!c.assets.some(a=>a.id==='scene-'+p.id))c.assets.push({id:'scene-'+p.id,title:p.name+'・場景背景',url,source:'',note:'內建 imagegen 生成的原創遊戲背景，並非官方動畫截圖或小說插圖。'});
 }
 const council=c.places.find(p=>p.id==='council');if(council&&council.weights.riko===undefined)council.weights.riko=2;
 for(const e of c.events){
  const suffix=eventIllustrations[e.id];if(!suffix||e.cg)continue;
  e.cg=`/assets/authored/${Number(suffix)<200?'backgrounds':'cg'}/00000000-0000-4000-8000-000000000${suffix}.png`;
 }
 for(const [suffix,title] of Object.entries({'201':'餐廳・留下的帳單','202':'田徑・練習後的休息','203':'文藝部・交出的手稿','204':'學生會・公務之後','205':'家人・升學的選擇','206':'車站・一起等雨'}))if(!c.assets.some(a=>a.id==='event-cg-'+suffix))c.assets.push({id:'event-cg-'+suffix,title,url:`/assets/authored/cg/00000000-0000-4000-8000-000000000${suffix}.png`,source:'',note:'內建 imagegen 原創事件情境插圖；相近題材事件共用，不是小說原圖。'});
 return c;
}
