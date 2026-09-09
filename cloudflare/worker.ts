import {DurableObject} from 'cloudflare:workers';
import {timingSafeEqual} from 'node:crypto';
import {Archive,HttpError,hash} from './archive';
import {collect,verifyUpdate,geometryWarning,INITIAL,type Resource} from '../server/source';
import {empty} from '../shared/geo';
import {recognizeHandwriting} from '../server/handwriting';
import {MAX_ACTIVITY_BYTES} from '../shared/activity';
import {generateExport} from '../shared/exports';
interface Env {FILES:R2Bucket;ATLAS:DurableObjectNamespace;ADMIN_TOKEN?:string;OPENAI_API_KEY?:string;OPENAI_VISION_MODEL?:string}
const INTERVAL=6*60*60*1000;
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
async function body(req:Pick<Request,'headers'|'body'>,max:number){
 if(Number(req.headers.get('content-length'))>max)throw new HttpError(413,'Request too large.');
 const reader=req.body?.getReader();if(!reader)return new Uint8Array();let size=0;const chunks:Uint8Array[]=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new HttpError(413,'Request too large.');}chunks.push(value);}
 const out=new Uint8Array(size);let offset=0;for(const c of chunks){out.set(c,offset);offset+=c.length;}return out;
}
export default {
 fetch(request:Request,env:Env){return env.ATLAS.get(env.ATLAS.idFromName('atlas-v1')).fetch(request);},
 async scheduled(_event:ScheduledController,env:Env){const response=await env.ATLAS.get(env.ATLAS.idFromName('atlas-v1')).fetch('https://internal/api/mme/refresh',{method:'POST'});if(!response.ok)throw Error('Cannot schedule MME refresh.');}
};
export class Atlas extends DurableObject<Env>{
 private archive:Archive;
 private serial:Promise<unknown>=Promise.resolve();
 private syncing=false;
 private active=0;
 private photoActive=0;
 private attempts=new Map<string,{time:number;count:number}>();
 constructor(ctx:DurableObjectState,env:Env){super(ctx,env);this.archive=new Archive(env.FILES,ctx.storage.sql);}
 private exclusive<T>(fn:()=>Promise<T>):Promise<T>{const p=this.serial.then(fn);this.serial=p.catch(()=>{});return p;}
 private admin(req:Request){const actual=Buffer.from(req.headers.get('Authorization')||'');const expected=Buffer.from('Bearer '+this.env.ADMIN_TOKEN);if(!this.env.ADMIN_TOKEN||actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new HttpError(401,'Administrator authentication required.');}
 private rate(req:Request,kind:string,max:number){const now=Date.now();for(const [k,v] of this.attempts)if(now-v.time>=60000)this.attempts.delete(k);const key=kind+':'+(req.headers.get('CF-Connecting-IP')||'unknown');const v=this.attempts.get(key)||{time:now,count:0};if(v.count>=max||this.attempts.size>=10000)throw new HttpError(429,'Too many requests. Please retry later.');v.count++;this.attempts.set(key,v);}
 private async queue(force=false){
  const last=await this.ctx.storage.get<number>('checked')||0;
  const scheduled=await this.ctx.storage.getAlarm();
  if(!this.syncing&&Date.now()-last>=(force?900000:INTERVAL)&&(scheduled===null||scheduled>Date.now()+1000))await this.ctx.storage.setAlarm(Date.now()+1000);
 }
 async fetch(req:Request):Promise<Response>{
  try{
   const url=new URL(req.url),p=url.pathname;
   if(p.startsWith('/api/admin/'))this.admin(req);
   if(req.method==='GET'&&p==='/api/health')return json({ok:true,storage:'R2 + Durable Object'});
   if(req.method==='GET'&&p==='/api/mme'){
    await this.queue();const obj=await this.env.FILES.get('mme/current.json');const current:any=obj?await obj.json():{data:empty(),meta:{source_url:INITIAL,feature_count:0}};
    const status=await this.ctx.storage.get<any>('sync-status');return json({...current,meta:{...current.meta,...status,sync_in_progress:this.syncing||((await this.ctx.storage.getAlarm())??Infinity)<=Date.now()+3000}});
   }
   if(req.method==='POST'&&(p==='/api/mme/refresh'||p==='/api/admin/mme/refresh')){await this.queue(p.includes('/admin/'));return json({message:'Refresh scheduled if due.'},202);}
   if(req.method==='POST'&&p==='/api/activity'){
    this.rate(req,'activity',120);if(this.active>=2)throw new HttpError(429,'Archive is busy. Please retry.');this.active++;
    try{let input:unknown;try{input=JSON.parse(new TextDecoder().decode(await body(req,MAX_ACTIVITY_BYTES)));}catch(e){if(e instanceof HttpError)throw e;throw new HttpError(400,'Invalid activity JSON.');}
     const {record,duplicate}=await this.exclusive(()=>this.archive.save(input));return json({event_id:record.event_id,received_at:record.received_at,duplicate},duplicate?200:201);
    }finally{this.active--;}
   }
   if(req.method==='GET'&&p==='/api/admin/activity')return json(this.archive.list(url.searchParams.get('date')||new Date().toISOString().slice(0,10),Number(url.searchParams.get('offset')||0),Number(url.searchParams.get('limit')||50)));
   const file=p.match(/^\/api\/admin\/activity\/([^/]+)\/files\/([^/]+)$/);if(req.method==='GET'&&file)return await this.archive.file(file[1],file[2]);
   const record=p.match(/^\/api\/admin\/activity\/([^/]+)$/);if(req.method==='GET'&&record)return json(await this.archive.get(record[1]));
   if(req.method==='GET'&&p==='/api/ocr/capabilities')return json({handwritingAvailable:!!this.env.OPENAI_API_KEY,provider:'OpenAI'});
   if(req.method==='POST'&&p==='/api/ocr/handwriting'){
    if(!this.env.OPENAI_API_KEY)throw new HttpError(503,'Handwriting recognition is not configured. Use local reading or manual review.');
    this.rate(req,'photo',5);if(this.photoActive>=2)throw new HttpError(429,'Handwriting service is busy.');this.photoActive++;
    try{const bytes=Buffer.from(await body(req,10*1024*1024));const mime=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'image/webp':null;if(!mime)throw new HttpError(400,'Use a valid JPEG, PNG or WebP image.');
     return json(await recognizeHandwriting(bytes,mime,fetch,{key:this.env.OPENAI_API_KEY,model:this.env.OPENAI_VISION_MODEL}));
    }finally{this.photoActive--;}
   }
   const download=p.match(/^\/api\/mme\/mme_licenses_latest\.(kml|geojson)$/);
   if(req.method==='GET'&&download){this.rate(req,'activity',120);const obj=await this.env.FILES.get('mme/current.json');if(!obj)throw new HttpError(503,'MME data not yet available.');const current:any=await obj.json();const format=download[1]==='kml'?'KML':'GeoJSON';const filename='mme_licenses_latest.'+download[1];await this.exclusive(()=>this.archive.save({version:1,event_id:crypto.randomUUID(),client_id:crypto.randomUUID(),session_id:crypto.randomUUID(),occurred_at:new Date().toISOString(),action:'export',geometry:current.data,format,filename,context:{source:'mme_dataset',mme_updated_at:current.meta.last_successful_update_at}}));return new Response(new Uint8Array(await generateExport(current.data,format)).buffer,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${filename}"`,'Cache-Control':'no-store'}});}
   return json({error:'API route not found.'},404);
  }catch(e){if(e instanceof HttpError)return json({error:e.message},e.status);console.error('Backend operation failed',e instanceof Error?e.name:'unknown');return json({error:'Backend operation failed. Please retry later.'},503);}
 }
 async alarm(){
  if(this.syncing)return;this.syncing=true;
  const checked=new Date().toISOString();await this.ctx.storage.put('checked',Date.now());
  await this.ctx.storage.put('sync-status',{last_checked_at:checked});
  try{
   const oldObj=await this.env.FILES.get('mme/current.json');const old:any=oldObj?await oldObj.json():{data:empty(),meta:{}};
   const resourceObj=await this.env.FILES.get('mme/resources.json');const resources:Record<string,Resource>=resourceObj?await resourceObj.json():{};
   const next=await collect(resources,async(url,previous)=>{
    const headers:Record<string,string>={Accept:'application/json','User-Agent':'FieldAtlas/1.0 (public GIS cache)'};if(previous?.etag)headers['If-None-Match']=previous.etag;else if(previous?.modified)headers['If-Modified-Since']=previous.modified;
    const response=await fetch(url,{headers,signal:AbortSignal.timeout(60000)});
    if(response.status===304&&previous)return previous;
    if(!response.ok)throw Error(response.status===401||response.status===403?'Public source requires authorization; last good data retained.':'MME HTTP '+response.status);
    const bytes=await body(response,50*1024*1024);const parsed=JSON.parse(new TextDecoder().decode(bytes));if(parsed?.success===false)throw Error('MME declined public request.');
    return {body:parsed,etag:response.headers.get('etag')||undefined,modified:response.headers.get('last-modified')||undefined};
   });
   verifyUpdate(next.data,old.data.features.length);const digest=hash(JSON.stringify(next.data));const now=new Date().toISOString();
   const current={data:next.data,meta:{source_url:INITIAL,source_hash:digest,feature_count:next.data.features.length,source_feature_count:next.sourceCount,excluded_feature_count:next.quarantined.length,cleaned_feature_count:next.cleaned,repaired_feature_count:next.repaired,partial_feature_count:next.partial,reference_point_count:next.referencePoints,reference_line_count:next.referenceLines,geometry_warning:geometryWarning(next.quarantined.length,next.repaired,next.partial,next.referencePoints,next.referenceLines),last_checked_at:checked,last_successful_update_at:now,content_changed_at:digest===old.meta.source_hash?old.meta.content_changed_at:now,coverage:'All public Active Licenses type partitions; applications and unmapped records excluded.'}};
   await this.env.FILES.put('mme/resources.json',JSON.stringify(next.resources));
   await this.env.FILES.put('mme/quarantined.json',JSON.stringify(next.quarantined));
   if(oldObj)await this.env.FILES.put('mme/last-known-good.json',JSON.stringify(old));
   await this.env.FILES.put('mme/current.json',JSON.stringify(current));
   await this.ctx.storage.put('sync-status',{last_checked_at:checked});
  }catch(e){await this.ctx.storage.put('sync-status',{last_checked_at:checked,error:e instanceof Error?e.message:'MME refresh failed; last good data retained.'});}
  finally{this.syncing=false;await this.ctx.storage.setAlarm(Math.max(Date.now()+1000,Date.parse(checked)+INTERVAL));}
 }
}
