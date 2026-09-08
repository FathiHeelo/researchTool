export function ThemeIcon({name}:{name:string}) {
 const paths:Record<string,string>={dashboard:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',table:'M3 4h18v16H3z M3 9h18 M9 9v11 M15 9v11 M3 14h18',results:'M3 4h18v16H3z M3 9h18 M8 9v11 M13 9v11',play:'M8 5l11 7-11 7z',chart:'M3 20V4 M3 20h18 M7 16V11h3v5 M13 16V6h3v10 M19 16V9',shield:'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 11l3 3 5-6',activity:'M2 12h4l3-7 5 14 3-7h5',file:'M5 3h9l5 5v13H5z M14 3v6h5 M8 13h8 M8 17h8',folder:'M3 6h7l2 3h9v11H3z',download:'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5'}
 return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]||paths.file}/></svg>
}
