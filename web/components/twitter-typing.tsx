export function TwitterTyping({label}:{label:string}){
 return <div className="tw-typing" role="status" aria-live="polite"><span>{label}</span><span className="tw-typing-dots" aria-hidden="true"><i/><i/><i/></span></div>;
}
