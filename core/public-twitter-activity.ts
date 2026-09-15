import {defaultPublicAccounts,hasPublicModule,type TwitterPublicAccount} from './twitter-public';

export const cityAccountId='official-toyohashi-city';
export const policeAccountId='official-toyohashi-police';
export const newsAccountId='official-higashiaichi-news';

const storeIds=new Set([
  'official-gusto-hashira','official-seibunkan','official-uno-uno',
  'official-bon-senga','official-murata-takoyaki','official-housendo-kalmia',
  'official-yamasa-west','official-coffee-canele','official-miyako-udon',
  'official-waltz','official-bontoraya','official-yamasa',
]);

export function isStoreAccount(id:string){return storeIds.has(id);}

/** Store promotion has its own cadence, with a stronger after-school window. */
export function selectStorePromotionAccounts(phase:number,important:boolean,draw=Math.random,accounts=defaultPublicAccounts()){
  const chance=(phase===1?0.5:phase===0?0.38:0.27)+(important?0.12:0);
  return accounts.filter(account=>hasPublicModule(account,'promotion')&&draw()<chance).map(account=>account.id);
}

/** Schools, museums, libraries and venues publish information independently of shops. */
export function selectCivicInformationAccounts(important:boolean,draw=Math.random,accounts=defaultPublicAccounts()){
  return accounts.filter(account=>hasPublicModule(account,'civic')&&draw()<(important?0.48:0.3)).map(account=>account.id);
}

export function shouldPublishPoliceAdvisory(important:boolean,draw=Math.random){
  return draw()<(important?0.58:0.42);
}

export function shouldPublishMunicipalOutreach(hasShareCandidates:boolean,important:boolean,draw=Math.random){
  return hasShareCandidates||draw()<(important?0.78:0.62);
}
