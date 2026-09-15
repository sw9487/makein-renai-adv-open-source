import type { Content } from "../core/types";
import { safeUrl } from "./repository";
import {socialSettings} from '../core/twitter';
export function validateContent(x: Content) {
  const assert = (ok: unknown, message: string) => {
    if (!ok) throw Error(message);
  };
  const str = (x: unknown, max = 6000) => typeof x === "string" && x.length <= max;
  assert(
    x &&
      Array.isArray(x.characters) &&
      Array.isArray(x.places) &&
      Array.isArray(x.events) &&
      Array.isArray(x.assets),
    "內容結構不正確。",
  );
  assert(
    x.characters.length > 0 &&
      x.characters.length <= 60 &&
      x.places.length > 0 &&
      x.places.length <= 50 &&
      x.events.length <= 500 &&
      x.assets.length <= 200,
    "內容數量超出範圍。",
  );
  const ids = (items: { id: string }[]) => {
    const values = items.map((i) => i.id);
    assert(
      values.every((id) => /^[a-z0-9-]{1,60}$/.test(id)) && new Set(values).size === values.length,
      "ID 必須是唯一的英文小寫、數字或連字號。",
    );
    return values;
  };
  const chars = ids(x.characters),
    places = ids(x.places);
  if(x.publicAccounts!==undefined){
    assert(Array.isArray(x.publicAccounts)&&x.publicAccounts.length<=80,'公眾帳號數量超出範圍。');
    const publicIds=ids(x.publicAccounts);
    assert(publicIds.every(id=>!chars.includes(id)),'公眾帳號 ID 不可與遊戲角色重複。');
    const handles=x.publicAccounts.map(account=>account.handle.toLowerCase());
    assert(new Set(handles).size===handles.length&&handles.every(handle=>!x.characters.some(ch=>socialSettings(ch).twitterHandle.toLowerCase()===handle)),'Twitter 帳號不可重複。');
    for(const account of x.publicAccounts){
      assert(str(account.name,80)&&!!account.name.trim()&&/^[A-Za-z0-9_]{1,15}$/.test(account.handle)&&str(account.bio,160)&&str(account.prompt,10000)&&/^#[0-9a-f]{6}$/i.test(account.color),'公眾帳號欄位不正確。');
      assert([account.avatar,account.cover??'',account.sourceUrl??''].every(value=>str(value,2000)&&safeUrl(value)),'公眾帳號圖片或來源網址無效。');
      assert(account.modules&&Object.keys(account.modules).every(key=>['promotion','civic','advisory','patrol','reporting','municipal'].includes(key))&&Object.values(account.modules).every(module=>module&&typeof module.enabled==='boolean'&&str(module.prompt,10000)),'公眾帳號能力設定不正確。');
    }
  }
  assert(new Set(x.characters.map(ch=>socialSettings(ch).twitterHandle.toLowerCase())).size===x.characters.length,'Twitter 帳號不可重複。');
  ids(x.events);
  ids(x.assets);
  assert(
    ["anna", "kaju", "kazuhiko"].every((id) => chars.includes(id)) &&
      ["cafe", "home", "classroom"].every((id) => places.includes(id)),
    "請保留開場角色與 cafe、home、classroom 場景。",
  );
  for (const c of x.characters) {
    if(c.social?.twitterActivity!==undefined)assert(['low','medium','high'].includes(c.social.twitterActivity),'Twitter 上線頻率須為低、中或高。');
    if(c.social?.twitterFollowBack!==undefined)assert(typeof c.social.twitterFollowBack==='boolean','Twitter 主動回追設定須為布林值。');
    if(c.social?.twitterBio!==undefined)assert(typeof c.social.twitterBio==='string'&&c.social.twitterBio.trim().length<=160,'Twitter 個人簡介不可超過 160 字。');
    if(c.social?.twitterCover!==undefined)assert(str(c.social.twitterCover,2000)&&safeUrl(c.social.twitterCover),'Twitter 封面圖片網址無效。');
    if(c.social){assert([c.social.lineAffection,c.social.twitterAffection].every(n=>Number.isInteger(n)&&n>=0&&n<=100)&&typeof c.social.twitterPrivate==='boolean'&&/^[A-Za-z0-9_]{1,15}$/.test(c.social.twitterHandle),'社群設定：好感度須為 0–100，帳號須為 1–15 個英數或底線。');}
    if(c.roles!==undefined) assert(Array.isArray(c.roles)&&c.roles.length<=30&&c.roles.every(t=>Number.isInteger(t.year)&&t.year>=1&&t.year<=3&&Number.isInteger(t.month)&&t.month>=1&&t.month<=12&&(t.day===undefined||(Number.isInteger(t.day)&&t.day>=1&&t.day<=new Date(Date.UTC(2001,t.month,0)).getUTCDate()))&&str(t.role,160)&&str(t.note,2000)),'職務交接資料不正確。');
    if(c.imageNote!==undefined) assert(str(c.imageNote,1000),'圖片說明過長。');
    for(const crop of [c.avatarCrop,c.spriteCrop]) if(crop) {
      assert((['x','y','width','height','imageWidth','imageHeight'] as const).every(key=>Number.isFinite(crop[key]) && crop[key]>=0 && crop[key]<=20000) && crop.width>0 && crop.height>0 && crop.imageWidth>0 && crop.imageHeight>0 && crop.x+crop.width<=crop.imageWidth && crop.y+crop.height<=crop.imageHeight,'裁切範圍必須在原圖尺寸內。');
      if(crop.outline) assert(Array.isArray(crop.outline)&&crop.outline.length>=6&&crop.outline.length<=100&&crop.outline.length%2===0&&crop.outline.every((n,i)=>Number.isFinite(n)&&n>=0&&n<=(i%2?crop.imageHeight:crop.imageWidth)),'多邊形裁切座標不正確。');
    }
    if (c.avatar !== undefined) assert(str(c.avatar, 2000) && safeUrl(c.avatar), '頭像網址無效。');
    if (c.timeline) {
      const t = c.timeline;
      assert(['tsuwabuki', 'middle', 'ayame', 'staff', 'outside'].includes(t.school) &&
        Number.isInteger(t.baseGrade) && t.baseGrade >= 0 && t.baseGrade <= 3 &&
        Number.isInteger(t.debutYear) && t.debutYear >= 1 && t.debutYear <= 3 &&
        Number.isInteger(t.debutMonth) && t.debutMonth >= 1 && t.debutMonth <= 12 && str(t.note, 2000), '年級與登場時間不正確。');
    }
    assert(
      str(c.name, 80) &&
        str(c.reading, 100) &&
        str(c.role, 100) &&
        str(c.bio) &&
        str(c.prompt) &&
        typeof c.romance === "boolean" &&
        (c.gender===undefined||['male','female','unspecified'].includes(c.gender)) &&
        Number.isInteger(c.year) &&
        c.year >= -1 &&
        c.year <= 3,
      "角色欄位不正確。",
    );
    assert(/^#[0-9a-f]{6}$/i.test(c.color), "角色顏色須為六碼色碼。");
    assert(
      c.sprites && Object.keys(c.sprites).length <= 32 && str(c.sprites.normal, 2000),
      "角色需要 normal 立繪欄位。",
    );
    for (const url of Object.values(c.sprites))
      assert(str(url, 2000) && safeUrl(url), "立繪請使用 HTTPS 網址或 /assets/ 路徑。");
    assert(str(c.source, 2000) && safeUrl(c.source), "來源網址無效。");
  }
  for (const p of x.places) {
    if(p.campus!==undefined)assert(['tsuwabuki','middle'].includes(p.campus),'學校別不正確。');
    assert(
      str(p.name, 100) &&
        str(p.subtitle, 300) &&
        typeof p.school === "boolean" &&
        str(p.background, 2000) &&
        safeUrl(p.background),
      "場景欄位不正確。",
    );
    assert(
      p.weights &&
        Object.entries(p.weights).every(
          ([id, w]) => chars.includes(id) && Number.isFinite(w) && w >= 0 && w <= 1000,
        ),
      "角色權重須介於0–1000。",
    );
  }
  for (const e of x.events) {
    if(e.requiredEvents!==undefined)assert(Array.isArray(e.requiredEvents)&&e.requiredEvents.length<=100&&e.requiredEvents.every(id=>str(id,100)),'事件前置清單不正確。');
    if(e.maxYear!==undefined)assert(Number.isInteger(e.maxYear)&&e.maxYear>=e.minYear&&e.maxYear<=3,'事件結束學年不正確。');
    if(e.script!==undefined) assert(Array.isArray(e.script)&&e.script.length<=100&&e.script.every(line=>['narration','speech','thought'].includes(line.kind)&&str(line.text,10000)&&(line.speaker===undefined||str(line.speaker,100))),'劇情分鏡格式不正確。');
    assert(chars.includes(e.character) && places.includes(e.place), "事件角色或場景不存在。");
    assert(
      str(e.title, 200) && str(e.text) && str(e.reference, 2000) && str(e.prerequisite, 100),
      "事件文字格式不正確。",
    );
    assert(
      ["original", "canon-inspired"].includes(e.kind) && typeof e.repeatable === "boolean",
      "事件類型不正確。",
    );
    assert(
      Number.isInteger(e.month) &&
        e.month >= 0 &&
        e.month <= 12 &&
        Number.isInteger(e.minYear) &&
        e.minYear >= 1 &&
        e.minYear <= 3 &&
        Number.isFinite(e.minAffection) &&
        e.minAffection >= 0 &&
        e.minAffection <= 100,
      "事件觸發條件不正確。",
    );
    assert(
      Array.isArray(e.choices) && e.choices.length >= 2 && e.choices.length <= 6,
      "事件需要2–6個選項。",
    );
    for (const ch of e.choices)
      assert(
        str(ch.text, 500) &&
          str(ch.reply) &&
          Number.isFinite(ch.delta) &&
          ch.delta >= -20 &&
          ch.delta <= 20 &&
          (ch.flag === undefined || str(ch.flag, 100)) &&
          (ch.intent === undefined || ch.intent === 'listen'),
        "選項好感變動須介於-20–20。",
      );
    assert(str(e.cg, 2000) && safeUrl(e.cg), "CG 網址無效。");
  }
  const s = x.settings;
  assert(s && str(s.town, 80) && str(s.systemPrompt, 10000), "系統設定不正確。");
  const date = (d: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(d) &&
    Number.isFinite(Date.parse(d)) &&
    new Date(d).toISOString().slice(0, 10) === d;
  assert(
    date(s.startDate) &&
      date(s.graduationDate) &&
      s.graduationDate > s.startDate &&
      s.graduationDate.slice(5, 7) === "03",
    "請設定有效日期，畢業月份須為三月。",
  );
  const startYear = Number(s.startDate.slice(0, 4)) - (Number(s.startDate.slice(5, 7)) < 4 ? 1 : 0);
  assert(Number(s.graduationDate.slice(0, 4)) === startYear + 3, "畢業年份必須是高一入學年度加3。");
  assert(
    Number.isFinite(s.encounterRate) &&
      s.encounterRate >= 0 &&
      s.encounterRate <= 1 &&
      Number.isInteger(s.memoryChars) &&
      s.memoryChars >= 400 &&
      s.memoryChars <= 6000 &&
      Number.isInteger(s.recentTurns) &&
      s.recentTurns >= 2 &&
      s.recentTurns <= 20,
    "機率或記憶預算超出範圍。",
  );
  for (const a of x.assets)
    assert(
      str(a.title, 200) &&
        str(a.note, 1000) &&
        str(a.url, 2000) &&
        safeUrl(a.url) &&
        str(a.source, 2000) &&
        safeUrl(a.source),
      "素材欄位不正確。",
    );
  // Drop unknown imported fields instead of accidentally publishing private metadata.
  if(x.defaultOverrides!==undefined)assert(Array.isArray(x.defaultOverrides)&&x.defaultOverrides.length<=5000&&x.defaultOverrides.every(key=>typeof key==='string'&&/^(characters|publicAccounts|places|events|assets)\.[a-z0-9-]+\.[a-zA-Z0-9_.-]+$/.test(key)),'Invalid default override key.');
  if(x.storyPacks!==undefined)assert(Array.isArray(x.storyPacks)&&x.storyPacks.length<=100&&x.storyPacks.every(id=>typeof id==='string'&&/^[a-z0-9-]{1,100}$/.test(id)),'劇情包標記不正確。');
  const pick = <T extends object>(item: T, keys: readonly (keyof T)[]) =>
    Object.fromEntries(keys.map((key) => [key, item[key]])) as T;
  return {
    ...(x.storyPacks?{storyPacks:[...x.storyPacks]}:{}),
    ...(x.defaultOverrides?{defaultOverrides:[...new Set(x.defaultOverrides)]}:{}),
    ...(x.publicAccounts?{publicAccounts:x.publicAccounts.map(account=>({id:account.id,name:account.name,handle:account.handle,bio:account.bio,color:account.color,avatar:account.avatar,cover:account.cover??'',sourceUrl:account.sourceUrl??'',prompt:account.prompt,modules:account.modules}))}:{}),
    characters: x.characters.map((c) =>
      pick(c, [
        "id",
        "name",
        "reading",
        "color",
        "role",
        "bio",
        "prompt",
        "sprites",
        "romance",
        "gender",
        "year",
        "source",
        "avatar",
        "avatarCrop",
        "spriteCrop",
        "imageNote",
        "roles",
        "timeline",
        "social",
      ]),
    ),
    places: x.places.map((p) =>
      pick(p, ["id", "name", "subtitle", "background", "weights", "school", "campus"]),
    ),
    events: x.events.map((e) => ({
      ...pick(e, [
        "id",
        "title",
        "character",
        "place",
        "month",
        "minYear",
        "maxYear",
        "minAffection",
        "prerequisite",
        "requiredEvents",
        "kind",
        "reference",
        "text",
        "cg",
        "repeatable",
      ]),
      choices: e.choices.map((c) => pick(c, ["text", "delta", "reply", "flag", "intent"])),
      ...(e.script ? {script:e.script.map(line=>pick(line,['kind','speaker','text']))} : {}),
    })),
    assets: x.assets.map((a) => pick(a, ["id", "title", "url", "source", "note"])),
    settings: pick(x.settings, [
      "town",
      "startDate",
      "graduationDate",
      "encounterRate",
      "systemPrompt",
      "memoryChars",
      "recentTurns",
    ]),
  } as Content;
}
