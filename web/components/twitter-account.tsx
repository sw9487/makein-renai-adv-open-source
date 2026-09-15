import type {Character} from '@core/types';
import {BadgeCheck,Lock} from 'lucide-react';
import {CharacterAvatar} from './character-avatar';
import {useI18n} from '../lib/i18n';

export function TwitterAccount({character,id,name,handle,color,avatar,isPrivate,verified=false,online=false,onlineLabel,onVisit}:{character?:Character;id:string;name?:string;handle:string;color?:string;avatar?:string;isPrivate:boolean;verified?:boolean;online?:boolean;onlineLabel:string;onVisit:(id:string)=>void}){
 const {t}=useI18n();
 const displayName=character?.name??name??id;
 return <button className="tw-account" onClick={()=>onVisit(id)}>
  <span className="tw-avatar-status">{character?<CharacterAvatar character={character}/>:<span className="avatar tw-official-avatar" style={{background:color}} aria-label={displayName}>{avatar&&<img src={avatar} alt=""/>}</span>}{online&&<i className="tw-online-dot" aria-label={onlineLabel} title={onlineLabel}/>}</span>
  <span data-i18n-skip><strong>{displayName}{verified&&<BadgeCheck className="tw-verified" size={15} aria-label={t('twitter.verifiedLabel')}/>}</strong><small>@{handle}</small></span>
  {isPrivate&&<Lock size={14}/>}
 </button>;
}
