import type {Content,StoryEvent,StoryLine,Choice} from './types';

export const novelPackId='novel-volume-4-9-v1';
const n=(text:string):StoryLine=>({kind:'narration',text});
const say=(speaker:string,text:string):StoryLine=>({kind:'speech',speaker,text});
const option=(text:string,delta:number,reply:string):Choice=>({text,delta,reply});
export const novelSources=[
  {volume:4,page:'https://gagagabunko.jp/lineup/202210.html',book:'https://www.shogakukan.co.jp/books/09453094'},
  {volume:5,page:'https://gagagabunko.jp/lineup/202303.html',book:'https://www.shogakukan.co.jp/books/09453118'},
  {volume:6,page:'https://gagagabunko.jp/lineup/202312.html',book:'https://www.shogakukan.co.jp/books/09453164'},
  {volume:7,page:'https://gagagabunko.jp/lineup/202407.html',book:'https://www.shogakukan.co.jp/books/09453197'},
  {volume:8,page:'https://gagagabunko.jp/lineup/202505.html',book:'https://www.shogakukan.co.jp/books/09453242'},
  {volume:9,page:'https://gagagabunko.jp/lineup/202607.html',book:'https://www.shogakukan.co.jp/books/09453300'},
];
function event(volume:number,id:string,title:string,character:string,place:string,year:number,month:number,prerequisite:string,image:string,script:StoryLine[],choices:Choice[]):StoryEvent {
  const source=novelSources.find(s=>s.volume===volume)!;
  return {id,title,character,place,minYear:year,maxYear:year,month,minAffection:0,prerequisite,kind:'canon-inspired',repeatable:false,
    cg:`/assets/authored/${Number(image)<200?'backgrounds':'cg'}/00000000-0000-4000-8000-000000000${image}.png`,
    reference:`小說第${volume}卷；以小学館／ガガガ文庫公開內容簡介核對：${source.page}。書目與試讀入口：${source.book}。本事件為該卷情境的同人互動改編，台詞、選項、回應及具體觸發月份非原文；未宣稱重現整卷結局。配圖沿用本專案原創情境圖，非小說插圖。`,
    script,text:script.map(l=>l.kind==='speech'?`${l.speaker}：「${l.text}」`:l.text).join('\n\n'),choices};
}

export const novelEvents:StoryEvent[]=[
  event(4,'novel-confiscated-book','沒收書本與志喜屋的提議','shikiya','council',1,12,'anna-first','108',[
    n('接下文藝社部長的工作後，你很快發現，最難處理的未必是交不出的稿子。月之木學姊寫的真人題材同人本被學生會沒收，天愛星甚至打算把事情交到教師會議。'),
    n('你帶著需要說明的事情來到學生會室。要是只把責任推给已卸任的學姊，文藝社往後該如何管理稿件的問題也不會消失。'),
    say('志喜屋夢子','溫水……要拿回來？天愛星那邊……可以一起想辦法。'),
    n('志喜屋的說話速度一如往常，建議卻跳得很快。她似乎還藏著別的心思；八奈見先前的叮嚀又在你腦中響起，讓這場交涉更難單純看成公務。'),
    say('志喜屋夢子','你想……先跟她說什麼？'),
    n('桌上有一張空白便條。你得先決定，是用什麼立場開始這場談話，而不是急著照抄學姊意味不明的攻略。'),
  ],[
    option('先說清楚保管經過，再提出社內處理方式。',3,'志喜屋將便條推到你手邊，等你列出重點。你們先整理文藝社能負責的部分，約定正式向天愛星說明；書本是否歸還，仍留待交涉。'),
    option('請妳陪我去，但我想自己向天愛星解釋。',1,'她慢慢點頭，沒有替你接下所有話。你把要說的第一句練了一遍，才起身準備敲門。'),
    option('趁沒人注意，直接拿回來就好了。',-3,'志喜屋看了你一會兒，沒有起身。原本還能說明的問題，如果再加上一件偷偷取物，就更難讓天愛星相信你。'),
  ]),
  event(5,'novel-valentine-suspicion','手作巧克力，收件人不是哥哥？','kaju','home',1,2,'anna-first','109',[
    n('情人節將近，佳樹準備手作巧克力的消息，原本應該讓你安心。偏偏這次，你聽見的收件人似乎不是哥哥。文藝社眾人的反應很平靜，只有你越想越坐不住。'),
    n('檸檬還提出到桃園中學調查的主意。光想到要穿著不像自己的衣服出現在妹妹學校，你就覺得事情正朝難以解釋的方向發展。'),
    say('溫水佳樹','哥哥大人，從剛才就一直看著佳樹。有什麼想問的嗎？'),
    n('回到家，佳樹正在整理包裝材料。你看了一眼袋子，卻不能只憑一條緞帶，就替她決定正在喜歡誰。她把剪刀放下，耐心等你說話。'),
    say('溫水佳樹','哥哥如果想幫忙，可以先幫佳樹扶著這個盒子。'),
    n('你接住紙盒。原本想好的整套追問，忽然顯得比盒子本身還要沉。'),
  ],[
    option('我有點在意，不過想先聽妳自己說。',3,'佳樹笑了一下，讓你把盒子扶正。你坦白了不安，卻沒有逼她立刻交代所有事；她願意一邊整理，一邊慢慢和你聊。'),
    option('需要試吃或包裝的話，可以找我。',1,'佳樹立即替你分配了工作。你把注意力從猜測移到手邊的緞帶，餐桌上的氣氛終於輕鬆一些。'),
    option('收件人的名字現在就告訴我，不然不准送。',-3,'佳樹停下手，請你先把盒子放下。你把關心說成了命令，連原本可以自然聊起的話題都變得僵硬。'),
  ]),
  event(6,'novel-lemon-sprint','退部百米戰前的起跑線','lemon','track',1,3,'anna-first','103',[
    n('學長姐陸續畢業的春天，檸檬曾悄悄邀你約會。你還沒完全理清那份驚訝，眼前又出現更大的問題：你們竟然要用一場一百公尺勝負，面對她的退部決定。'),
    n('放學後，你走到跑道旁。遠看很短的一百公尺，站在起點卻長得讓人懷疑人生；檸檬正在檢查鞋帶，動作熟練得沒有多餘停頓。'),
    say('燒鹽檸檬','別只盯著終點看。還沒開始，你的肩膀就僵了。'),
    n('你不能假裝靠幾句漂亮話就能跑贏她，也不想把她的決定當成一時鬧脾氣。這場準備至少得從認真面對她開始。'),
    say('燒鹽檸檬','所以，今天要練什麼？你自己有想過嗎？'),
  ],[
    option('先看我的起跑吧，我想知道差在哪裡。',3,'檸檬蹲下來替你指出腳步的位置。你照著重跑一次，沒有假装自己立刻變快；她看出你願意認真練習，也收起了打趣的語氣。'),
    option('先暖身，再把這一百公尺完整跑一次。',1,'你們從熱身開始，把緊張拆成能做的動作。勝負還沒發生，但你終於踏上跑道，而不是站在旁邊空想。'),
    option('我反正贏不了，妳乾脆直接決定吧。',-4,'檸檬把計時器放下。她沒有嘲笑你的速度，只是問你，既然已經放棄，為什麼還要來到起點。'),
  ]),
  event(7,'novel-riko-revenge','白玉莉子的婚禮作戰提案','riko','club',2,4,'riko-first','102',[
    n('升上高二後，文藝社迎來小拔老師介紹的新生白玉莉子。你原以為新社員能讓社團遠離廢部危機，卻接著得知，這位看似乖巧的後輩正因惹出麻煩而停學。'),
    say('白玉莉子','學長，先別露出那種表情。我還沒把想拜託的事說完。'),
    n('她談起與婚禮有關的計畫，語氣平穩得像是在討論社刊排版。文藝社就這樣被捲進她的復仇作戰，連你手裡那張空白紙都像突然多了重量。'),
    say('白玉莉子','你會先聽我說完，還是只要知道我闖過禍，就已經決定答案了？'),
    n('她仍在微笑，手指卻扣住了紙角。你不必馬上答應她的所有提議，但也不能把這個人簡化成一份處分紀錄。'),
  ],[
    option('先說妳真正想完成的事，再一起想方法。',3,'莉子慢慢放開紙角。你沒有先答應潛入，也沒有直接把她趕走；她重新整理了說法，開始把期待與不甘分開說。'),
    option('把可能牽連誰寫出來，我們逐項討論。',1,'你在紙上畫出幾個欄位。莉子有些不情願，仍坐下來和你看哪些部分不能只憑衝動決定。'),
    option('新社員只要聽部長的，不要再添麻煩。',-4,'莉子的笑容變得客氣。她把沒說完的部分收了回去，你也失去了理解這份提案的機會。'),
  ]),
  event(8,'novel-tiara-election','天愛星的推薦人邀請','tiara','council',2,6,'anna-first','204',[
    n('學生會選舉的季節到了。天愛星準備競選會長，卻把推薦人的邀請交到你手上。身為文藝社部長，你下意識先算起自己還有多少空閒時間。'),
    say('馬剃天愛星','我知道你很忙。但這件事，我想先親自和你說。'),
    n('你原本打算委婉推辭，她卻比平常更堅持。偏偏八奈見又成了對手候選人的推薦人；熟悉的朋友忽然站到選舉兩邊，讓這份邀請多了一層重量。'),
    say('馬剃天愛星','不是要你把文藝社丟下。我想知道，你願不願意認真聽我的想法。'),
    n('她把資料放平，沒有立刻催你簽名。要不要支持一個人，不能只靠怕她失望，也不該只看自己的朋友站在哪一邊。'),
  ],[
    option('先談妳想改變什麼，再安排我能做的事。',4,'天愛星翻開資料，從最在意的問題開始說。你們把理念與能投入的時間一起列出來，讓支持有了具體內容，而不是一句隨口答應。'),
    option('讓我看完資料，今晚給妳明確答覆。',1,'她確認了時間，將資料交給你。你沒有讓她無限期等待，也替自己留下認真思考的空間。'),
    option('只要能贏八奈見，我支持誰都可以。',-3,'天愛星的手停在資料上。她問你是不是把選舉當成朋友間的較勁，剛才鼓起勇氣的邀請也冷了下來。'),
  ]),
  event(9,'novel-hida-trip','五人旅行，出發前的約定','koharu','station',2,8,'koharu-first','106',[
    n('水島小春想拉近與男友櫻井弘人的關係，你和八奈見因此被捲進旅行計畫。再加上兩人的青梅竹馬放虎原學姊，五個人要一起前往飛驒的溫泉地。'),
    n('出發前，你們在車站確認車次。小春很積極地談著行程，弘人則反覆查看時間；放虎原學姊和平常一樣從容，你卻隱約覺得有哪裡不同。'),
    say('水島小春','等到了那邊，如果有可以兩個人走走的時間……你會幫忙吧？'),
    n('她的期待很直接。但一份行程表上不只有兩個人的名字，你也不能假裝其他人只要照著安排離開，就不會有自己的感受。'),
    say('水島小春','我是不是看起來太急了？只是想讓這次旅行，有一點不一樣。'),
  ],[
    option('可以幫忙留空檔，但先確認弘人也想這麼安排。',3,'小春看向弘人的方向，點頭說會先問他。你們替行程留出彈性，讓一起旅行的人都能知道自己有哪些選擇。'),
    option('先上車吧，休息時大家再一起確認行程。',1,'她把車票收好，暫時不再往後安排。五個人一起走向月台，讓旅行先從沒有誰被落下的地方開始。'),
    option('我把其他人支開，你不用管他們怎麼想。',-3,'小春遲疑了一下，沒有接下這個保證。把同行的人當成障礙，讓原本期待的旅行聽起來忽然有些彆扭。'),
  ]),
];

export function addNovelEvents(c:Content):Content {
  if(c.storyPacks?.includes(novelPackId))return c;
  c.events=[...structuredClone(novelEvents.filter(e=>!c.events.some(old=>old.id===e.id))),...c.events];
  for(const e of novelEvents)if(!c.assets.some(a=>a.id===e.id+'-cg'))c.assets.push({id:e.id+'-cg',title:e.title+'・情境配圖',url:e.cg,source:'',note:'沿用專案既有原創場景／情境圖，非小說原圖。小說出處見事件 reference。'});
  c.storyPacks=[...(c.storyPacks??[]),novelPackId];
  return c;
}
