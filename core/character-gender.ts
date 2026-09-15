import type {Character} from './types';
// Explicit roster metadata; custom characters are never classified by name or appearance.
const roster:Record<string,'male'|'female'>={
 kazuhiko:'male',tamaki:'male',sosuke:'male',mitsuki:'male',hiroto:'male',satoshi:'male',
 anna:'female',lemon:'female',komari:'female',kaju:'female',koto:'female',karen:'female',chihaya:'female',
 amanatsu:'female',konuki:'female',shikiya:'female',asami:'female',hibari:'female',tiara:'female',riko:'female',koharu:'female',
};
export function characterGender(ch:Character){return ch.gender??roster[ch.id]??'unspecified';}
export function genderProfile(ch:Character){
 const gender=characterGender(ch);
 return {gender,pronoun:gender==='male'?'他':gender==='female'?'她':'對方',
   pronounRule:'旁白及玩家選項提及本角色時使用此代名詞；指向其他人物時依該人物資料，不做全文代換。'};
}
