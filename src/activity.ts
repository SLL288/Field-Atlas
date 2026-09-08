import {createStore,get,set,del,keys} from 'idb-keyval';
import {useEffect,useState} from 'react';
import type {ActivityContext,ActivityEvent} from '../shared/activity';
import {MAX_ACTIVITY_BYTES,validateActivityShape} from '../shared/activity';
import type {FeatureCollection} from 'geojson';
import type {ExportFormat} from '../shared/exports';

const store=createStore('field-atlas-activity','outbox');
type Pending={event:ActivityEvent;attempts:number;next_attempt_at:number;blocked:boolean;last_error?:string};
export type ArchiveStatus={pending:number;blocked:number;lastSavedAt:string|null;error:string};
let status:ArchiveStatus={pending:0,blocked:0,lastSavedAt:null,error:''};
const listeners=new Set<(s:ArchiveStatus)=>void>();
let running:Promise<void>|null=null,clientPromise:Promise<string>|null=null;
let memorySession:string|undefined;
function emit(){for(const listener of listeners)listener({...status});}
async function eventKeys(){return (await keys(store)).filter((key):key is string=>typeof key==='string'&&key.startsWith('event:'));}
async function updateStatus(){
 const ids=await eventKeys();let blocked=0,error='';
 for(const id of ids){const item=await get<Pending>(id,store);if(item?.blocked)blocked++;if(item?.last_error)error=item.last_error;}
 status={pending:ids.length,blocked,lastSavedAt:await get<string>('last-saved-at',store)||null,error};emit();
}
async function clientId(){
 if(!clientPromise)clientPromise=(async()=>{let id=await get<string>('client-id',store);if(!id){id=crypto.randomUUID();await set('client-id',id,store);}return id;})().catch(e=>{clientPromise=null;throw e;});
 return clientPromise;
}
function sessionId(){
 try{let id=sessionStorage.getItem('field-atlas-session');if(!id){id=crypto.randomUUID();sessionStorage.setItem('field-atlas-session',id);}return id;}
 catch{return memorySession??=crypto.randomUUID();}
}
export async function archiveAction(args:{action:'plot'|'export';geometry:FeatureCollection;context?:ActivityContext;format?:ExportFormat;filename?:string}){
 const event:ActivityEvent={
  version:1,event_id:crypto.randomUUID(),client_id:await clientId(),session_id:sessionId(),occurred_at:new Date().toISOString(),
  action:args.action,geometry:structuredClone(args.geometry),context:args.context||{source:'unknown'},
  ...(args.action==='export'?{format:args.format,filename:args.filename}:{})
 };
 validateActivityShape(event);
 if(new TextEncoder().encode(JSON.stringify(event)).byteLength>MAX_ACTIVITY_BYTES)throw Error('Activity is too large to archive.');
 try{await set('event:'+event.event_id,{event,attempts:0,next_attempt_at:0,blocked:false} satisfies Pending,store);}
 catch{throw Error('Cannot save the archive queue on this device. Free browser storage before plotting or exporting.');}
 await updateStatus();
 // A local durable copy exists before the plot/download proceeds. Uploads do not block offline work.
 void flushArchive();
 return event.event_id;
}
export function flushArchive(force=false){
 if(running)return running;
 running=(async()=>{
  if(!navigator.onLine){await updateStatus();return;}
  const order:{id:string;time:string}[]=[];
  for(const id of await eventKeys()){const entry=await get<Pending>(id,store);if(entry)order.push({id,time:entry.event.occurred_at});}
  order.sort((a,b)=>a.time.localeCompare(b.time)||a.id.localeCompare(b.id));
  for(const {id} of order){
   const pending=await get<Pending>(id,store);
   if(!pending||!force&&(pending.blocked||pending.next_attempt_at>Date.now()))continue;
   try{
    const response=await fetch('/api/activity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending.event),signal:AbortSignal.timeout(15000)});
    if(!response.ok){
     pending.blocked=response.status>=400&&response.status<500&&![408,429].includes(response.status);
     throw Error(pending.blocked?'Archive upload was rejected. Contact the operator or retry.':'Archive upload is pending. It will retry automatically.');
    }
    const receipt=await response.json();
    if(receipt.event_id!==pending.event.event_id||!Number.isFinite(Date.parse(receipt.received_at)))throw Error('Archive acknowledgement was invalid. Upload will retry.');
    await set('last-saved-at',receipt.received_at,store);
    await del(id,store);
   }catch(e){
    pending.attempts++;
    pending.next_attempt_at=Date.now()+Math.min(300000,5000*2**Math.min(pending.attempts-1,6));
    pending.last_error=e instanceof Error&&e.message.startsWith('Archive')?e.message:'Archive upload is pending. It will retry automatically.';
    await set(id,pending,store);
    // Avoid hammering an unavailable backend; permanent rejections do not block other actions.
    if(!pending.blocked)break;
   }
  }
  await updateStatus();
 })().catch(()=>{status={...status,error:'Cannot access the archive queue on this device.'};emit();}).finally(()=>{running=null;});
 return running;
}
export function useActivityArchive(){
 const [current,setCurrent]=useState<ArchiveStatus>(status);
 useEffect(()=>{
  listeners.add(setCurrent);void flushArchive();
  const online=()=>void flushArchive(true);
  window.addEventListener('online',online);
  const timer=setInterval(()=>void flushArchive(),30000);
  return()=>{listeners.delete(setCurrent);window.removeEventListener('online',online);clearInterval(timer);};
 },[]);
 return current;
}
