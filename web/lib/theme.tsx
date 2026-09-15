import {createContext,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';
export type ThemePreference='system'|'light'|'dark';
const ThemeContext=createContext<{preference:ThemePreference;dark:boolean;setPreference:(value:ThemePreference)=>void;cycle:()=>void}|null>(null);
const KEY='makeine-theme';
export function ThemeProvider({children}:{children:ReactNode}){
 const [preference,setState]=useState<ThemePreference>(()=>{try{const value=localStorage.getItem(KEY);return value==='light'||value==='dark'||value==='system'?value:'system';}catch{return 'system';}});
 const [systemDark,setSystemDark]=useState(()=>typeof matchMedia!=='undefined'&&matchMedia('(prefers-color-scheme: dark)').matches);
 const dark=preference==='system'?systemDark:preference==='dark';
 useEffect(()=>{const query=matchMedia('(prefers-color-scheme: dark)');const update=()=>setSystemDark(query.matches);update();query.addEventListener('change',update);return()=>query.removeEventListener('change',update);},[]);
 useEffect(()=>{document.documentElement.classList.toggle('dark',dark);document.documentElement.style.colorScheme=dark?'dark':'light';document.documentElement.dataset.theme=preference;},[dark,preference]);
 const value=useMemo(()=>({preference,dark,setPreference(value:ThemePreference){setState(value);try{localStorage.setItem(KEY,value);}catch{}},cycle(){const next=preference==='system'?'light':preference==='light'?'dark':'system';setState(next);try{localStorage.setItem(KEY,next);}catch{}}}),[preference,dark]);
 return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useTheme(){const value=useContext(ThemeContext);if(!value)throw Error('ThemeProvider is missing.');return value;}
