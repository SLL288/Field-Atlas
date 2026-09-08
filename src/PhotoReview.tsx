import {useEffect,useState} from 'react';
import {candidateText,extractCandidates,validateReading,type PhotoReading,type CoordinateCandidate} from '../shared/ocr';
import {fullCrop,preparePhoto,readPrintedPhoto} from './photo';
type Props={file:File;t:(text:string)=>string;onClose:()=>void;onUse:(text:string,reading:PhotoReading)=>void};
const blank=():CoordinateCandidate=>({name:'',first:'',second:'',uncertain:true,note:''});
export default function PhotoReview({file,t,onClose,onUse}:Props){
 const [crop,cropSet]=useState(fullCrop),[rotation,rotationSet]=useState(0),[enhance,enhanceSet]=useState(true);
 const [prepared,preparedSet]=useState<Blob|null>(null),[preview,previewSet]=useState(''),[available,availableSet]=useState(false),[capabilityChecked,capabilityCheckedSet]=useState(false);
 const [busy,busySet]=useState(''),[error,errorSet]=useState(''),[reading,readingSet]=useState<PhotoReading|null>(null),[progress,progressSet]=useState(0);
 useEffect(()=>{let live=true;void fetch('/api/ocr/capabilities').then(r=>r.json()).then(v=>{if(live)availableSet(v.handwritingAvailable===true);}).catch(()=>{}).finally(()=>{if(live)capabilityCheckedSet(true);});return()=>{live=false;};},[]);
 useEffect(()=>{
  let cancelled=false,url='';preparedSet(null);errorSet('');
  const timer=setTimeout(()=>{void preparePhoto(file,crop,rotation,enhance).then(blob=>{if(cancelled)return;preparedSet(blob);url=URL.createObjectURL(blob);previewSet(url);}).catch(e=>{if(!cancelled)errorSet(e.message);});},150);
  return()=>{cancelled=true;clearTimeout(timer);if(url)URL.revokeObjectURL(url);};
 },[file,crop,rotation,enhance]);
 async function recognize(server:boolean){
  if(!prepared)return;busySet(server?'Reading handwriting…':'Reading printed text…');progressSet(0);errorSet('');
  try{
   let result:PhotoReading;
   if(server){const response=await fetch('/api/ocr/handwriting',{method:'POST',headers:{'Content-Type':'image/png'},body:prepared,signal:AbortSignal.timeout(100000)});const body=await response.json();if(!response.ok)throw Error(body.error||'Recognition failed.');result=validateReading(body);}
   else result=await readPrintedPhoto(prepared,progressSet);
   readingSet(result);
   if(!result.rows.length)errorSet('No coordinate rows were recognized. You can enter them below while viewing the photo.');
  }catch(e){errorSet(e instanceof Error?e.message:'Recognition failed.');readingSet({rows:[],rawText:'',system:'unknown',zone:null,hemisphere:null,datum:null});}
  finally{busySet('');}
 }
 function updateRow(i:number,key:keyof CoordinateCandidate,value:string){if(!reading)return;readingSet({...reading,rows:reading.rows.map((r,j)=>j===i?{...r,[key]:value}:r)});}
 return <div className="modal-backdrop"><section className="modal photo-modal" role="dialog" aria-modal="true" aria-labelledby="photo-title">
  <button className="close" disabled={!!busy} onClick={onClose} aria-label={t('Close photo')}>×</button>
  <p className="eyebrow">{t('PHOTO → COORDINATES')}</p><h2 id="photo-title">{t('Read a coordinate photo')}</h2>
  <p>{t('Crop to the coordinate list. Handwriting needs careful review; unreadable digits must not be guessed.')}</p>
  <div className="photo-columns"><div>
   {preview&&<img className="photo-preview" src={preview} alt={t('Coordinate photo preview')}/>}
   {!reading&&<fieldset disabled={!!busy}><legend>{t('Prepare photo')}</legend>
    <button onClick={()=>{rotationSet((rotation+90)%360);cropSet(fullCrop);}}>{t('Rotate 90°')}</button>
    <button onClick={()=>{cropSet(fullCrop);rotationSet(0);}}>{t('Reset crop')}</button>
    {(['top','bottom','left','right'] as const).map(side=><label key={side}>{t({top:'Crop top',bottom:'Crop bottom',left:'Crop left',right:'Crop right'}[side])} {crop[side]}%<input type="range" min={side==='bottom'?crop.top+5:side==='right'?crop.left+5:0} max={side==='top'?crop.bottom-5:side==='left'?crop.right-5:100} value={crop[side]} onChange={e=>cropSet({...crop,[side]:+e.target.value})}/></label>)}
    <label className="check"><input type="checkbox" checked={enhance} onChange={e=>enhanceSet(e.target.checked)}/>{t('Improve contrast')}</label>
   </fieldset>}
  </div><div>
   {!reading?<><h3>{t('Choose how to read')}</h3><p>{t('Printed text is processed on this device. For handwriting, use the server reader or transcribe beside the photo.')}</p>
    <button className="primary full" disabled={!!busy||!prepared} onClick={()=>void recognize(false)}>{t('Read printed text locally')}</button>
    <button className="full" disabled={!!busy||!prepared||!available} onClick={()=>void recognize(true)}>{t('Read handwriting with server')}</button>
    <small>{available?t('Sends this cropped photo to OpenAI through our server for recognition. The app does not save the photo on the server.'):capabilityChecked?t('Handwriting reader is not configured. Local reading and manual entry remain available.'):t('Checking handwriting service…')}</small>
    <button className="full" disabled={!!busy||!prepared} onClick={()=>readingSet({rows:[blank()],rawText:'',system:'unknown',zone:null,hemisphere:null,datum:null})}>{t('Enter coordinates beside photo')}</button>
   </>:<><h3>{t('Review detected rows')}</h3><p>{t('Numbers are suggestions, not verified survey data. Keep row order and correct every digit against the photo.')}</p>
    <div className="coordinate-rows">{reading.rows.map((row,i)=><div className="coordinate-row" key={i}><label>{t('Point name')}<input aria-label={t('Point name')+' '+(i+1)} value={row.name} placeholder={String(i+1)} onChange={e=>updateRow(i,'name',e.target.value)}/></label><label>{t('Easting / Latitude')}<input aria-label={t('Easting / Latitude')+' '+(i+1)} inputMode="decimal" value={row.first} onChange={e=>updateRow(i,'first',e.target.value)}/></label><label>{t('Northing / Longitude')}<input aria-label={t('Northing / Longitude')+' '+(i+1)} inputMode="decimal" value={row.second} onChange={e=>updateRow(i,'second',e.target.value)}/></label><button aria-label={t('Remove row')+' '+(i+1)} onClick={()=>readingSet({...reading,rows:reading.rows.filter((_,j)=>j!==i)})}>×</button>{row.note&&<small className="row-note">{t(row.note)}</small>}</div>)}</div>
    <div className="map-buttons"><button onClick={()=>readingSet({...reading,rows:[...reading.rows,blank()]})}>{t('Add row')}</button><button onClick={()=>{readingSet(null);errorSet('');}}>{t('Retry with another crop')}</button></div>
    <details><summary>{t('Raw recognized text')}</summary><textarea aria-label={t('Raw recognized text')} rows={5} value={reading.rawText} onChange={e=>readingSet({...reading,rawText:e.target.value})}/><button onClick={()=>readingSet(extractCandidates(reading.rawText))}>{t('Extract rows from text')}</button></details>
    <p className="warning">{t('The photo may not specify the UTM zone or datum. You must confirm these on the next screen.')}</p>
    <button className="primary full" onClick={()=>{try{onUse(candidateText(reading.rows),reading);}catch(e){errorSet((e as Error).message);}}}>{t('Continue to coordinate review')}</button>
   </>}
   {busy&&<p role="status">{t(busy)} {progress>0?progress+'%':''}</p>}
   {error&&<p className="warning" role="alert">{t(error)}</p>}
  </div></div>
 </section></div>;
}
