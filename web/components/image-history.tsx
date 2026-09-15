import {uiText} from '../lib/i18n';
import {useState} from 'react';
import type {ImageHistory} from '../../server/image-history';
export function ImageHistoryPanel(){
  const [jobs,setJobs]=useState<ImageHistory[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function load(){
    setBusy(true);setError('');
    try{
      const response=await fetch('/api/stable-diffusion?history=1');const data=await response.json();
      if(!response.ok)throw Error(data.error);setJobs(data.jobs);
    }catch{setError(uiText("unable_to_read_birth_chart_record"));}finally{setBusy(false);}
  }
  return <details className="image-history"><summary>{uiText("recent_image_generation_history")}</summary>
    <p>{uiText("contains_plot_and_line_pictures_records_are_retained_after_the_service_is_restarted_interrupted_work_will")}</p>
    <button type="button" disabled={busy} onClick={()=>void load()}>{busy?uiText("loading"):uiText("load_refresh_history")}</button>
    {error&&<p role="status">{error}</p>}
    <ul>{jobs.map(job=><li key={job.id}>
      <span>{new Date(job.created).toLocaleString()} · {{queued:uiText("queued"),running:uiText("generating"),succeeded:uiText("complete"),failed:uiText("failed"),interrupted:uiText("interrupted")}[job.status]}</span>
      <p>{job.caption}</p>{job.notice&&<p>{job.notice}</p>}
      {job.url&&<a href={job.url} target="_blank" rel="noreferrer">{uiText("open_image")}</a>}
    </li>)}</ul>
  </details>;
}
