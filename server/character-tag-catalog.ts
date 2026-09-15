import type {ModelFamily} from '../core/sd-profiles';

export type CharacterOutfit={label:string;tags:string};
export type CharacterTagEntry={name:string;aliases:readonly string[];outfits:readonly CharacterOutfit[]};

const illustrious:readonly CharacterTagEntry[]=[
 {name:'温水 佳樹',aliases:['溫水佳樹','温水佳樹','nukumizu kaju','kaju'],outfits:[
  {label:'半袖制服',tags:'kaju-default, nukumizu kaju, brown eyes, black hair, long hair, blunt bangs, white dress, dress, brown sailor collar, yellow socks, loafers'},
  {label:'長袖制服',tags:'kaju-default, nukumizu kaju, brown eyes, black hair, long hair, blunt bangs, brown dress, dress, long sleeves, white sailor collar, yellow socks, loafers'},
  {label:'私服1',tags:'kaju-casual1, nukumizu kaju, brown eyes, black hair, long hair, blunt bangs, hairband, suspenders, white shirt, collared shirt, suspender skirt, long skirt, white socks'},
  {label:'私服2',tags:'kaju-casual2, nukumizu kaju, brown eyes, black hair, long hair, blunt bangs, bow hairband, yellow shirt, blue overalls, long skirt, white socks'},
  {label:'寝巻き',tags:'kaju-pajamas, nukumizu kaju, brown eyes, black hair, long hair, blunt bangs, blue pajamas, blue pants'},
 ]},
 {name:'八奈見 杏菜',aliases:['八奈見杏菜','yanami anna','anna'],outfits:[
  {label:'半袖制服',tags:'anna-default, yanami anna, blue eyes, blue hair, medium hair, school uniform, white shirt, short sleeves, bowties, grey skirt, pleated skirt, black socks, loafers'},
  {label:'長袖制服',tags:'anna-default, yanami anna, blue eyes, blue hair, medium hair, school uniform, white jacket, long sleeves, yellow cardigan, bowties, grey skirt, pleated skirt, black socks, loafers'},
  {label:'水着',tags:'anna-swim, yanami anna, blue eyes, blue hair, ponytail, hair scrunchie, blue bikini, print bikini, side-tie bikini bottom, white hoodie, long sleeves, open hoodie'},
  {label:'私服1',tags:'anna-casual, yanami anna, blue eyes, blue hair, medium hair, white dress, sleeveless'},
  {label:'私服2',tags:'anna-casual, yanami anna, blue eyes, blue hair, ponytail, purple t-shirt, black shorts'},
  {label:'学園祭',tags:'anna-ghost, yanami anna, blue eyes, blue hair, medium hair, triangular headpiece, ghost costume, ghost hair ornament, japanese clothes, wide sleeves, hitodama'},
  {label:'黒セーラー',tags:'anna-serafuku, yanami anna, blue eyes, blue hair, twin braids, black serafuku, red bow, black shirt, long sleeves, black skirt, glasses'},
 ]},
 {name:'小鞠 知花',aliases:['小鞠知花','komari chika','chika'],outfits:[
  {label:'半袖制服',tags:'chika-default, komari chika, yellow eyes, red hair, hair over one eye, one side up, hair bobbles, school uniform, white shirt, bowties, oversized clothes, short sleeves, grey skirt, black socks, loafers'},
  {label:'長袖制服',tags:'chika-default, komari chika, yellow eyes, red hair, hair over one eye, one side up, hair bobbles, school uniform, white jacket, bowties, long sleeves, grey skirt, black socks, loafers'},
  {label:'水着',tags:'chika-swimsuit, komari chika, yellow eyes, red hair, hair over one eye, one side up, hair bobbles, white hoodie, pink hood, open hoodie, swimsuit, blue one-piece swimsuit'},
  {label:'私服',tags:'chika-casual, komari chika, yellow eyes, red hair, hair over one eye, one side up, hair bobbles, yellow hoodie, blue shorts, white socks, red sneakers'},
 ]},
 {name:'焼塩 檸檬',aliases:['燒鹽檸檬','焼塩檸檬','yakishio lemon','remon'],outfits:[
  {label:'半袖制服',tags:'remon-default, yakishio lemon, purple eyes, brown hair, short hair, hair ornament, school uniform, white shirt, short sleeves, bowties, grey skirt, pleated skirt, white socks, loafers'},
  {label:'長袖制服',tags:'remon-default, yakishio lemon, purple eyes, brown hair, short hair, hair ornament, school uniform, white jacket, long sleeves, bowties, grey skirt, pleated skirt, white socks, loafers'},
  {label:'水着',tags:'remon-swimsuit, yakishio lemon, purple eyes, brown hair, short hair, hair ornament, white hoodie, open hoodie, orange bikini, tanlines, tan'},
  {label:'体操着',tags:'remon-gym, yakishio lemon, purple eyes, brown hair, short hair, hair ornament, gym shirt, black t-shirt, track pants'},
  {label:'ミイラ男',tags:'remon-mummy, yakishio lemon, purple eyes, brown hair, short hair, mummy costume, chest sarashi, tanlines, tan'},
 ]},
 {name:'朝雲 千早',aliases:['朝雲千早','asagumo chihaya','chihaya'],outfits:[
  {label:'半袖制服',tags:'chihaya-default, asagumo chihaya, purple eyes, brown hair, parted bangs, long hair, school uniform, white shirt, short sleeves, yellow sweater vest, sweater vest, bowties, grey skirt, smile, black socks, loafers'},
  {label:'長袖制服',tags:'chihaya-default, asagumo chihaya, purple eyes, brown hair, parted bangs, long hair, school uniform, white jacket, long sleeves, bowties, grey skirt'},
  {label:'私服',tags:'chihaya-casual, asagumo chihaya, purple eyes, brown hair, parted bangs, long hair, blue dress, collared dress, white collarbone, short sleeves, straw hat'},
 ]},
 {name:'姫宮 華恋',aliases:['姬宮華戀','姫宮華恋','himegiya karen','karen','mkhekaren'],outfits:[
  {label:'半袖制服',tags:'mkhekaren, long hair, hair intakes, braid, hair flower, large breasts, anime screencap, school uniform, white shirt, short sleeves, (bowtie:1.5), red bowtie, yellow bowtie, shirt tucked in, grey skirt, pleated skirt, kneehighs, shoes'},
  {label:'長袖制服',tags:'mkhekaren, long hair, hair intakes, braid, hair flower, large breasts, anime screencap, school uniform, jacket, white shirt, (bowtie:1.5), red bowtie, yellow bowtie, shirt tucked in, grey skirt, pleated skirt, kneehighs, shoes'},
  {label:'黒紫ドレス',tags:'mkhekaren, long hair, hair intakes, braid, hair flower, large breasts, anime screencap, two-tone dress, head wings, necklace, black dress, short dress, purple dress, cleavage cutout, bare shoulders, elbow gloves, garter straps, black thighhighs'},
  {label:'黒桃ドレス',tags:'mkhekaren, long hair, hair intakes, braid, hair flower, large breasts, anime screencap, two-tone dress, head wings, necklace, black dress, short dress, pink dress, cleavage cutout, bare shoulders, elbow gloves, garter straps, black thighhighs'},
 ]},
 {name:'馬剃 天愛星',aliases:['馬剃天愛星','basori tiara','tiara','basori_cnr'],outfits:[
  {label:'制服',tags:'basori_cnr, 1girl, black hair, black eyes, mole on neck, hair bun, basori_s1, pleated skirt, pantyhose, uwabaki, jacket, white shirt, blue bowtie, bowtie, long sleeves'},
  {label:'メイド服',tags:'basori_cnr, 1girl, black hair, black eyes, mole on neck, hair bun, basori_s2, dress, black dress, maid apron, long sleeves, short hair, enmaided, cat ears, maid headdress'},
 ]},
 {name:'温水 和彦',aliases:['溫水和彥','温水和彦','nukumizu kazuhiko','kazuhiko'],outfits:[
  {label:'夏季校服',tags:'Nukumizu Kazuhiko, short hair, black hair, brown eyes, ahoge, summer-uniform, green necktie, 1boy, male'},
  {label:'冬季校服',tags:'Nukumizu Kazuhiko, short hair, black hair, brown eyes, ahoge, winter-uniform, green necktie, 1boy, male'},
  {label:'co-ntr戦衣',tags:'Nukumizu Kazuhiko, short hair, black hair, brown eyes, ahoge, contr, 1boy, male'},
  {label:'泳装',tags:'Nukumizu Kazuhiko, short hair, black hair, brown eyes, ahoge, swimshorts, blue hoodie, 1boy, male'},
  {label:'体操服',tags:'Nukumizu Kazuhiko, short hair, black hair, brown eyes, ahoge, gymwear, 1boy, male'},
 ]},
 {name:'志喜屋 夢子',aliases:['志喜屋夢子','shikiya yumeko','yumeko shikiya','yumeko_shikiya'],outfits:[
  {label:'制服',tags:'Shikiya Yumeko, white hair, brown eyes, long hair, hair between eyes, breasts, white shirt, pink bowtie, purple bowtie, pink jacket around waist, gray skirt, pleated_skirt, kneehighs, black socks'},
  {label:'ナース服',tags:'Shikiya Yumeko, white hair, brown eyes, long hair, hair between eyes, torn pantyhose, pink nurse cap, breasts, pink shirt, white pantyhose'},
 ]},
];

const pony:readonly CharacterTagEntry[]=[
 {name:'温水 佳樹',aliases:['溫水佳樹','温水佳樹','nukumizu kaju','kaju'],outfits:[
  {label:'半袖制服',tags:'kaju-default, nukumizu kaju, brown eyes, black hair, long hair, blunt bangs, white dress, dress, brown sailor collar, yellow socks, loafers'},
  {label:'長袖制服',tags:'kaju-default, nukumizu kaju, brown eyes, black hair, long hair, blunt bangs, brown dress, dress, long sleeves, white sailor collar, yellow socks, loafers'},
  {label:'私服1',tags:'kaju-casual1, nukumizu kaju, brown eyes, black hair, long hair, blunt bangs, hairband, suspenders, white shirt, collared shirt, suspender skirt, long skirt, white socks'},
  {label:'私服2',tags:'kaju-casual2, nukumizu kaju, brown eyes, black hair, long hair, blunt bangs, bow hairband, yellow shirt, blue overalls, long skirt, white socks'},
  {label:'寝巻き',tags:'kaju-pajamas, nukumizu kaju, brown eyes, black hair, long hair, blunt bangs, blue pajamas, blue pants'},
 ]},
 {name:'八奈見 杏菜',aliases:['八奈見杏菜','yanami anna','anna'],outfits:[
  {label:'半袖制服',tags:'anna-default, yanami anna, blue eyes, blue hair, medium hair, school uniform, white shirt, short sleeves, bowties, grey skirt, pleated skirt, black socks, loafers'},
  {label:'長袖制服',tags:'anna-default, yanami anna, blue eyes, blue hair, medium hair, school uniform, white jacket, long sleeves, yellow cardigan, bowties, grey skirt, pleated skirt, black socks, loafers'},
  {label:'水着',tags:'anna-swim, yanami anna, blue eyes, blue hair, ponytail, hair scrunchie, blue bikini, print bikini, side-tie bikini bottom, white hoodie, long sleeves, open hoodie'},
  {label:'私服1',tags:'anna-casual, yanami anna, blue eyes, blue hair, medium hair, white dress, sleeveless'},
  {label:'私服2',tags:'anna-casual, yanami anna, blue eyes, blue hair, ponytail, purple t-shirt, black shorts'},
  {label:'学園祭',tags:'anna-ghost, yanami anna, blue eyes, blue hair, medium hair, triangular headpiece, ghost costume, ghost hair ornament, japanese clothes, wide sleeves, hitodama'},
  {label:'黒セーラー',tags:'anna-serafuku, yanami anna, blue eyes, blue hair, twin braids, black serafuku, red bow, black shirt, long sleeves, black skirt, glasses'},
 ]},
 {name:'小鞠 知花',aliases:['小鞠知花','komari chika','chika'],outfits:[
  {label:'半袖制服',tags:'chika-default, komari chika, yellow eyes, red hair, hair over one eye, one side up, hair bobbles, school uniform, white shirt, bowties, oversized clothes, short sleeves, grey skirt, black socks, loafers'},
  {label:'長袖制服',tags:'chika-default, komari chika, yellow eyes, red hair, hair over one eye, one side up, hair bobbles, school uniform, white jacket, bowties, long sleeves, grey skirt, black socks, loafers'},
  {label:'水着',tags:'chika-swimsuit, komari chika, yellow eyes, red hair, hair over one eye, one side up, hair bobbles, white hoodie, pink hood, open hoodie, swimsuit, blue one-piece swimsuit'},
  {label:'私服',tags:'chika-casual, komari chika, yellow eyes, red hair, hair over one eye, one side up, hair bobbles, yellow hoodie, blue shorts, white socks, red sneakers'},
 ]},
 {name:'焼塩 檸檬',aliases:['燒鹽檸檬','焼塩檸檬','yakishio lemon','remon'],outfits:[
  {label:'半袖制服',tags:'remon-default, yakishio lemon, purple eyes, brown hair, short hair, hair ornament, school uniform, white shirt, short sleeves, bowties, grey skirt, pleated skirt, white socks, loafers'},
  {label:'長袖制服',tags:'remon-default, yakishio lemon, purple eyes, brown hair, short hair, hair ornament, school uniform, white jacket, long sleeves, bowties, grey skirt, pleated skirt, white socks, loafers'},
  {label:'水着',tags:'remon-swimsuit, yakishio lemon, purple eyes, brown hair, short hair, hair ornament, white hoodie, open hoodie, orange bikini, tanlines, tan'},
  {label:'体操着',tags:'remon-gym, yakishio lemon, purple eyes, brown hair, short hair, hair ornament, gym shirt, black t-shirt, track pants'},
  {label:'ミイラ男',tags:'remon-mummy, yakishio lemon, purple eyes, brown hair, short hair, mummy costume, chest sarashi, tanlines, tan'},
 ]},
 {name:'朝雲 千早',aliases:['朝雲千早','asagumo chihaya','chihaya'],outfits:[
  {label:'半袖制服',tags:'chihaya-default, asagumo chihaya, purple eyes, brown hair, parted bangs, long hair, school uniform, white shirt, short sleeves, yellow sweater vest, sweater vest, bowties, grey skirt, smile, black socks, loafers'},
  {label:'長袖制服',tags:'chihaya-default, asagumo chihaya, purple eyes, brown hair, parted bangs, long hair, school uniform, white jacket, long sleeves, bowties, grey skirt'},
  {label:'私服',tags:'chihaya-casual, asagumo chihaya, purple eyes, brown hair, parted bangs, long hair, blue dress, collared dress, white collarbone, short sleeves, straw hat'},
 ]},
 {name:'姫宮 華恋',aliases:['姬宮華戀','姫宮華恋','himegiya karen','karen'],outfits:[
  {label:'半袖制服',tags:'karen himemiya, pink hair, long hair, hair intakes, braid, hair ornament, pink eyes, sidelocks, school uniform, white collared shirt, short sleeves, red bowtie, yellow bowtie, grey pleated skirt, white kneehighs, white footwear'},
  {label:'長袖制服',tags:'karen himemiya, pink hair, long hair, hair intakes, braid, hair ornament, pink eyes, sidelocks, winter school uniform, white blazer, white collared shirt, long sleeves, red bowtie, yellow bowtie, open blazer, grey pleated skirt, white kneehighs, white footwear'},
 ]},
 {name:'馬剃 天愛星',aliases:['馬剃天愛星','basori tiara','tiara'],outfits:[
  {label:'長袖制服',tags:'tiara basori, black hair, short hair, hair bun, (thick eyebrows:0.6), blue eyes, mole on neck, winter school uniform, white blazer, white collared shirt, long sleeves, cyan bowtie, white bowtie, (name tag:0.6), grey pleated skirt, (long skirt:0.8), black pantyhose, white footwear'},
  {label:'メイド服',tags:'tiara basori, black hair, short hair, hair bun, (thick eyebrows:0.6), blue eyes, mole on neck, maid costume, cat ears, black dress, white collar, frills, white apron, juliet sleeves, long sleeves, white socks, black footwear'},
 ]},
 {name:'温水 和彦',aliases:['溫水和彥','温水和彦','nukumizu kazuhiko','kazuhiko'],outfits:[
  {label:'半袖制服',tags:'kazuhiko nukumizu, short hair, black hair, ahoge, brown eyes, school uniform, white collared shirt, short sleeves, green necktie, belt, grey pants, brown footwear'},
  {label:'水着',tags:'kazuhiko nukumizu, short hair, black hair, ahoge, brown eyes, topless, black male swimwear, swim trunks'},
 ]},
 {name:'志喜屋 夢子',aliases:['志喜屋夢子','shikiya yumeko','yumeko shikiya','yumeko_shikiya'],outfits:[
  {label:'半袖制服',tags:'yumeko shikiya, long hair, brown hair, ahoge, wavy hair, hair between eyes, brown eyes, purple nails, school uniform, white shirt, collared shirt, short sleeves, collarbone, cleavage, pink bowtie, purple bowtie, loose bowtie, (wrist scrunchie:0.8), sweater around waist, grey pleated skirt, blue kneehighs, white footwear'},
 ]},
];

export const characterTagCatalog={Illustrious:illustrious,Pony:pony} satisfies Record<ModelFamily,readonly CharacterTagEntry[]>;
