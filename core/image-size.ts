export type ImageSizePreset='large'|'medium'|'small';
export type SceneSize={width:number;height:number};
export function imageDimensions(preset:ImageSizePreset,line=false):SceneSize{
 const [width,height]=preset==='large'?[3840,2160]:preset==='medium'?[1920,1080]:[768,512];
 return line?{width:height,height:width}:{width,height};
}
