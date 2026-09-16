import {prompt} from './prompt';

export type SkillCategory='erotic'|'violent'|'bloody'|'grotesque';
const categories:SkillCategory[]=['bloody','erotic','grotesque','violent'];

export function skillMenu(){
 const skills=categories.map(category=>`- ${category}: ${prompt('image.skill.'+category)}`).join('\n');
 return prompt('image.skillMenu',{skills});
}

export function loadSkillContent(selected:SkillCategory[]){
 const sections=selected.filter((category,index)=>categories.includes(category)&&selected.indexOf(category)===index).map(category=>prompt('image.skillSection',{category:category.toUpperCase(),content:prompt('image.skillContent.'+category)}));
 return sections.length?'\n\n'+sections.join('\n\n')+'\n\n'+prompt('image.skillFooter'):'';
}

export const loadSkillsTool={
 type:'function',
 function:{
  name:'load_skills',
  get description(){return prompt('image.skillTool');},
  parameters:{
   type:'object',
   properties:{categories:{type:'array',items:{type:'string',enum:categories},get description(){return prompt('image.skillCategories');}}},
   required:['categories'],
   additionalProperties:false,
  },
 },
};
