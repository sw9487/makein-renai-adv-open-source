import { readFileSync,writeFileSync } from 'node:fs';
import { upgradeRoster, repairPortraits } from '../core/roster';
const path=new URL('../content/game.json',import.meta.url);
const current=JSON.parse(readFileSync(path,'utf8'));
writeFileSync(path,JSON.stringify(repairPortraits(upgradeRoster(current)),null,2)+'\n');
