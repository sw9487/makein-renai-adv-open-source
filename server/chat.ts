import {characterContext,visibleScene} from './character-context';
import {importantMemoryView} from './memory-view';
import {modelFetch,ModelError} from './model-runtime';
import {timed} from './timings';
import {apiFetch} from './api-fetch';
import type { Content, GameState } from "../core/types";
import { apiSettings, validateApiUrl } from "./repository";
import { compactMemory, emptyMemory, grade, log, memoryText, random } from "../core/engine";
import { characterAvailable, schoolLabel } from '../core/timeline';
import { parseCharacterReply, characterTool, choiceTool, characterExpressions, characterActionKinds, type CharacterReply } from './character-tool';
import { currentProfile } from '../core/timeline';
import {appendConversation} from '../core/dialogue';
import {streamCharacter} from './character-stream';
import {knowledgeContext} from './knowledge';
import {searchContext} from './web-search';
import {sceneContext,sceneTimePrompt} from './scene-context';
import {requestImage,type ImageResult} from './stable-diffusion';
import {conversationMemoryMessages,reliableMemorySummary,socialMemoryContext} from './memory-context';
import {configuredPrompt,prompt} from './prompt';
import {shuffleChoices} from '../core/choices';
import {canReadTwitter,twitterBlocked,twitterState} from '../core/twitter';
import {executeCharacterActions} from './character-actions';
import {lineReceiptContext} from '../core/line-inbox';
import {socialAppEnabled} from '../core/social-apps';
export async function converse(
  state: GameState,
  c: Content,
  id: string,
  text: string,
  channel: string,
  action: string = '',
  onPartial?: (reply:CharacterReply)=>void,
  signal?: AbortSignal,
  lineMessagePersisted=false,
) {
  const s = structuredClone(state);
  if (s.ended) throw Error("故事已結束。");
  if (channel !== 'line' && s.dialogue.choices?.length) throw Error("請先完成事件選擇。");
  const playerAction = action.trim();
  text=text.trim();
  const userContent = channel === 'line'
    ? text
    : [
        playerAction ? prompt('chat.playerAction',{action:playerAction}) : '',
        text ? prompt('chat.playerLine',{text}) : '',
      ].filter(Boolean).join('\n') || text;
  const character = c.characters.find((ch) => ch.id === id);
  if (!character || id === "kazuhiko" || !s.met.includes(id)) throw Error("尚未認識這個角色。");
  if (!characterAvailable(character,s,c)) throw Error('尚未到這位角色的登場時間。');
  if (channel === "line" && !s.contacts.includes(id)) throw Error("尚未交換LINE。");
  if (channel !== "line" && s.character !== id) throw Error("對方目前不在現場。");
  // Weekday daytime encounters happen during recess; a present character can chat.
  const m = (s.memories[id] ??= emptyMemory());
  const settings = await apiSettings();
  const faceToFace=channel==='line'&&s.character===id;
  let imageResult:ImageResult={};
  let reply = "";
  let mode = "offline";
  let performance:CharacterReply={speech:'',narration:'',thought:null};
  const availableExpressions=channel==='line'?['normal']:characterExpressions.filter(key=>!!character.sprites[key]);
  const twitterEnabled=socialAppEnabled(s,'twitter');
  const lineEnabled=socialAppEnabled(s,'line')&&s.contacts.includes(id);
  // A LINE turn already has exactly one user-visible LINE response. Exposing
  // line_message here made the model repeat that response as a delayed action
  // (and generate a second image) after the main reply had committed. Keep
  // line_message for face-to-face talk, where it is genuinely cross-channel.
  const availableActions=characterActionKinds.filter(kind=>kind==='line_message'?channel!=='line'&&lineEnabled:twitterEnabled);
  const twitter=twitterEnabled?twitterState(s,c):undefined;
  const twitterAccounts=twitter?Object.entries(twitter.accounts).filter(([accountId])=>accountId!==id):[];
  const mentionableFriends=twitter?twitterAccounts.filter(([accountId])=>!!twitter.following[id]?.[accountId]&&!!twitter.following[accountId]?.[id]&&!twitterBlocked(twitter,id,accountId)&&canReadTwitter(twitter,accountId,id)).map(([accountId,account])=>({id:accountId,name:c.characters.find(ch=>ch.id===accountId)?.name??accountId,handle:account.handle})):[];
  if (settings.key && settings.url && settings.model) {
    const cooldownPrefix=`choice-tool:${id}:`;
    const lastOffer=Number(s.flags.find(f=>f.startsWith(cooldownPrefix))?.slice(cooldownPrefix.length)??-5);
    const allowChoices=channel==='talk'&&m.turns>=3&&m.turns-lastOffer>=5&&random(s)<0.2;
    if(allowChoices)s.flags=s.flags.filter(f=>!f.startsWith(cooldownPrefix)).concat(cooldownPrefix+m.turns);
    const base = validateApiUrl(settings.url);
    const endpoint = base.endsWith("/chat/completions")
      ? base
      : base + (new URL(base).pathname === "/" ? "/v1" : "") + "/chat/completions";
    const [knowledge,webKnowledge,image]=await Promise.all([
      timed('chat.knowledge',()=>knowledgeContext(endpoint,settings,JSON.stringify({character:character.name,...characterContext(s,c,id),channel,text,scene:visibleScene(s,id)}),signal)),
      timed('chat.search',()=>searchContext(text,signal)),
      channel==='line'?timed('chat.image',()=>requestImage(s,c,'line',text,id,signal)):Promise.resolve({} as ImageResult),
    ]);
    imageResult=image;
    const system = [
      channel==='line'?prompt('chat.photo',{result:JSON.stringify(imageResult)}):'',
      configuredPrompt(c.settings.systemPrompt),
      prompt('chat.importantMemory',{memory:JSON.stringify(importantMemoryView(m,userContent))}),
      configuredPrompt(character.prompt,{name:character.name,bio:character.bio}),
      prompt('chat.action'),
      prompt('chat.expression',{available:availableExpressions.join(', ')}),
      prompt('chat.actions',{state:JSON.stringify({actorId:id,playerId:'kazuhiko',availableActions,actorPrivate:twitter?.accounts[id]?.private??false,playerPrivate:twitter?.accounts.kazuhiko?.private??false,followingPlayer:twitter?.following[id]?.kazuhiko??false,pendingPlayerRequest:twitter?.requests.kazuhiko?.[id]??false,blockedPlayer:twitter?.blocks?.[id]?.kazuhiko??false,blockedByPlayer:twitter?.blocks?.kazuhiko?.[id]??false,accounts:twitterAccounts.map(([accountId,account])=>({id:accountId,name:c.characters.find(ch=>ch.id===accountId)?.name??accountId,private:account.private,following:!!twitter?.following[id]?.[accountId],followsActor:!!twitter?.following[accountId]?.[id]})),mentionableFriends})}),
      sceneTimePrompt(s,c,s.character===id),
      knowledge,
      webKnowledge,
      channel==='line'?prompt(faceToFace?'chat.line.present':'chat.line.remote',{place:c.places.find(p=>p.id===s.location)?.name}):'',
      prompt(channel==='line'?'chat.linePacing':'chat.pacing'),prompt('chat.refusal'),
      prompt('chat.identity',{profile:JSON.stringify(currentProfile(character,s,c))}),
      prompt(allowChoices?'chat.tool.choices':'chat.tool.reply')+prompt('chat.tool.rules'),
      prompt('chat.perspective',{name:character.name}),
      prompt('chat.status',{grade:schoolLabel(character,s,c),relationship:prompt(character.romance?'chat.romance':'chat.platonic')}),
      prompt('chat.participants',{profiles:JSON.stringify(c.characters.filter(ch=>ch.id===id||ch.id==='kazuhiko').map(ch=>currentProfile(ch,s,c)))}),
      prompt('chat.scene',{scene:JSON.stringify({channel,faceToFace:s.character===id,scene:visibleScene(s,id)})}),
      prompt('chat.state',{date:s.date,grade:grade(s,c),place:s.character===id?prompt('chat.place',{place:c.places.find(p=>p.id===s.location)?.name}):'',channel:prompt(channel==='line'?'chat.channel.line':'chat.channel.talk'),affection:s.affection[id]??0,route:s.route===id?prompt('chat.route'):''}),
      prompt('chat.memory',{memory:reliableMemorySummary(m)+'\n'+m.facts.join('\n')}),
      prompt('chat.socialMemory',{memory:JSON.stringify(socialMemoryContext(m,s,id))}),
      prompt('chat.lineReceipts',{receipts:JSON.stringify(lineReceiptContext(s,id))}),
    ].join("\n\n");
    let response: Response;
    try {
      response = await modelFetch(endpoint, {
        method: "POST",
        redirect: "manual",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + settings.key,
        },
        body: JSON.stringify({
          model: settings.model,
          ...(onPartial?{stream:true}:{}),
          messages: [
            { role: "system", content: system },
            ...conversationMemoryMessages(m,s,id),
            { role: "user", content: userContent },
          ],
          max_tokens: 1900,
          temperature: 0.8,
          tools:(allowChoices?[characterTool,choiceTool]:[characterTool]).map(schema=>{
            const properties:Record<string,any>={...schema.function.parameters.properties,expression:{...schema.function.parameters.properties.expression,enum:availableExpressions}};
            if(!twitterEnabled)delete properties.twitterPost;
            if(availableActions.length){const item=properties.actions.items;properties.actions={...properties.actions,items:{...item,properties:{...item.properties,kind:{...item.properties.kind,enum:availableActions}}}};}
            else delete properties.actions;
            return {...schema,function:{...schema.function,parameters:{...schema.function.parameters,properties,required:schema.function.parameters.required.filter(key=>(key!=='twitterPost'||twitterEnabled)&&(key!=='actions'||availableActions.length>0))}}};
          }),
          tool_choice:allowChoices?'required':{type:'function',function:{name:'present_character_reply'}},
          parallel_tool_calls:false,
        }),
        signal: signal,
      });
    } catch (e) {
      if(e instanceof ModelError)throw e;
      console.error("AI transport failure", e instanceof Error ? e.message : "unknown");
      throw Error("AI 連線失敗或逾時，未變更對話進度。請檢查 editor 的 API 設定。");
    }
    if (!response.ok) throw Error(`AI 服務回應 ${response.status}，未變更對話進度。`);
    performance=onPartial&&response.headers.get('content-type')?.includes('text/event-stream')
      ?await streamCharacter(response,channel==='line',onPartial!,allowChoices)
      :parseCharacterReply(await response.json(),channel==='line',allowChoices);
    // Providers do not all enforce a tool property's enum reliably. Apply the
    // same invariant server-side so a forbidden same-channel action can never
    // be persisted by the deferred worker.
    if(channel==='line'&&lineMessagePersisted&&performance.actions?.some(action=>action.kind==='line_message'))
      performance={...performance,actions:performance.actions.filter(action=>action.kind!=='line_message')};
    reply=performance.speech;
    mode = "ai";
  } else {
    const snippets: Record<string, string[]> = {
      anna: [prompt('chat.offline.anna.0'),prompt('chat.offline.anna.1')],
      lemon: [prompt('chat.offline.lemon.0'),prompt('chat.offline.lemon.1')],
      komari: [prompt('chat.offline.komari.0'),prompt('chat.offline.komari.1')],
      shikiya: [prompt('chat.offline.shikiya.0')],
      tiara: [prompt('chat.offline.tiara.0')],
      kaju: [prompt('chat.offline.kaju.0')],
    };
    const lines = snippets[id] ?? [prompt('chat.offline.generic')];
    reply = lines[m.turns % lines.length];
    const quoted=reply.match(/^「([^」]+)」(.*)$/s);
    performance={speech:quoted?.[1]??reply,narration:channel==='line'?'':quoted?.[2]??'',thought:null};
    reply=performance.speech;
  }
  const stamp={date:s.date,phase:s.phase,channel:channel==='line'?'line' as const:'talk' as const};
  m.recent.push({ role: "user", content: userContent,...stamp });
  if(channel!=='line'||performance.respond!==false)m.recent.push({ role: "assistant", content: performance.narration ? `${reply}\n（旁白：${performance.narration}）` : reply,...stamp });
  if(signal?.aborted)throw Error('對話已取消。');
  onPartial?.(performance);
  for(const fact of performance.memoryFacts??[]){
    m.important??=[];
    if(!m.important.some(item=>item.kind===fact.kind&&item.text===fact.text))
      m.important.push({...fact,date:s.date,phase:s.phase,channel,evidence:JSON.stringify({player:userContent,character:reply})});
  }
  m.turns++;
  compactMemory(m, c.settings.memoryChars, c.settings.recentTurns);
  const reward = `chat:${s.date}:${id}`;
  if(mode==='ai'){
    s.affection[id]=Math.max(0,Math.min(100,(s.affection[id]??0)+(performance.affectionDelta??0)));
  } else if (!s.flags.includes(reward)) {
    s.affection[id] = Math.min(100, (s.affection[id] ?? 0) + 1);
    s.flags.push(reward);
  }
  if (channel === "line") {
    const now=Date.now();
    const playerMessage={ id:crypto.randomUUID(),phase:s.phase,from: "player", text, date: s.date,created:now,readByCharacterAt:now,conversationClosed:performance.conversationClosed };
    s.messages[id] = [
      ...(s.messages[id] ?? []),
      ...(lineMessagePersisted?[]:[playerMessage]),
      ...(performance.respond===false?[]:[{ id:crypto.randomUUID(),phase:s.phase,from: id, text: reply, date: s.date,created:Date.now(),conversationClosed:performance.conversationClosed,expectsReply:!performance.conversationClosed, ...(imageResult.url?{image:imageResult.url,imageCaption:imageResult.caption}:{}) }]),
    ].slice(-100);
  } else {
    const expression=performance.expression&&character.sprites[performance.expression]?performance.expression:'normal';
    const script=appendConversation(s.dialogue,c.characters.find(ch=>ch.id==='kazuhiko')?.name??'溫水和彥',character.name,text,{...performance,expression},playerAction);
    const replyStart=script.length-1-Number(!!performance.narration)-Number(!!performance.thought);
    s.dialogue = { speaker: character.name, text: reply,narration:performance.narration,thought:performance.thought,expression,kind:'chat',script,replyStart,...(performance.choices?{choices:shuffleChoices(performance.choices)}:{}) };
    if(text) log(s, "溫水和彥", text);
    if(playerAction) log(s, "溫水和彥・動作", playerAction);
    log(s, character.name, reply);
    if(performance.narration) log(s,'旁白',performance.narration);
    if(performance.thought) log(s,character.name+'・內心（未說出口）',performance.thought);
  }
  if(!(channel==='line'&&lineMessagePersisted))await executeCharacterActions(s,c,id,performance,signal);
  s.revision++;
  return { state: s, reply, performance, mode, notice:imageResult.notice };
}
