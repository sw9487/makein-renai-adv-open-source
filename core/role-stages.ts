import type { Character } from './types';
const stage=(year:number,month:number,role:string,note='開場已知身分或原作篇章順序；日期為遊戲安排，不代表原作確定任命日。',day=1)=>({year,month,day,role,note});
export const roleStages:Record<string,NonNullable<Character['roles']>>={
  kazuhiko:[stage(1,4,'一般學生'),stage(1,8,'文藝部部員','第1卷加入文藝部；月份為遊戲安排。'),stage(1,10,'文藝部部員・次期副部長'),stage(1,11,'文藝部副部長（交接期）'),stage(1,11,'文藝部部長','第3卷文化祭及部長會議後承接部長職務；11月8日為遊戲安排。',8)],
  anna:[stage(1,4,'一般學生'),stage(1,8,'文藝部部員','第1卷加入文藝部。')],
  lemon:[stage(1,4,'田徑部部員'),stage(1,8,'田徑部・文藝部兼任部員','第1卷加入文藝部，仍參加田徑活動。')],
  komari:[stage(1,4,'文藝部部員'),stage(1,10,'文藝部部員・次期部長'),stage(1,11,'文藝部部長（交接期）'),stage(1,11,'文藝部副部長','第3卷文化祭及部長會議後與溫水交換正副部長職務；11月8日為遊戲安排。',8)],
  tamaki:[stage(1,4,'文藝部部長'),stage(1,11,'文藝部前部長（已卸任、尚未畢業）'),stage(2,4,'大學生・文藝部OB','第6卷畢業後升大學。大學年級隨學年計算。')],
  koto:[stage(1,4,'文藝部副部長'),stage(1,11,'文藝部前副部長（已卸任、尚未畢業）'),stage(2,4,'大學生・文藝部OG','第6卷畢業後升大學。')],
  shikiya:[stage(1,4,'學生會書記'),stage(2,7,'前學生會書記（已卸任）','第8卷選舉後交接，非升高三當天就卸任。'),stage(3,4,'高中畢業生・前學生會書記','畢業後去向未核實，不捏造新的職務。')],
  hibari:[stage(1,4,'學生會會長'),stage(2,7,'前學生會會長（已卸任）','第8卷選舉後交接。'),stage(3,4,'高中畢業生・前學生會會長')],
  tiara:[stage(1,4,'學生會副會長'),stage(2,7,'學生會會長','第8卷當選，交接安排於高二7月；原作不是升級即當選。'),stage(3,7,'前學生會會長（同人任期推演）','原作未涵蓋的高三交接，遊戲以一年任期推演，可由editor修改。')],
  hiroto:[stage(1,4,'學生會會計'),stage(2,7,'學生會副會長','第8卷選舉後改任副會長。'),stage(3,7,'前學生會副會長（同人任期推演）')],
  kaju:[stage(1,4,'學生・溫水和彥的妹妹'),stage(1,2,'桃園中學學生會副會長','第5卷、溫水高一2月時已任副會長（佳樹中二）；就任日未核實。僅限桃園中學。'),stage(2,3,'桃園中學畢業生・溫水和彥的妹妹','3月1日沿用遊戲畢業日安排；不再保留在校職務。'),stage(3,4,'溫水和彥的妹妹・升學階段','已完成桃園中學學業，去向未核實。')],
  asami:[stage(1,4,'園藝部部員・佳樹的同班好友'),stage(3,4,'桃園中學畢業生・佳樹的好友')],
  satoshi:[stage(1,4,'園藝部部員'),stage(3,4,'桃園中學畢業生')],
  riko:[stage(1,4,'入學前'),stage(2,4,'文藝部新入部員','第7卷由小拔老師介紹加入。'),stage(2,7,'文藝部部員・學生會成員','第8卷選舉後加入學生會；職稱未核實，不推測為書記或會計。'),stage(3,4,'文藝部部員・學生會成員','原作未涵蓋時段暫沿用最近已知職務，可由 editor 編排後續交接。')],
  koharu:[stage(1,4,'學生'),stage(2,8,'綾目高中學生會成員','第9卷時已是高二。具體職務及就任日未確認；8月為遊戲登場安排。')],
  amanatsu:[stage(1,4,'1-C班主任・世界史教師'),stage(2,4,'2-C班主任・世界史教師'),stage(3,4,'世界史教師（高三任教班級未核實）')],
  konuki:[stage(1,4,'保健室養護教師'),stage(1,10,'保健室養護教師・文藝部顧問','第3卷成為顧問。')],
  sosuke:[stage(1,4,'學生・華戀的男朋友')],karen:[stage(1,4,'學生・草介的女朋友')],
  mitsuki:[stage(1,4,'學生・千早的男朋友')],chihaya:[stage(1,4,'學生・光希的女朋友')],
};
// March graduation precedes April enrollment; dates follow the game's calendar.
for(const [id,role] of Object.entries({tamaki:'高中畢業生・文藝部OB',koto:'高中畢業生・文藝部OG',shikiya:'高中畢業生・前學生會書記',hibari:'高中畢業生・前學生會會長',asami:'桃園中學畢業生・佳樹的好友',satoshi:'桃園中學畢業生'})) {
  roleStages[id].push(stage(['tamaki','koto'].includes(id)?1:2,3,role,'3月1日沿用遊戲畢業日安排；原作未確認具體日。'));
  roleStages[id].sort((a,b)=>((a.year-1)*12+(a.month+8)%12)-((b.year-1)*12+(b.month+8)%12)||(a.day??1)-(b.day??1));
}
