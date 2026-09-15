import type { ImageCrop } from '@core/types';
import {useId} from 'react';
import type {CSSProperties} from 'react';

/** SVG viewBox crops the displayed image without altering the source artwork. */
export function CharacterImage({src,alt,crop,className,style}:{src:string;alt:string;crop?:ImageCrop;className?:string;style?:CSSProperties}) {
  const clip=useId();
  return crop ? <svg className={className} role="img" aria-label={alt} viewBox={`${crop.x} ${crop.y} ${crop.width} ${crop.height}`} style={{aspectRatio:`${crop.width}/${crop.height}`,...style}} overflow="hidden">
    <title>{alt}</title>
    {crop.outline && <defs><clipPath id={clip}><polygon points={crop.outline.reduce<string[]>((a,n,i,all)=>i%2===0?[...a,`${n},${all[i+1]}`]:a,[]).join(' ')}/></clipPath></defs>}
    <image href={src} width={crop.imageWidth} height={crop.imageHeight} clipPath={crop.outline?`url(#${clip})`:undefined}/>
  </svg> : <img className={className} src={src} alt={alt} style={style}/>;
}
