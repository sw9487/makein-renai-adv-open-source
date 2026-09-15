import type { Content, GameState, Memory, StoryEvent, Choice } from "./types";
import { characterAvailable,encounterWeights,roleLabel } from './timeline';
import {socialSettings,twitterState} from './twitter';
import {socialAppEnabled} from './social-apps';
import {arriveHome,homeOffer} from './home';
import {schoolCalendar,schoolClosed,schoolUnavailable} from './calendar';
export const phases = ["白天", "放學後", "夜晚"];
/** Days without regular classes use morning/afternoon instead of school-time labels. */
export const dayPhaseNames = (date: string) => (schoolClosed(date) ? ["上午", "午後", "夜晚"] : phases);
export const academicYear = (date: string) =>
  Number(date.slice(0, 4)) - (Number(date.slice(5, 7)) < 4 ? 1 : 0);
export const grade = (s: GameState, c: Content) =>
  academicYear(s.date) - academicYear(c.settings.startDate) + 1;
export const weekend = (date: string) => [0, 6].includes(new Date(date + "T12:00:00Z").getUTCDay());
export const schoolTime = (s: GameState) => s.phase === 0 && !schoolClosed(s.date);
export const emptyMemory = (): Memory => ({
  summary: "",
  facts: [],
  recent: [],
  turns: 0,
});
export function remember(s: GameState, id: string, fact: string) {
  const m = (s.memories[id] ??= emptyMemory());
  m.important??=[];
  if(!m.important.some(item=>item.kind==='event'&&item.text===fact))
    m.important.push({kind:'event',text:fact,date:s.date,phase:s.phase,channel:'scene',evidence:fact});
  if (!m.facts.includes(fact)) m.facts = [...m.facts, fact].slice(-24);
}
export function log(s: GameState, speaker: string, text: string) {
  s.log = [...s.log, { date: s.date, speaker, text }].slice(-180);
}
export function narrate(s: GameState, text: string, speaker = "旁白") {
  s.dialogue = { speaker, text };
  log(s, speaker, text);
}
export function random(s: GameState) {
  s.seed = (Math.imul(1664525, s.seed) + 1013904223) >>> 0;
  return s.seed / 4294967296;
}
export function createGame(c: Content, seed = Date.now() >>> 0): GameState {
  const s: GameState = {
    version: 1,
    socialApps: {line:true,twitter:true},
    revision: 0,
    date: c.settings.startDate,
    phase: 1,
    location: "cafe",
    character: "anna",
    affection: {},
    met: ["anna", "kaju"],
    contacts: ["kaju"],
    memories: {},
    completed: [],
    flags: [],
    gallery: [],
    log: [],
    messages: {},
    dialogue: { speaker: "旁白", text: "" },
    ended: false,
    ending: "",
    route: "",
    seenEndings: [],
    seed,
  };
  twitterState(s,c);
  const event = c.events.find((e) => e.id === "anna-first");
  if (event) openEvent(s, c, event);
  else narrate(s, "期末考結束的午後，你推開了家庭餐廳的門。");
  return s;
}
export function openEvent(s: GameState, c: Content, e: StoryEvent) {
  s.character = e.character;
  if (!s.met.includes(e.character)) s.met.push(e.character);
  s.dialogue = {
    speaker: "旁白",
    text: e.text,
    script: e.script,
    eventId: e.id,
    choices: e.choices,
    kind: e.kind,
    cg: e.cg,
  };
  log(s, "事件・" + e.title, e.text);
}
export function eventEligible(s: GameState, c: Content, e: StoryEvent) {
  const character = c.characters.find(ch=>ch.id===e.character);
  const place = c.places.find(p=>p.id===e.place);
  const school = place?.school ? (place.campus==='middle'?'middle':true) : false;
  if (!character || !characterAvailable(character,s,c,school) || (school && schoolUnavailable(s.date))) return false;
  if(e.place==='council'&&character.timeline?.school!=='staff'&&(!roleLabel(character,s,c).includes('學生會')||roleLabel(character,s,c).startsWith('前')))return false;
  return (
    (e.repeatable || !s.completed.includes(e.id)) &&
    e.place === s.location &&
    (!e.month || e.month === Number(s.date.slice(5, 7))) &&
    grade(s, c) >= e.minYear &&
    (e.maxYear===undefined||grade(s,c)<=e.maxYear) &&
    (s.affection[e.character] ?? 0) >= e.minAffection &&
    (!e.prerequisite || s.flags.includes(e.prerequisite) || s.completed.includes(e.prerequisite)) &&
    (e.requiredEvents ?? []).every(id => s.completed.includes(id)) &&
    (!e.id.endsWith("-route") || !s.route)
  );
}
export function weightedPick(
  s: GameState,
  c: Content,
  weights: Record<string, number>,
  school = false,
) {
  const entries = encounterWeights(s,c,weights,school).filter(row=>row.effectiveWeight>0).map(row=>[row.id,row.effectiveWeight] as const);
  const total = entries.reduce((n, [, w]) => n + w, 0);
  if (total <= 0) return "";
  let r = random(s) * total;
  for (const [id, w] of entries) {
    r -= w;
    if (r < 0) return id;
  }
  return entries.at(-1)?.[0] ?? "";
}
export function getEnding(s: GameState, c: Content) {
  const id = s.route;
  const ch = c.characters.find((x) => x.id === id && x.romance);
  if (ch && (s.affection[id] ?? 0) >= 75 && s.flags.includes(`${id}-trust`))
    return {
      id: `love:${id}`,
      text: `${ch.name}・春天之後也一起走\n畢業典禮結束，你們沒有急著道別。那些餐桌旁、走廊上與訊息裡累積的小事，終於成了約好再見的理由。這不是誰輸誰贏的結局，而是你們共同選擇的下一頁。`,
    };
  if (ch)
    return {
      id: `bittersweet:${id}`,
      text: `${ch.name}・尚未寄出的那句話\n畢業那天，你們交換了祝福。心意曾經靠得很近，卻沒有走到最後。留下的回憶仍然真實；未來的故事，就留給未來的自己。`,
    };
  const friends = c.characters.filter((x) => x.romance && (s.affection[x.id] ?? 0) >= 30);
  return friends.length >= 3
    ? {
        id: "friendship",
        text: "文藝社・下一本社刊再見\n你不是獨自走出校門的。書稿、笑聲和那些不太順利的戀愛，讓這三年成了值得珍惜的日常。你們約好下次聚會，誰也不准缺席。",
      }
    : {
        id: "ordinary",
        text: "溫水和彥・屬於自己的下一頁\n春風吹過畢業證書。沒有轟轟烈烈的告白，但你已經不是那個只在旁邊看故事的人。收好手機，你踏上新的路。",
      };
}
export function tick(s: GameState, c: Content) {
  s.character = "";
  s.phase++;
  if (s.phase > 2) {
    s.phase = 0;
    const d = new Date(s.date + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    s.date = d.toISOString().slice(0, 10);
  }
  if (s.date >= c.settings.graduationDate) {
    s.date = c.settings.graduationDate;
    s.ended = true;
    const end = getEnding(s, c);
    s.ending = end.id;
    if (!s.seenEndings.includes(end.id)) s.seenEndings.push(end.id);
    narrate(s, end.text, "畢業・同人結局");
    return;
  }
  if (s.phase === 0) {
    const calendar=schoolCalendar(s.date);
    s.location = calendar.schoolOpen ? "classroom" : "home";
    narrate(
      s,
      calendar.schoolOpen
        ? calendar.openingDay?"今天是開學日。熟悉的校舍重新熱鬧起來，新學期開始了。":"今天是上課日。窗外的雲慢慢飄過，課本翻到了下一頁。"
        : `今天是${calendar.label}，沒有一般課程。想去哪裡？`,
    );
    if (!calendar.schoolOpen) s.dialogue.navigation = 'map';
    if (calendar.schoolOpen && random(s) < 0.75) {
      const candidates=c.characters.filter(ch=>ch.id!=='kazuhiko'&&characterAvailable(ch,s,c,true));
      if(candidates.length){
        const ch=candidates[Math.floor(random(s)*candidates.length)];
        s.character=ch.id;
        if(!s.met.includes(ch.id))s.met.push(ch.id);
        s.dialogue={speaker:ch.name,kind:'original',choiceMode:'contextual',text:`課間休息時，你在走廊遇見了${ch.name}。\n\n「溫水同學，下一堂課開始前，稍微聊一下吧。」`,choices:[
          {text:'聊聊今天的課程。',delta:2,reply:'你們交換了對課程的想法，話題又繞到最近的校園日常。預備鐘響起，你們約好有空再聊，各自回去上課。'},
          {text:'問問對方最近過得如何。',delta:2,reply:'你停下腳步，認真聽完對方最近遇到的小事。直到預備鐘響起，你們才道別回去上課。'},
          {text:'打聲招呼，先回教室。',delta:0,reply:'你們簡短地打了招呼，各自回到接下來的課程。'},
        ]};
        log(s,ch.name,s.dialogue.text);
      }
    }
  } else if (s.phase === 2) {
    s.location = "home";
    narrate(s, "回到家，手機螢幕亮了起來。睡前，要傳訊息給誰呢？");
    arriveHome(s,c);
    const ids = s.contacts.filter((id) => id !== "kaju");
    if (ids.length && random(s) < 0.4) {
      const id = ids[Math.floor(random(s) * ids.length)];
      (s.messages[id] ??= []).push({
        from: id,
        text: "今天辛苦了。有空再聊聊最近的事情吧。",
        date: s.date,
      });
      s.messages[id] = s.messages[id].slice(-100);
    }
  } else {
    narrate(s, schoolClosed(s.date) ? "下午還有一些時間。接下來想去哪裡？" : "下課鐘響了。離回家還有一些時間，去熟悉的地方看看吧。");
    s.dialogue.navigation = 'map';
  }
}
function choose(s: GameState, c: Content, index: number) {
  const choices = s.dialogue.choices;
  if (!choices || !Number.isInteger(index) || !choices[index])
    throw Error("這個選項已失效，請重新整理。");
  const selected: Choice = choices[index];
  const id = s.character;
  const name = c.characters.find((x) => x.id === id)?.name ?? "旁白";
  s.affection[id] = Math.max(0, Math.min(100, (s.affection[id] ?? 0) + selected.delta));
  if (selected.flag && !s.flags.includes(selected.flag)) {
    if (selected.flag.startsWith("route:")) {
      if (!c.characters.find(ch=>ch.id===id)?.romance) throw Error('這位角色僅開放友情或家人羈絆。');
      if (s.route && s.route !== id) throw Error("已經進入另一條戀愛路線。");
      s.route = id;
    }
    s.flags.push(selected.flag);
  }
  const e = c.events.find((x) => x.id === s.dialogue.eventId);
  if (e) {
    if (!s.completed.includes(e.id)) s.completed.push(e.id);
    if (e.cg && !s.gallery.includes(e.id)) s.gallery.push(e.id);
    remember(s, id, `${s.date} ${e.title}：溫水選擇「${selected.text}」。`);
  } else remember(s, id, `${s.date}：溫水${selected.text}`);
  log(s, "溫水和彥", selected.text);
  if(s.dialogue.kind==='chat'){
    const memory=s.memories[id]??=emptyMemory();
    const stamp={date:s.date,phase:s.phase,channel:'talk' as const};
    memory.recent.push({role:'user',content:selected.text,...stamp},{role:'assistant',content:selected.reply,...stamp});
    compactMemory(memory,c.settings.memoryChars,c.settings.recentTurns);
  }
  narrate(s, selected.reply, '旁白');
}
export type Action = {
  type: string;
  place?: string;
  index?: number;
  character?: string;
  days?: number;
};
export function act(previous: GameState, c: Content, a: Action): GameState {
  const s = structuredClone(previous);
  if (s.ended) throw Error("故事已畢業，請讀取存檔或開始新故事。");
  if (s.dialogue.choices?.length && a.type !== "choose") throw Error("請先完成眼前的選擇。");
  switch (a.type) {
    case 'home-evening': {
      if(s.phase!==2||s.location!=='home'||s.character!=='kaju')throw Error('回家後才能和佳樹共度晚間日常。');
      const flag=`home-evening:${s.date}`;
      if(s.flags.includes(flag))throw Error('今晚已經一起度過日常了，可以繼續聊天或休息。');
      if(!homeOffer(s))throw Error('今晚沒有特別的日常事件，仍可和佳樹直接聊天。');
      if(!arriveHome(s,c,true))throw Error('找不到佳樹的角色資料。');
      s.flags.push(flag);
      break;
    }
    case "choose":
      choose(s, c, a.index ?? -1);
      break;
    case "advance":
      tick(s, c);
      break;
    case "skip": {
      if (!Number.isInteger(a.days) || a.days! < 1 || a.days! > 30)
        throw Error("快轉範圍為1–30天。");
      const target = new Date(s.date + "T12:00:00Z");
      target.setUTCDate(target.getUTCDate() + a.days!);
      const end = target.toISOString().slice(0, 10);
      while (s.date < end && !s.ended) {
        tick(s, c);
        if (s.dialogue.choices?.length) break;
        if (s.phase === 1) {
          const e = c.events.find(
            (e) =>
              e.month &&
              s.met.includes(e.character) &&
              eventEligible({ ...s, location: e.place }, c, e),
          );
          if (e) {
            s.location = e.place;
            openEvent(s, c, e);
            break;
          }
        }
      }
      break;
    }
    case "visit": {
      if (schoolTime(s)) throw Error("平日白天請先完成課程。");
      if (s.phase === 2) throw Error("夜晚已回家，請使用LINE或休息。");
      if (s.flags.includes(`visited:${s.date}:${s.phase}`))
        throw Error("這個時段已探索，請推進時間。");
      const p = c.places.find((p) => p.id === a.place);
      if (!p) throw Error("找不到場景。");
      if (schoolUnavailable(s.date) && p.school) throw Error("今天校舍休息，請選擇校外場景。");
      s.location = p.id;
      s.flags = s.flags
        .filter((f) => !f.startsWith("visited:"))
        .concat(`visited:${s.date}:${s.phase}`);
      const e = c.events.find(
        (e) =>
          eventEligible(s, c, e),
      );
      if (e) {
        openEvent(s, c, e);
        break;
      }
      const id =
        random(s) <= c.settings.encounterRate ? weightedPick(s, c, p.weights, p.school) : "";
      s.character = id;
      if (!id) {
        narrate(s, "這裡今天很安靜。你在附近待了一會兒，沒有遇見熟悉的人。");
        break;
      }
      if (!s.met.includes(id)) s.met.push(id);
      const ch = c.characters.find((x) => x.id === id)!;
      const lines: Record<string, string> = {
        anna: "「溫水同學，你看起來很閒嘛！剛好，我有一件非常重要的事……今天的點心要選哪個？」",
        lemon: "「喲，溫水！今天風很舒服，要不要一起走走？」",
        komari: "「你、你又來了……那個，這本書，你看過嗎？」",
        shikiya: "「溫水……幫我一下。嗯……先坐著，也可以。」",
        tiara: "「溫水同學，今天沒有忘記該交的東西吧？……不用那麼緊張。」",
        kaju: "「哥哥大人，今天在學校過得如何呢？」",
      };
      s.dialogue = {
        speaker: ch.name,
        text: lines[id] ?? `「溫水同學，剛好遇見你。今天過得怎麼樣？」`,
        kind: "original",
        choices: [
          {
            text: "留下來，認真聽對方說話。",
            intent: 'listen',
            delta: 2,
            reply: "話題從今天的小事開始。回過神來，原本陌生的距離已經近了一點。",
          },
          {
            text: "分享自己今天發現的一件小事。",
            delta: 1,
            reply: "你們交換了幾句日常，約好有空再聊。",
          },
          {
            text: "有點心不在焉，草草結束話題。",
            delta: -1,
            reply: "對方停了一下，向你道了別。",
          },
        ],
      };
      log(s, ch.name, s.dialogue.text);
      break;
    }
    case "contact": {
      if (!socialAppEnabled(s,'line')) throw Error('LINE 已停用。');
      const id = s.character;
      if (!id || !s.met.includes(id)) throw Error("請先在場景裡認識角色。");
      if (s.contacts.includes(id)) throw Error("已交換LINE。");
      const required=socialSettings(c.characters.find(ch=>ch.id===id)!).lineAffection;
      if ((s.affection[id] ?? 0) < required) throw Error(`還不太熟悉，再累積一點信任吧（好感度${required}）。`);
      s.contacts.push(id);
      remember(s, id, `${s.date} 與溫水交換LINE。`);
      (s.messages[id] ??= []).push({
        from: 'system',
        text: `您與 ${c.characters.find(ch=>ch.id===id)!.name} 成為了朋友`,
        date: s.date,
      });
      narrate(s, "你們交換了LINE。新的聊天室出現在手機裡。");
      break;
    }
    default:
      throw Error("未知操作。");
  }
  s.flags = s.flags.filter((f) => !f.startsWith("chat:") || f.includes(s.date));
  s.revision++;
  return s;
}
/**
 * Convert a stored memory message into plain prose before it reaches the model.
 * Older records were saved as raw JSON (`{"speech":…,"narration":…}`, `{"scene":[…]}`),
 * which the model would imitate and echo field names such as `"narration"` into
 * speech. New messages are already plain text; this also rescues legacy JSON rows.
 */
export function memoryText(content:string):string {
 if(!content.startsWith('{'))return content;
 let j:any;try{j=JSON.parse(content);}catch{return content;}
 if(Array.isArray(j.scene))return j.scene.map((l:any)=>l.kind==='speech'?`${l.speaker??'旁白'}：「${l.text}」`:l.text).join('\n\n');
 if(j.speech!==undefined||j.reply!==undefined||j.narration!==undefined){
   const voice=typeof j.speech==='string'?j.speech:(typeof j.reply==='string'?j.reply:'');
   const narr=typeof j.narration==='string'?j.narration:'';
   return [voice, narr?`（旁白：${narr}）`:''].filter(Boolean).join('\n');
 }
 return content;
}
export function compactMemory(m: Memory, maxChars: number, recentTurns: number) {
  const overflow = m.recent.splice(0, Math.max(0, m.recent.length - recentTurns));
  if (overflow.length) {
    m.archive=[...(m.archive??[]),...overflow].slice(-200);
    const extracts = overflow
      .map((t) => t.channel==='twitter'&&t.social
        ? JSON.stringify({date:t.date,phase:t.phase,channel:'twitter',...t.social,content:memoryText(t.content)})
        : `[${t.date??'日期未記錄'} ${t.date&&t.phase!==undefined?dayPhaseNames(t.date)[t.phase]:''} ${t.channel??'管道未記錄'}]${t.channel==='twitter'?'Twitter（舊記憶，發言者未識別）':t.role === "user" ? "溫水" : "自己"}:${memoryText(t.content)}`)
      .join("；");
    m.summary = (m.summary + "\n" + extracts).slice(-maxChars);
  }
  m.summary = m.summary.slice(-maxChars);
  m.facts = m.facts.slice(-24);
  return m;
}
