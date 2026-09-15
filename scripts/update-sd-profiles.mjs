import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
const profiles={};
for(const family of ['Illustrious','Pony']){
 const doc=read(`${family} - makein-renai-stable-diffusion.md`),pony=family==='Pony';
 const positive=pony?'score_9, score_8_up, score_7_up, source_anime':doc.match(/Prompt: (masterpiece[^\r\n]+)/)[1].split(', {Prompt}')[0];
 const negative=pony?'score_6, score_5, score_4, bad eyes, bright pupils, white pupils, ugly, bad hands, furry, censored':doc.match(/Negative Prompts: (modern[^\r\n]+)/)[1];
 profiles[family]={label:pony?'Zuki Clean Anime Mix':'Nova Anime XL',modelUrl:doc.match(/https:\/\/civitai[^\r\n]+/)[0],loraUrl:`https://drive.google.com/file/d/${pony?'1cigyuhvk15DhxPyDLSlp8abTpxA6sQIr':'12ZHjS8oQO713GPZcgMWFlRPznA0sLkdT'}/view?usp=sharing`,positive,negative,suffix:pony?'':'BREAK, depth of field, volumetric lighting',guide:doc.split('人物模型介紹：')[1].trim(),steps:pony?30:25,cfg:pony?6:5,sampler:'Euler a',scheduler:'Automatic',clipSkip:2,hiresFix:true,upscaler:'R-ESRGAN 4x+ Anime6B',upscaleBy:pony?1.5:2,hiresSteps:0,denoising:pony?0.45:0.7};
}
write('core/sd-profiles.ts',`// Generated from the user-supplied model guides by scripts/update-sd-profiles.mjs.\nexport type ModelFamily='Illustrious'|'Pony';\nexport const sdProfiles=${JSON.stringify(profiles,null,2)};\nexport function modelDefaults(family:ModelFamily){const {steps,cfg,sampler,scheduler,clipSkip,hiresFix,upscaler,upscaleBy,hiresSteps,denoising,guide}=sdProfiles[family];return {steps,cfg,sampler,scheduler,clipSkip,hiresFix,upscaler,upscaleBy,hiresSteps,denoising,guide};}\n`);
write('server/stable-diffusion-guide.ts',"import {sdProfiles} from '../core/sd-profiles';\nexport const defaultLoraGuide=sdProfiles.Illustrious.guide;\n");
