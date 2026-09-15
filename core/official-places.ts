import type {Content,GameState,Place} from './types';

const legacyOfficialPlacesPackId='twitter-official-places-v1';
export const officialPlacesPackId='twitter-official-places-v3';
export const legacyOfficialPlaceIds:Record<string,string>={'gusto-kaimei':'gusto-hashira'};

export const officialPlaces:Place[]=[
 {id:'toyohashi-city-hall',name:'豐橋市役所',subtitle:'城市中心的公共空間，偶爾也有展覽與活動。',background:'/assets/places-official/toyohashi-city-hall.png',weights:{hibari:3,tiara:3,hiroto:2,amanatsu:1},school:false},
 {id:'underground-resources-museum',name:'豐橋市地下資源館',subtitle:'在礦物與地球科學展示之間慢慢逛上一圈。',background:'/assets/places-official/underground-resources-museum.png',weights:{chihaya:4,komari:2,mitsuki:2,karen:1},school:false},
 {id:'toyohashi-central-library',name:'豐橋市中央圖書館',subtitle:'寬敞安靜的閱覽空間，適合一起找一本書。',background:'/assets/places-official/toyohashi-central-library.png',weights:{komari:6,tamaki:4,koto:4,mitsuki:3},school:false},
 {id:'toyohashi-public-hall',name:'豐橋市公會堂',subtitle:'歷史建築前的廣場，文化活動的腳步在此交會。',background:'/assets/places-official/toyohashi-public-hall.png',weights:{karen:3,tiara:2,hibari:2,anna:1},school:false},
 {id:'gusto-hashira',name:'ガスト 豊橋橋良店',subtitle:'作品官方聖地地圖第③號；離豐橋站需再移動一小段，適合聚餐聊天。',background:'/assets/places-official/gusto-toyohashi.png',weights:{anna:7,lemon:2,karen:2,sosuke:1,kaju:1},school:false},
 {id:'seibunkan-main',name:'精文館書店 豊橋本店',subtitle:'作品官方聖地地圖第①號；離豐橋站步行約2分鐘，書籍與文具樓層約10:00〜20:00營業。',background:'/assets/places-official/seibunkan-main.png',weights:{komari:6,tamaki:4,koto:4,mitsuki:3,chihaya:2,tiara:2},school:false},
 {id:'waltz-toyohashi',name:'ワルツ 豐橋店',subtitle:'咖啡、紅茶與製菓材料的香氣交疊在店內。',background:'/assets/places-official/waltz-toyohashi.png',weights:{kaju:4,anna:3,amanatsu:2,karen:2},school:false},
 {id:'bontoraya-main',name:'ボンとらや 本店',subtitle:'豐橋甜點整齊陳列，讓人很難只選一樣。',background:'/assets/places-official/bontoraya-main.png',weights:{anna:8,kaju:4,karen:3,lemon:2},school:false},
 {id:'yamasa-main',name:'ヤマサちくわ 本店',subtitle:'老店的暖簾後，是豐橋熟悉的名產香氣。',background:'/assets/places-official/yamasa-main.png',weights:{kaju:3,anna:3,amanatsu:2,koto:2},school:false},
 {id:'uno-uno',name:'駅ビルカフェ UNO-UNO',subtitle:'作品官方聖地地圖第⑦號；位於豐橋站2F，約07:00〜21:30營業。',background:'/assets/places-official/uno-uno.png',weights:{anna:5,kaju:3,karen:3,lemon:2,komari:2},school:false},
 {id:'bon-senga',name:'ボン.千賀',subtitle:'作品官方聖地地圖第⑧號；豐橋站附近的老店，適合買麵包與生菓子。',background:'/assets/places-official/bon-senga.png',weights:{anna:7,kaju:4,karen:3,lemon:2},school:false},
 {id:'murata-takoyaki',name:'むらたのたこやき',subtitle:'作品官方聖地地圖第⑪號；位於豐橋站大樓カルミアB1F的章魚燒店。',background:'/assets/places-official/murata-takoyaki.png',weights:{anna:7,kaju:4,lemon:3,karen:2},school:false},
 {id:'housendo-kalmia',name:'豊川堂 カルミア店',subtitle:'作品官方聖地地圖第⑫號；位於豐橋站大樓カルミア4F，約10:00〜20:00營業。',background:'/assets/places-official/housendo-kalmia.png',weights:{komari:6,tamaki:4,koto:4,mitsuki:3},school:false},
 {id:'yamasa-west',name:'ヤマサちくわ 西駅店',subtitle:'作品官方聖地地圖第⑬號；豐橋站西口附近，約08:00〜18:00營業。',background:'/assets/places-official/yamasa-west.png',weights:{anna:4,kaju:4,amanatsu:2,koto:2},school:false},
 {id:'coffee-canele',name:'CAFE et CANELE（珈琲とカヌレ）',subtitle:'作品官方聖地地圖第⑳號；駅前大通一帶，適合喝咖啡、品嚐可麗露。',background:'/assets/places-official/coffee-canele.png',weights:{anna:8,kaju:5,karen:4,komari:2},school:false},
 {id:'miyako-udon',name:'みやこうどん',subtitle:'作品官方聖地地圖第㉓號；南栄站附近、學生熟悉的平價烏龍麵店。',background:'/assets/places-official/miyako-udon.png',weights:{anna:7,lemon:5,kaju:3,sosuke:2},school:false},
];

const officialPlaceSources:Record<string,string>={
 'uno-uno':'https://www.loisir-toyohashi.com/restaurant/unouno/','bon-senga':'https://senga-seika.co.jp/bon-senga/',
 'murata-takoyaki':'https://www.toyohashi-kalmia.jp/shop/mutratamotakoyaki/','housendo-kalmia':'https://www.toyohashi-kalmia.jp/shop/housendou/',
 'yamasa-west':'https://location.yamasachikuwa.com/store/2026052516443961.html','coffee-canele':'https://aichi.itot.jp/higashiodawara/94',
 'miyako-udon':'https://www.surprise777.com/miyako/',
};

export function addOfficialPlaces(input:Content):Content{
 if(input.storyPacks?.includes(officialPlacesPackId))return input;
 const content=structuredClone(input);
 const migratedFromV1=content.storyPacks?.includes(legacyOfficialPlacesPackId);
 const oldGusto=content.places.find(item=>item.id==='gusto-kaimei');
 if(oldGusto){oldGusto.id='gusto-hashira';oldGusto.name='ガスト 豊橋橋良店';oldGusto.subtitle=officialPlaces.find(place=>place.id==='gusto-hashira')!.subtitle;}
 for(const event of content.events)if(event.place==='gusto-kaimei')event.place='gusto-hashira';
 const oldGustoAsset=content.assets.find(item=>item.id==='scene-gusto-kaimei');
 if(oldGustoAsset){oldGustoAsset.id='scene-gusto-hashira';oldGustoAsset.title='ガスト 豊橋橋良店・場景背景';}
 for(const place of officialPlaces){
  const existing=content.places.find(item=>item.id===place.id);
  if(!existing)content.places.push(structuredClone(place));
  else if(migratedFromV1&&['gusto-hashira','seibunkan-main'].includes(place.id)){existing.name=place.name;existing.subtitle=place.subtitle;}
  if(existing?.background.startsWith('/assets/twitter-official/covers/'))existing.background=place.background;
  const assetId='scene-'+place.id;
  const asset=content.assets.find(item=>item.id===assetId);
  if(asset?.url.startsWith('/assets/twitter-official/covers/')){asset.url=place.background;asset.source='';asset.note='內建 imagegen 生成的無人物原創 ADV 場景背景；與 Twitter 橫幅獨立。';}
  if(!asset)content.assets.push({id:assetId,title:place.name+'・場景背景',url:place.background,source:'',note:'內建 imagegen 生成的無人物原創 ADV 場景背景；與 Twitter 橫幅獨立。'});
 }
 content.storyPacks=[...(content.storyPacks??[]),officialPlacesPackId];
 return content;
}

/** Upgrade persisted playthrough references after the corrected place id shipped. */
export function repairOfficialPlaceIds(state:GameState):boolean{
 let changed=false;
 const replace=(value:string)=>legacyOfficialPlaceIds[value]??value;
 const location=replace(state.location);if(location!==state.location){state.location=location;changed=true;}
 if(state.pendingDateInvitation){const place=replace(state.pendingDateInvitation.place);if(place!==state.pendingDateInvitation.place){state.pendingDateInvitation.place=place;changed=true;}}
 if(state.pendingDate){const place=replace(state.pendingDate.place);if(place!==state.pendingDate.place){state.pendingDate.place=place;changed=true;}}
 return changed;
}
