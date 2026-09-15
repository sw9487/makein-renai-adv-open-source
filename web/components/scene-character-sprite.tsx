'use client';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {ImageCrop} from '@core/types';
import type {SpriteBounds} from '@core/sprite-layout';
import {fitSprite,fitSpriteOnReference} from '@core/sprite-layout';
import {knownSpriteBounds,spriteBounds} from '../lib/sprite-bounds';
import {preloadSceneImage} from '../lib/scene-images';
import {CharacterImage} from './character-image';

export function SceneCharacterSprite({src,normalSrc,expressionReferenceSrc,normalCrop,alt,crop}:{src:string;normalSrc:string;expressionReferenceSrc?:string;normalCrop?:ImageCrop;alt:string;crop?:ImageCrop}){
 const stage=useRef<HTMLDivElement>(null);
 const layerNodes=useRef(new Map<string,HTMLDivElement>());
 const [size,setSize]=useState({width:0,height:0});
 const [layers,setLayers]=useState<{src:string;crop?:ImageCrop}[]>([{src,crop}]);
 const [visibleSrc,setVisibleSrc]=useState(src);
 const [measured,setMeasured]=useState<Record<string,SpriteBounds>>({});
 const [normalMeasured,setNormalMeasured]=useState<Record<string,SpriteBounds>>({});
 const [expressionMeasured,setExpressionMeasured]=useState<Record<string,SpriteBounds>>({});
 useLayoutEffect(()=>{
  const node=stage.current;if(!node)return;
  const update=()=>setSize({width:node.clientWidth,height:node.clientHeight});
  update();const observer=new ResizeObserver(update);observer.observe(node);
  return()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  let live=true;
  void spriteBounds(normalSrc).then(bounds=>{if(live)setNormalMeasured(previous=>({...previous,[normalSrc]:bounds}));});
  return()=>{live=false;};
 },[normalSrc]);
 useEffect(()=>{
  let live=true,firstFrame=0,secondFrame=0;
  setLayers(previous=>{
   const index=previous.findIndex(layer=>layer.src===src);
   if(index<0)return [...previous,{src,crop}];
   if(previous[index].crop===crop)return previous;
   return previous.map((layer,i)=>i===index?{src,crop}:layer);
  });
  const bounds=crop?Promise.resolve({x:0,y:0,width:crop.width,height:crop.height,imageWidth:crop.width,imageHeight:crop.height}):spriteBounds(src);
  const bundledExpression=!!expressionReferenceSrc&&/\/[^/]+-expression\.png(?:\?.*)?$/.test(src);
  const expressionBounds=bundledExpression?spriteBounds(expressionReferenceSrc):Promise.resolve(undefined);
  void Promise.all([preloadSceneImage(src),bounds,expressionBounds]).then(([image,result,reference])=>{
   if(!live)return;
   setMeasured(previous=>({...previous,[src]:result}));
   if(reference&&expressionReferenceSrc)setExpressionMeasured(previous=>({...previous,[expressionReferenceSrc]:reference}));
   if(!image.loaded||src===visibleSrc)return;
   // Wait for the actual replacement element to mount and decode. The old
   // layer remains painted until the new one can replace it in a single frame.
   const reveal=async()=>{
    if(!live)return;
    const node=layerNodes.current.get(src);
    if(!node){firstFrame=requestAnimationFrame(()=>void reveal());return;}
    const image=node.querySelector('img');
    if(image?.decode){try{await image.decode();}catch{return;}}
    if(live)secondFrame=requestAnimationFrame(()=>{if(live)setVisibleSrc(src);});
   };
   firstFrame=requestAnimationFrame(()=>void reveal());
  });
  return()=>{live=false;cancelAnimationFrame(firstFrame);cancelAnimationFrame(secondFrame);};
 },[src,crop,expressionReferenceSrc]);
 return <div className="scene-sprite-stage" ref={stage}>
  {layers.map(layer=>{
   const bounds=measured[layer.src]??(layer.crop?{x:0,y:0,width:layer.crop.width,height:layer.crop.height,imageWidth:layer.crop.width,imageHeight:layer.crop.height}:knownSpriteBounds(layer.src));
   const reference=normalMeasured[normalSrc]??knownSpriteBounds(normalSrc);
   const heightRatio=reference?reference.height/reference.imageHeight:undefined;
   const expressionReference=expressionReferenceSrc?(expressionMeasured[expressionReferenceSrc]??knownSpriteBounds(expressionReferenceSrc)):undefined;
   const bundledExpression=!!expressionReferenceSrc&&/\/[^/]+-expression\.png(?:\?.*)?$/.test(layer.src);
   const rect=bounds&&heightRatio
    ?bundledExpression
     ?expressionReference?fitSpriteOnReference(bounds,expressionReference,size.width,size.height,heightRatio,normalCrop?undefined:reference):null
     :fitSprite(bounds,size.width,size.height,'conversation',heightRatio)
    :null;
   return <div key={layer.src} ref={node=>{if(node)layerNodes.current.set(layer.src,node);else layerNodes.current.delete(layer.src);}} className="scene-sprite-layer" aria-hidden={layer.src!==visibleSrc} style={{opacity:layer.src===visibleSrc?1:0}}>
    <CharacterImage src={layer.src} alt={alt} crop={layer.crop} className="character-sprite" style={rect?{left:rect.left,top:rect.top,width:rect.width,height:rect.height}:{visibility:'hidden'}}/>
   </div>;
  })}
 </div>;
}
