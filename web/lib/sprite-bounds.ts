import type {SpriteBounds} from '@core/sprite-layout';

const cache=new Map<string,Promise<SpriteBounds>>();
const resolved=new Map<string,SpriteBounds>();

export function knownSpriteBounds(src:string):SpriteBounds|undefined{return resolved.get(src);}

/** Measure only a small alpha thumbnail; source pixels are never modified. */
export function spriteBounds(src:string):Promise<SpriteBounds>{
 const cached=cache.get(src);if(cached)return cached;
 const task=new Promise<SpriteBounds>((resolve)=>{
  const image=new Image();
  image.onload=()=>{
   const imageWidth=image.naturalWidth,imageHeight=image.naturalHeight;
   const full={x:0,y:0,width:imageWidth,height:imageHeight,imageWidth,imageHeight};
   try{
    const scale=Math.min(1,320/Math.max(imageWidth,imageHeight));
    const width=Math.max(1,Math.round(imageWidth*scale)),height=Math.max(1,Math.round(imageHeight*scale));
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d',{willReadFrequently:true});if(!context){resolve(full);return;}
    context.drawImage(image,0,0,width,height);
    const pixels=context.getImageData(0,0,width,height).data;
    let minX=width,minY=height,maxX=-1,maxY=-1;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
     if(pixels[(y*width+x)*4+3]<=16)continue;
     minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
    }
    if(maxX<0){resolve(full);return;}
    // Arms and skirts can widen the full silhouette; use only its upper
    // quarter to estimate the head's horizontal anchor.
    const headBottom=minY+Math.max(1,Math.ceil((maxY-minY+1)*0.25));
    let headMinX=width,headMaxX=-1;
    for(let y=minY;y<Math.min(height,headBottom);y++)for(let x=0;x<width;x++){
     if(pixels[(y*width+x)*4+3]<=16)continue;
     headMinX=Math.min(headMinX,x);headMaxX=Math.max(headMaxX,x);
    }
    const headX=(headMaxX>=0?(headMinX+headMaxX+1)/2:(minX+maxX+1)/2)*imageWidth/width;
    resolve({x:minX*imageWidth/width,y:minY*imageHeight/height,width:(maxX-minX+1)*imageWidth/width,height:(maxY-minY+1)*imageHeight/height,imageWidth,imageHeight,headX});
   }catch{resolve(full);} // External images may not permit canvas reads.
  };
  image.onerror=()=>resolve({x:0,y:0,width:1,height:1,imageWidth:1,imageHeight:1});
  image.src=src;
 }).then(bounds=>{resolved.set(src,bounds);return bounds;});
 cache.set(src,task);return task;
}
