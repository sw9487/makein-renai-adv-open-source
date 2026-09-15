export type SpriteBounds={x:number;y:number;width:number;height:number;imageWidth:number;imageHeight:number;headX?:number};
export type SpriteRect={left:number;top:number;width:number;height:number};

/** Frame the visible artwork. A character's normal portrait supplies the conversation height ratio. */
export function fitSprite(bounds:SpriteBounds,stageWidth:number,stageHeight:number,framing:'full'|'conversation'='full',heightRatio=1):SpriteRect{
 if(stageWidth<=0||stageHeight<=0||bounds.width<=0||bounds.height<=0)return {left:0,top:0,width:0,height:0};
 const ratio=Number.isFinite(heightRatio)?Math.min(1,Math.max(0.65,heightRatio)):1;
 const scale=Math.min(stageWidth/bounds.width,stageHeight/bounds.height*(framing==='conversation'?1.9*ratio:1));
 const ground=framing==='conversation'?stageHeight*1.9:stageHeight;
 // Lift low-set portraits while keeping their visible heads inside the stage.
 const lift=framing==='conversation'?Math.min(Math.max(0,ground-bounds.height*scale),stageHeight*0.17):0;
 return {
  left:stageWidth/2-(bounds.x+bounds.width/2)*scale,
  top:ground-(bounds.y+bounds.height)*scale-lift,
  width:bounds.imageWidth*scale,
  height:bounds.imageHeight*scale,
 };
}

/** Keep expression zoom fixed while pinning its head to one character-local point. */
export function fitSpriteOnReference(image:SpriteBounds,reference:SpriteBounds,stageWidth:number,stageHeight:number,heightRatio=1,normal?:SpriteBounds):SpriteRect{
 const frame=fitSprite(reference,stageWidth,stageHeight,'conversation',heightRatio);
 if(!frame.height||image.imageHeight<=0)return frame;
 // Old cached expression files may still have the pre-normalization 731px
 // canvas. Render either version into the same on-screen frame.
 const baseScale=frame.height/image.imageHeight;
 const visibleRatio=image.height/image.imageHeight;
 const referenceRatio=reference.height/reference.imageHeight;
 // A few full-body poses occupy a much smaller share of their transparent
 // canvas. Match the visible figure height without trimming hands or feet.
 const scale=visibleRatio<referenceRatio*0.88
  ?Math.min(baseScale*referenceRatio/visibleRatio,stageWidth/image.width)
  :baseScale;
 const width=image.imageWidth*scale;
 const anchor=normal??reference;
 const anchorFrame=normal?fitSprite(normal,stageWidth,stageHeight,'conversation',heightRatio):frame;
 const anchorScale=anchorFrame.height/anchor.imageHeight;
 const headX=anchorFrame.left+(anchor.headX??anchor.x+anchor.width/2)*anchorScale;
 const headY=anchorFrame.top+anchor.y*anchorScale;
 return {
  left:headX-(image.headX??image.x+image.width/2)*scale,
  top:headY-image.y*scale,
  width,
  height:image.imageHeight*scale,
 };
}
