/**
 * Repair the recognizable empty tool envelope accidentally appended to speech,
 * e.g. `記得也跟我分享一下。","narration":"", "thought":null}`.
 */
export function cleanToolText(text:string):string {
 const withoutEnvelope=text.replace(/"\s*,\s*"narration"\s*:\s*""\s*,\s*"thought"\s*:\s*null\s*\}\s*$/, '');
 // Expression is tool metadata, never dialogue. Old saves may already contain
 // a model-written prefix, so strip it for display without inferring a sprite.
 const prefix=withoutEnvelope.match(/^(\s*)([「『“"]?)(\s*[（(]\s*(?:表情|expression)\s*[:：]\s*[^）)]{1,32}[）)]\s*)/i);
 if(!prefix)return withoutEnvelope;
 let speech=withoutEnvelope.slice(prefix[0].length);
 const closing:Record<string,string>={'「':'」','『':'』','“':'”','"':'"'};
 const close=closing[prefix[2]];
 if(close&&speech.trimEnd().endsWith(close))speech=speech.trimEnd().slice(0,-close.length);
 return speech.trimStart();
}
export function hasToolFields(text:string):boolean {
 return /"(?:speech|narration|thought|affectionDelta)"\s*:/.test(text);
}
