import {uiText} from '../lib/i18n';
import { useState } from 'react';
import type { Character } from '@core/types';
import { CharacterImage } from './character-image';

export function CharacterAvatar({character}:{character?:Character}) {
  const [failed,setFailed]=useState('');
  const url=character?.avatar ?? '';
  return <span className="avatar" style={{background:character?.color+'20'}}>
    {url && character?.avatarCrop ? <CharacterImage src={url} alt={character.name} crop={character.avatarCrop} className="portrait-avatar"/> : url && failed!==url ? <img className="portrait-avatar" src={url} alt={character?.name ?? ''} onError={()=>setFailed(url)} />
      : <span aria-label={character?.name}>{character?.name.slice(0,1) ?? uiText("people")}</span>}
  </span>;
}
