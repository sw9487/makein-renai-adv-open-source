import {sdProfiles,type ModelFamily} from '../core/sd-profiles';
import {prompt} from './prompt';

export const visualNovelPositive=sdProfiles.Illustrious.positive;
export const visualNovelNegative=sdProfiles.Illustrious.negative;

export function imageArtDirection(mode:'manual'|'automatic'|'line',family:ModelFamily='Illustrious'){
 const profile=sdProfiles[family];
 return prompt('image.artDirection',{family:family.toUpperCase(),positive:profile.positive,negative:profile.negative,modelRule:prompt(family==='Illustrious'?'image.artDirection.illustrious':'image.artDirection.pony'),modeRule:prompt(mode==='line'?'image.artDirection.line':'image.artDirection.story')});
}

const nonCharacterProfiles={
 Illustrious:{
  object:{positive:'masterpiece, best quality, amazing quality, very aesthetic, high resolution, ultra-detailed, absurdres, newest, still life, object focus, accurate object, coherent shape, detailed texture, natural colors, clean composition',negative:'unrecognizable object, malformed object, deformed object, fused objects, duplicate objects, floating objects, impossible geometry, distorted perspective, oversaturated, neon colors, chromatic aberration, logo, emblem, watermark, signature, text'},
  scene:{positive:'masterpiece, best quality, amazing quality, very aesthetic, high resolution, ultra-detailed, absurdres, newest, scenery, environment focus, wide shot, establishing shot, coherent architecture, detailed background, atmospheric perspective, natural colors',negative:'malformed architecture, impossible geometry, warped building, floating objects, distorted perspective, oversaturated, neon colors, chromatic aberration, logo, watermark, signature, text'},
 },
 Pony:{
  object:{positive:'score_9, score_8_up, score_7_up, source_anime, still life, object focus, accurate object, coherent shape, detailed texture, natural colors, clean composition',negative:'score_6, score_5, score_4, unrecognizable object, malformed object, deformed object, fused objects, duplicate objects, floating objects, impossible geometry, distorted perspective, oversaturated, neon colors, chromatic aberration, logo, emblem, watermark, signature, text'},
  scene:{positive:'score_9, score_8_up, score_7_up, source_anime, scenery, environment focus, wide shot, establishing shot, coherent architecture, detailed background, atmospheric perspective, natural colors',negative:'score_6, score_5, score_4, malformed architecture, impossible geometry, warped building, floating objects, distorted perspective, oversaturated, neon colors, chromatic aberration, logo, watermark, signature, text'},
 },
} as const;

export function composeImagePrompts(plan:{prompt:string;negative_prompt:string;imageKind?:'object'|'scene'},family:ModelFamily='Illustrious'){
 const base=sdProfiles[family],specific=plan.imageKind?nonCharacterProfiles[family][plan.imageKind]:undefined;
 const profile=specific?{positive:specific.positive,negative:[base.negative,specific.negative].join(', '),suffix:base.suffix}:base;
 const reserved=new Set([...Object.values(sdProfiles).flatMap(p=>[p.positive,p.suffix]),...Object.values(nonCharacterProfiles).flatMap(f=>Object.values(f).map(p=>p.positive))].join(',').split(',').map(t=>t.trim().toLowerCase()));
 const clean=(value:string)=>value.split(',').map(t=>t.trim()).filter(t=>t&&!/^score_\d+(?:_up)?$/i.test(t)&&!reserved.has(t.toLowerCase())).join(', ');
 return {prompt:[profile.positive,clean(plan.prompt),profile.suffix].filter(Boolean).join(', '),negative_prompt:[profile.negative,clean(plan.negative_prompt)].filter(Boolean).join(', ')};
}
