import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {empty,kml} from '../shared/geo';
import {collect,verifyUpdate,geometryWarning,INITIAL,type Resource} from './source';
import type {FeatureCollection} from 'geojson';
export const INTERVAL=6*60*60*1000;
const directory=path.resolve(process.env.DATA_DIR||'data');
type Cache={data:FeatureCollection;meta:Record<string,any>;resources:Record<string,Resource>};
let current:Cache={data:empty(),meta:{source_url:INITIAL,feature_count:0},resources:{}};
let running:Promise<void>|null=null;
export const snapshot=():{data:FeatureCollection;meta:Record<string,any>}=>({data:current.data,meta:{...current.meta,sync_in_progress:!!running}});
export async function initCache(){
 await fs.mkdir(directory,{recursive:true});
 for(const file of ['current.json','last-known-good.json']){
  try{const c=JSON.parse(await fs.readFile(path.join(directory,file),'utf8'));verifyUpdate(c.data);current=c;break;}catch{}
 }
}
async function persist(value:Cache,file='current.json'){
 const target=path.join(directory,file);await fs.writeFile(target+'.tmp',JSON.stringify(value));await fs.rename(target+'.tmp',target);
}
async function request(url:string,old?:Resource):Promise<Resource>{
 let last:unknown;
 for(let attempt=0;attempt<3;attempt++){
  try{
   const headers:Record<string,string>={'Accept':'application/json','User-Agent':'FieldAtlas/1.0 (public GIS cache)'};
   if(old?.etag)headers['If-None-Match']=old.etag;else if(old?.modified)headers['If-Modified-Since']=old.modified;
   const r=await fetch(url,{headers,signal:AbortSignal.timeout(60000)});
   if(r.status===304&&old)return old;
   if(r.status===401||r.status===403)throw Object.assign(Error('Public source requires authorization; sync stopped.'),{stop:true});
   if(!r.ok)throw Error('MME HTTP '+r.status);
   if(Number(r.headers.get('content-length'))>50*1024*1024)throw Error('Source response too large.');
   let text='';if(!r.body)throw Error('Empty HTTP body.');const decoder=new TextDecoder();
   for await(const chunk of r.body as any){text+=decoder.decode(chunk,{stream:true});if(text.length>50*1024*1024)throw Error('Source response too large.');}
   text+=decoder.decode();const body=JSON.parse(text);if(body?.success===false)throw Object.assign(Error('MME declined public request.'),{stop:true});
   return {body,etag:r.headers.get('etag')||undefined,modified:r.headers.get('last-modified')||undefined};
  }catch(e){last=e;if((e as any).stop)throw e;if(attempt<2)await new Promise(r=>setTimeout(r,2000*2**attempt));}
  finally{await new Promise(r=>setTimeout(r,300));}
 }
 throw last;
}
export function sync(force=false){
 if(running)return running;
 // Manual requests cannot aggressively poll upstream, including after failed checks.
 const elapsed=Date.now()-Date.parse(current.meta.last_checked_at||'1970-01-01');
 if(elapsed<(force?15*60*1000:INTERVAL))return Promise.resolve();
 running=(async()=>{
  current.meta.last_checked_at=new Date().toISOString();
  try{
   const next=await collect(current.resources,request);verifyUpdate(next.data,current.data.features.length);
   const hash=createHash('sha256').update(JSON.stringify(next.data)).digest('hex');
   const nextCache:Cache={...next,meta:{source_url:INITIAL,source_hash:hash,feature_count:next.data.features.length,source_feature_count:next.sourceCount,excluded_feature_count:next.quarantined.length,cleaned_feature_count:next.cleaned,repaired_feature_count:next.repaired,partial_feature_count:next.partial,reference_point_count:next.referencePoints,reference_line_count:next.referenceLines,geometry_warning:geometryWarning(next.quarantined.length,next.repaired,next.partial,next.referencePoints,next.referenceLines),last_checked_at:current.meta.last_checked_at,last_successful_update_at:new Date().toISOString(),content_changed_at:hash===current.meta.source_hash?current.meta.content_changed_at:new Date().toISOString(),coverage:'All public Active Licenses type partitions; applications and unmapped records excluded.'}};
   // Persist coherent data and metadata before swapping the in-memory snapshot.
   await persist(nextCache);
   current=nextCache;
   await persist(nextCache,'last-known-good.json');
   await fs.writeFile(path.join(directory,'mme_licenses_latest.kml.tmp'),kml(next.data));await fs.rename(path.join(directory,'mme_licenses_latest.kml.tmp'),path.join(directory,'mme_licenses_latest.kml'));
   console.log('MME cache validated:',next.data.features.length,'features');
  }catch(e){current.meta.error=e instanceof Error?e.message:String(e);console.error(current.meta.error);if(current.data.features.length)await persist(current);}
 })().finally(()=>{running=null;});
 return running;
}
