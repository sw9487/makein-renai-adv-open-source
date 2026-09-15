import type { Character } from './types';
const root='';
export const portraitAssets:Record<string,Partial<Character>>={
  riko:{sprites:{normal:root+'00000000-0000-4000-8000-000000000021.png'},avatar:root+'00000000-0000-4000-8000-000000000021.png',avatarCrop:{x:125,y:10,width:240,height:285,imageWidth:525,imageHeight:1569},imageNote:'小說人物設定全身圖；來源：Bangumi 收錄、註明原作官方帳號。',source:'https://bangumi.tv/character/158730/photo/10351'},
  hiroto:{sprites:{normal:root+'00000000-0000-4000-8000-000000000026.png'},avatar:root+'00000000-0000-4000-8000-000000000026.png',spriteCrop:{x:385,y:0,width:405,height:1380,imageWidth:1140,imageHeight:1380},avatarCrop:{x:400,y:20,width:320,height:340,imageWidth:1140,imageHeight:1380},imageNote:'依使用者提供動畫附圖中央紅背心男子製作；內建 imagegen 移除其他人物並補繪遮擋部分，白底。屬 AI 輔助衍生素材，不是未修改的官方立繪。',source:''},
  satoshi:{sprites:{normal:root+'00000000-0000-4000-8000-000000000023.png'},avatar:root+'00000000-0000-4000-8000-000000000023.png',spriteCrop:{x:247,y:10,width:198,height:605,imageWidth:448,imageHeight:640},avatarCrop:{x:201,y:8,width:246,height:288,imageWidth:448,imageHeight:640},imageNote:'第5卷第4章原作插圖半身裁切；保留原圖，不補畫未公開部分。',source:'https://skythewood.blogspot.com/2023/07/too-many-losing-heroines-v5-chapter-4.html'},
  koharu:{sprites:{normal:root+'00000000-0000-4000-8000-000000000025.png'},avatar:root+'00000000-0000-4000-8000-000000000025.png',spriteCrop:{x:100,y:50,width:1200,height:3400,imageWidth:2480,imageHeight:3508,outline:[100,50,1100,50,1100,800,1170,1400,1170,1630,1300,1950,1140,2050,1140,3450,100,3450]},avatarCrop:{x:520,y:95,width:540,height:570,imageWidth:2480,imageHeight:3508},imageNote:'使用者指定 Shinianjun00 的彩色人物設計；原圖本地保存，以顯示遮罩排除右側黑白草圖，非官方設定圖。',source:'https://x.com/Shinianjun00/status/2066812229333471255'},
};
for (const [id, asset] of Object.entries(portraitAssets)) {
  const filename=asset.sprites?.normal;
  if (!filename) continue;
  asset.sprites={...asset.sprites,normal:`/assets/authored/sprites/${id}/${filename}`};
  asset.avatar=`/assets/authored/avatars/${id}/${filename}`;
}
