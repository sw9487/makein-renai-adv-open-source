**Languages:** [繁體中文](../zh-TW/Illustrious - makein-renai-stable-diffusion.md) · [English](Illustrious - makein-renai-stable-diffusion.md) · [日本語](../ja/Illustrious - makein-renai-stable-diffusion.md)

Main model 
https://civitai.com/models/376130/nova-anime-xl?modelVersionId=2940478
Character lora
makein-renai-stable-diffusion-webui\models\Lora\Illustrious

---

Main model introduction
Recommend Settings
Sampler: Euler a

Steps: 20~30

Clip Skip: 1-2

Denoising Strength: 0.65 - 0.8
(Pony)

CFG Scale: 5~7

Prompt: score_9, score_8_up, score_7_up, score_6_up, score_5_up, score_4_up, source_anime, BREAK

Negative Prompts: score_4, score_5, 3d, jpeg artifacts, username, watermark, signature, normal quality, worst quality, large head, low quality, text, error, missing fingers, extra digits, fewer digits, bad eye

(Illustrious)

CFG Scale: 4~6
Prompt: masterpiece, best quality, amazing quality, 4k, very aesthetic, high resolution, ultra-detailed, absurdres, newest, scenery, {Prompt}, BREAK, depth of field, volumetric lighting

Negative Prompts: modern, recent, old, oldest, cartoon, graphic, text, painting, crayon, graphite, abstract, glitch, deformed, mutated, ugly, disfigured, long body, lowres, bad anatomy, bad hands, missing fingers, extra digits, fewer digits, cropped, very displeasing, (worst quality, bad quality:1.2), bad anatomy, sketch, jpeg artifacts, signature, watermark, username, signature, simple background, conjoined,bad ai-generated

---

Character model introduction:

Nukumizu Kaju (温水 佳樹):
If the outfits interfere with each other, adjust with negative prompts or similar.

※2025.03.02

I was training with an added dataset for IllustriousXL1.0 verification, but on reflection, adding a dataset would no longer be a verification, so I also trained v0.1 normally.

The dataset addition also included noise removal and image-quality adjustment, so it should be more usable than the first uploaded Lora.

I don't know if there's demand, but I'll also leave the Lora for IllustriousXL1.0 verification. It is the same dataset, same settings, and same number of epochs as the v1.1 Lora.

Short-sleeve uniform (半袖制服)

kaju-default,nukumizu kaju, brown eyes,black hair, long hair, blunt bangs,white dress,dress,brown sailor collar,yellow socks,loafers

Long-sleeve uniform (長袖制服)

kaju-default,nukumizu kaju, brown eyes,black hair, long hair, blunt bangs,brown dress,dress,long sleeves,white sailor collar,yellow socks,loafers

Casual outfit 1 (私服1)

kaju-casual1,nukumizu kaju, brown eyes,black hair, long hair, blunt bangs,hairband,suspenders,white shirt,collared shirt, suspender skirt,long skirt,white socks

Casual outfit 2 (私服2)

kaju-casual2,nukumizu kaju, brown eyes,black hair, long hair, blunt bangs,bow hairband,yellow shirt, blue overalls,long skirt,white socks

Pajamas (寝巻き)

kaju-pajamas, nukumizu kaju, brown eyes,black hair, long hair, blunt bangs,blue pajamas,blue pants

---

Yanami Anna (八奈見 杏菜):

※2025.03.22

This Lora had a considerable number of downloads and had great demand, so I am distributing a retrained Lora after noise removal, image-quality adjustment, and caption re-editing.

Outfit reproduction and generated image quality have improved.

Short-sleeve uniform (半袖制服)

anna-default, yanami anna,blue eyes,blue hair,medium hair,school uniform,white shirt,short sleeves,bowties,grey skirt,pleated skirt,black socks,loafers

Long-sleeve uniform (長袖制服)

anna-default, yanami anna,blue eyes,blue hair,medium hair,school uniform,white jacket,long sleeves,yellow cardigan,bowties,grey skirt,pleated skirt,black socks,loafers

Swimsuit (水着)

anna-swim,yanami anna,blue eyes,blue hair,ponytail,hair scrunchie,blue bikini,print bikini,side-tie bikini bottom,white hoodie,long sleeves,open hoodie

Casual outfit 1 — Yanami-chan's nice body for the first time in a year, 15th time (私服1 八奈見ちゃん1年ぶり15回目のナイスバディ)

anna-casual,yanami anna,blue eyes,blue hair,medium hair,white dress,sleeveless

Casual outfit 2 (私服2)

anna-casual,yanami anna,blue eyes,blue hair,ponytail,purple t-shirt,black shorts

School festival (学園祭)

anna-ghost,yanami anna,blue eyes,blue hair,medium hair,triangular headpiece,ghost costume,ghost hair ornament,japanese clothes,wide sleeves,hitodama

Black sailor uniform (黒セーラー)

anna-serafuku, yanami anna,blue eyes,blue hair, twin braids, black serafuku, red bow, black shirt, long sleeves, black skirt,glasses

---

Komari Chika (小鞠 知花):

Short-sleeve uniform (半袖制服)

chika-default,komari chika,yellow eyes,red hair,hair over one eye,one side up, hair bobbles,school uniform,white shirt,bowties,oversized clothes,short sleeves, grey skirt,black socks,loafers

Long-sleeve uniform (長袖制服)

chika-default,komari chika,yellow eyes,red hair,hair over one eye,one side up, hair bobbles,school uniform,white jacket,bowties,long sleeves,grey skirt,black socks,loafers

Swimsuit (水着)

chika-swimsuit,komari chika,yellow eyes,red hair,hair over one eye,one side up,hair bobbles,white hoodie,pink hood,open hoodie,swimsuit,blue one-piece swimsuit

Casual outfit (私服)

chika-casual,komari chika,yellow eyes,red hair,hair over one eye,one side up,hair bobbles,yellow hoodie,blue shorts,white socks,red sneakers

---

Yakishio Lemon (焼塩 檸檬):

If the skin becomes too white, use `tan`, `dark skin`, or similar together.

Short-sleeve uniform (半袖制服)

remon-default,yakishio lemon,purple eyes,brown hair,short hair,hair ornament,school uniform,white shirt,short sleeves,bowties,grey skirt,pleated skirt,white socks,loafers

Long-sleeve uniform (長袖制服)

remon-default,yakishio lemon,purple eyes,brown hair,short hair,hair ornament,school uniform,white jacket,long sleeves,bowties,grey skirt,pleated skirt,white socks,loafers

Swimsuit (水着)

remon-swimsuit,yakishio lemon,purple eyes,brown hair, short hair,hair ornament,white hoodie,open hoodie,orange bikini,tanlines,tan

Gym clothes (体操着)

remon-gym,yakishio lemon,purple eyes,brown hair,short hair,hair ornament,gym shirt,black t-shirt,track pants

Mummy (ミイラ男)

remon-mummy,yakishio lemon,purple eyes,brown hair,short hair, mummy costume, chest sarashi,tanlines,tan

---

Asagumo Chihaya (朝雲 千早):

Short-sleeve uniform (半袖制服)

chihaya-default,asagumo chihaya,purple eyes,brown hair,parted bangs,long hair,school uniform,white shirt,short sleeves,yellow sweater vest,sweater vest,bowties,grey skirt,smile,black socks,loafers

Long-sleeve uniform (長袖制服)

chihaya-default,asagumo chihaya,purple eyes,brown hair,parted bangs,long hair,school uniform,white jacket,long sleeves,bowties,grey skirt

Casual outfit (私服)

chihaya-casual,asagumo chihaya,purple eyes, brown hair, parted bangs,long hair, blue dress,collared dress, white collarbone,short sleeves,straw hat

---

Himemiya Karen (姫宮 華恋):

Recommended Weight: ~1.

CFG Scale: 5-7

Base Prompt/Def Clothing:

mkhekaren, long hair, hair intakes, braid, hair flower, large breasts,

anime screencap,

school uniform, white shirt, short sleeves, bowtie:1.5, red bowtie, yellow bowtie, shirt tucked in, grey skirt, pleated skirt, kneehighs, shoes,

school uniform, jacket, white shirt, bowtie:1.5, red bowtie, yellow bowtie, shirt tucked in, grey skirt, pleated skirt, kneehighs, shoes,

two-tone dress, head wings, necklace, black dress, short dress, purple dress, cleavage cutout, bare shoulders, elbow gloves, garter straps, black thighhighs,

two-tone dress, head wings, necklace, black dress, short dress, pink dress, cleavage cutout, bare shoulders, elbow gloves, garter straps, black thighhighs,

---

Basori Tiara (馬剃 天愛星):

Character Base & Outfits👗
🧬Basori Tiara
basori_cnr, 1girl, black hair, black eyes, mole on neck,hair bun, 
👗Default Outfit
basori_s1,pleated skirt, pantyhose, uwabaki, jacket, white shirt, blue bowtie, bowtie, long sleeves, 
👗Maid Outfit
basori_s2, dress, black dress,maid apron, long sleeves, short hair,enmaided, cat ears, maid headdress,
Explanation and notes below👇
How My LoRAs Work???
Each LoRA I create contains two key components: designed to balance faithful character representation with creative flexibility.

🧬Character base Prompt
The essence of the character: face, body, hair, eyes—all the good stuff! ✨

You can combine the Character Base Prompt with any clothing combinations you like. I can't promise all will work perfectly, but the vast majority should!

👗Dedicated Outfit Tag + Complementary Prompt

This prompt section corresponds to the default outfit(s) the character may have, and consists of a main tag + complementary tags to ensure the outfit generates correctly..

🎨 Technical Recommendations

Samplers: Euler or DPM++2M (25-35 steps).

ADetailer: Enable it for sharp facial details.

Ideal weight: 0.8 (adjust to 1.0 for complex details).

---

Nukumizu Kazuhiko (温水 和彦):

Trigger: Nukumizu Kazuhiko, short hair, black hair, brown eyes, ahoge

Summer school uniform: summer-uniform

Winter school uniform: winter-uniform

co-ntr battle suit: contr

Swimsuit: swimshorts (+blue hoodie)

Gym clothes: gymwear

Add modifiers such as `green necktie` as needed to fit more precisely.

To prevent feminization, increase the 1boy weight and add `male`, and add `shota` to the negative, etc.

---

Shikiya Yumeko (志喜屋 夢子):

Appearance:

Shikiya Yumeko,white hair,brown eyes,long hair,hair between eyes,

-

Clothes:

breasts,white shirt,pink bowtie,purple bowtie,pink jacket around waist,gray skirt,pleated_skirt,kneehighs,black socks,

torn pantyhose,pink nurse cap,breasts,pink shirt,white pantyhose,