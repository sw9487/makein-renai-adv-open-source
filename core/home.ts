import type {Content,GameState,StoryLine,Choice} from './types';
import {extraEvenings,type HomeEvening} from './home-stories';
export const evenings:HomeEvening[]=[
 {title:'餐桌上的另一副碗筷',scene:'玄關的燈還亮著。你才放下書包，就聽見廚房傳來瓷碗輕碰桌面的聲音。佳樹把湯勺放回鍋邊，探頭確認回來的人是你，才把另一副碗筷推到餐桌對面。她自己的飯也還沒動，旁邊壓著一本翻到一半的書。',speech:'哥哥大人，歡迎回來。先洗手吧，湯還熱著。今天有什麼事嗎？你在門口嘆了一口好長的氣。',choices:[
 ['放下手機，坐下來說說今天的事',2,'你把手機翻面放在桌角，從今天遇見的人說起。佳樹沒有追問你沒說的部分，只在你停頓時替你添了半碗湯。「原來如此。那哥哥大人自己呢？今天有好好吃午餐嗎？」你這才發現，她想知道的也包括你的事。'],
 ['問佳樹今天過得怎麼樣',3,'你反問她今天過得如何。佳樹握著湯勺的手停了一下，隨即講起和朋友討論午餐的小插曲。你沒有急著下結論，等她說完才接話。飯菜慢慢涼了，餐桌卻比剛才熱鬧。'],
 ['說自己有點累，約好明天再聊',0,'你告訴佳樹今天有些累，想先安靜吃飯。她點點頭，把電視聲音轉小。「那就明天。哥哥大人不可以把休息也忘掉喔。」你答應下次輪到自己洗碗，她這才笑著坐下。']
 ]},
 {title:'擦乾的碗與未講完的話',scene:'晚餐後，水槽裡還有兩只碗。佳樹捲起袖口，正想打開水龍頭；你站在客廳與廚房之間，手裡的手機才剛亮起通知。她看了一眼螢幕，又看向你，把乾淨的擦碗布掛到你伸手就能拿到的位置。',speech:'哥哥大人，今晚要不要幫忙擦碗？不用很久。佳樹也有一件想跟你說的事。',choices:[
 ['收起手機，和她一起整理',3,'你接過擦碗布，等佳樹把洗好的碗遞過來。她講起今天一件做得不順利的小事，你差點脫口說「下次小心」，最後改成問她打算怎麼辦。佳樹想了一會兒才回答。最後一只碗放上架子時，她已經有了自己的主意。'],
 ['先問她想說什麼',1,'你把手機鎖上，靠在流理臺旁聽她說。佳樹一邊沖水，一邊慢慢把事情補完整。「能說出來就好多了。」你伸手接住差點滑落的碗，提醒自己下次不能只站在旁邊。'],
 ['約好五分鐘後來幫忙',0,'你把要回的訊息縮成一句，設定了五分鐘提醒。鈴聲一響便走回廚房，佳樹把擦碗布遞給你。「有照約定回來，合格。」你擦好最後兩只碗，聽她從頭說起。']
 ]},
 {title:'客廳裡留著的位置',scene:'洗過澡回到客廳時，桌上多了一杯溫熱的飲料。佳樹盤腿坐在沙發的一端，膝上攤著筆記，卻沒有立刻翻頁。你在另一端坐下，她便把桌上的杯子向你推近一點。窗外偶爾傳來車聲，家裡終於安靜下來。',speech:'哥哥大人，明天出門前可以叫佳樹一聲嗎？有件東西怕你忘記帶。還有……今天是不是又只顧著別人的事了？',choices:[
 ['謝謝她，也問她有沒有需要幫忙的事',3,'你把明早的提醒記進手機，又問她有沒有需要幫忙的事。佳樹低頭看了看筆記，請你聽她把一段想法講順。你們試了兩遍，她終於滿意地闔上本子。「原來哥哥大人當聽眾很有用呢。」'],
 ['坦白今天有件事還沒想明白',2,'你說起今天讓自己在意的片刻，沒有把別人的秘密一併說出來。佳樹抱著杯子聽完，輕聲問：「哥哥大人希望下次怎麼做？」她沒有替你回答。你想了想，覺得明天可以先好好打聲招呼。'],
 ['互道晚安，準備休息',0,'你確認好明天要帶的東西，和佳樹互道晚安。她把你的杯子一起收走，提醒你別躺著看手機看到太晚。走到房門口時，你回頭補了一句謝謝；客廳傳來她輕快的回應。']
 ]}
];
evenings.push(...extraEvenings);
export function homeChance(date:string){return [0,6].includes(new Date(date+'T12:00:00Z').getUTCDay())?0.6:0.4;}
export function homeOffer(s:GameState){return s.flags.find(f=>f.startsWith(`home-offer:${s.date}:`));}
function rollHome(s:GameState){
 if(s.flags.includes(`home-rolled:${s.date}`))return;
 s.flags=s.flags.filter(f=>!/^home-(rolled|offer|evening):/.test(f)||f.includes(s.date));
 s.flags.push(`home-rolled:${s.date}`);
 const draw=()=>{s.seed=(Math.imul(1664525,s.seed)+1013904223)>>>0;return s.seed/4294967296;};
 if(draw()<homeChance(s.date)){
  const previous=s.flags.find(f=>f.startsWith('home-last:'));
  const last=previous?Number(previous.split(':')[1]):-1;
  const pool=evenings.map((_,i)=>i).filter(i=>i!==last);
  const index=pool[Math.floor(draw()*pool.length)];
  s.flags=s.flags.filter(f=>!f.startsWith('home-last:'));
  s.flags.push(`home-offer:${s.date}:${index}`,`home-last:${index}`);
 }
}
export function arriveHome(s:GameState,c:Content,choices=false) {
 const kaju=c.characters.find(ch=>ch.id==='kaju');
 if(!kaju)return false;
 s.character=kaju.id;
 if(!s.met.includes(kaju.id))s.met.push(kaju.id);
 rollHome(s);
 const offer=homeOffer(s);
 const e=offer?evenings[Number(offer.split(':').at(-1))]:undefined;
 if(choices&&!e)return false;
 if(!e){s.dialogue={speaker:kaju.name,kind:'home',text:'玄關的燈還亮著。佳樹聽見你回來，從客廳抬起頭，把手邊的東西放下。今晚沒有特別的安排，你可以坐下陪她聊聊，也可以先休息。',script:[{kind:'narration',text:'玄關的燈還亮著。佳樹聽見你回來，從客廳抬起頭，把手邊的東西放下。今晚沒有特別的安排，你可以坐下陪她聊聊，也可以先休息。'},{kind:'speech',speaker:kaju.name,text:'哥哥大人，歡迎回來。要喝水嗎？佳樹還在客廳，有事情可以慢慢說。'}]};return true;}
 const script:StoryLine[]=[{kind:'narration',text:`【${e.title}】\n${e.scene}`},{kind:'speech',speaker:kaju.name,text:e.speech}];
 s.dialogue={speaker:kaju.name,text:e.scene+'\n'+e.speech,script,kind:'home',choices:choices?e.choices.map(([text,delta,reply])=>({text,delta,reply} as Choice)):undefined};
 return true;
}
export function repairHomeArrival(s:GameState,c:Content) {
 if(!s.ended&&s.phase===2&&s.location==='home'&&s.dialogue.kind==='home'&&!s.dialogue.choices?.length&&!s.flags.includes(`home-rolled:${s.date}`)&&!s.flags.includes(`home-evening:${s.date}`))return arriveHome(s,c);
 if(s.ended||s.phase!==2||s.location!=='home'||s.character||s.dialogue.choices?.length||s.dialogue.text!=='回到家，手機螢幕亮了起來。睡前，要傳訊息給誰呢？')return false;
 return arriveHome(s,c);
}
