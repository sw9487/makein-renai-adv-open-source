export function TwitterUpload({label}:{label:string}){
 return <div className="tw-upload" role="status" aria-live="polite" aria-busy="true"><div className="tw-upload-preview" aria-hidden="true"/><span>{label}</span><div className="tw-upload-track" aria-hidden="true"><i/></div></div>;
}
