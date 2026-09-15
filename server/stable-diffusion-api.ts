import {imageHistory} from './image-history';
import {isEditor,json,sameOrigin} from './repository';
import {imageSettings,saveImageSettings} from './stable-diffusion';
export async function handle(req:Request){
 try{
  if(!await isEditor(req))return json({error:'請先登入 editor。'},401);
  if(req.method==='GET'&&new URL(req.url).searchParams.has('history'))return json({jobs:await imageHistory()});
  if(req.method==='POST'){sameOrigin(req);const raw=await req.text();if(raw.length>40000)throw Error('設定過大。');await saveImageSettings(JSON.parse(raw));}
  const {key,...settings}=await imageSettings();return json({...settings,key,configured:!!key});
 }catch(e){return json({error:e instanceof Error?e.message:'生圖設定儲存失敗。'},400);}
}
