import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import type {ActivityEvent} from '../shared/activity';
import {validateActivityShape,uuidPattern,MAX_ACTIVITY_BYTES} from '../shared/activity';
import {validate} from '../shared/geo';
import {generateExport} from '../shared/exports';

export class ActivityError extends Error{
 constructor(message:string,public status=400){super(message);}
}
export type ActivityRecord={
 event_id:string;client_id:string;session_id:string;action:'plot'|'export';
 occurred_at:string;received_at:string;feature_count:number;geometry_types:string[];
 format?:string;filename?:string;context:ActivityEvent['context'];
 files:{name:string;sha256:string;bytes:number}[];
 request_sha256:string;
};
const hash=(data:string|Uint8Array)=>createHash('sha256').update(data).digest('hex');
export class ActivityStore{
 private serial:Promise<unknown>=Promise.resolve();
 constructor(public directory=path.resolve(process.env.ACTIVITY_DIR||path.join(process.env.DATA_DIR||'data','activity'))){}
 async init(){
  await fs.mkdir(path.join(this.directory,'events'),{recursive:true,mode:0o700});
  await fs.mkdir(path.join(this.directory,'logs'),{recursive:true,mode:0o700});
 }
 private exclusive<T>(work:()=>Promise<T>):Promise<T>{
  const result=this.serial.then(work);this.serial=result.catch(()=>{});return result;
 }
 async get(id:string):Promise<ActivityRecord>{
  if(!uuidPattern.test(id))throw new ActivityError('Invalid archive ID.');
  try{return JSON.parse(await fs.readFile(path.join(this.directory,'events',id,'metadata.json'),'utf8'));}
  catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')throw new ActivityError('Archive record not found.',404);throw e;}
 }
 async save(input:unknown){
  try{validateActivityShape(input);}catch(e){throw new ActivityError((e as Error).message);}
  const event=JSON.parse(JSON.stringify(input)) as ActivityEvent;
  const serialized=JSON.stringify(event);
  if(Buffer.byteLength(serialized)>MAX_ACTIVITY_BYTES)throw new ActivityError('Activity is too large to archive.',413);
  // Bound work before geometry libraries inspect the payload.
  let coordinates=0;
  const walk=(value:any,depth=0)=>{
   if(depth>6||!Array.isArray(value))throw new ActivityError('Invalid activity geometry.');
   if(typeof value[0]==='number'){if(++coordinates>100000)throw new ActivityError('Too many coordinates to archive.',413);return;}
   for(const child of value)walk(child,depth+1);
  };
  for(const f of event.geometry.features)walk((f.geometry as any)?.coordinates);
  try{validate(event.geometry);}catch(e){throw new ActivityError((e as Error).message);}
  const requestHash=hash(serialized);
  return this.exclusive(async()=>{
   await this.init();
   let existing:ActivityRecord|undefined;
   try{existing=await this.get(event.event_id);}catch(e){if(!(e instanceof ActivityError&&e.status===404))throw e;}
   if(existing){
    if(existing.request_sha256!==requestHash)throw new ActivityError('Archive ID was already used for different content.',409);
    await this.ensureLog(existing);
    return {record:existing,duplicate:true};
   }
   const destination=path.join(this.directory,'events',event.event_id);
   const temporary=path.join(this.directory,'events','.pending-'+randomUUID());
   await fs.mkdir(temporary,{mode:0o700});
   try{
    const geometry=new TextEncoder().encode(JSON.stringify(event.geometry,null,2));
    const format=event.action==='export'?event.format!:'KML';
    const filename=event.action==='export'?'export.'+format.toLowerCase():'plot.kml';
    const artifact=await generateExport(event.geometry,format);
    const files=[{name:'geometry.geojson',bytes:geometry},{name:filename,bytes:artifact}];
    for(const file of files)await fs.writeFile(path.join(temporary,file.name),file.bytes,{mode:0o600});
    const record:ActivityRecord={
     event_id:event.event_id,client_id:event.client_id,session_id:event.session_id,action:event.action,
     occurred_at:event.occurred_at,received_at:new Date().toISOString(),
     feature_count:event.geometry.features.length,
     geometry_types:[...new Set(event.geometry.features.map(f=>f.geometry.type))],
     ...(event.action==='export'?{format:event.format,filename:event.filename}:{}),
     context:event.context,
     files:files.map(f=>({name:f.name,sha256:hash(f.bytes),bytes:f.bytes.length})),
     request_sha256:requestHash
    };
    await fs.writeFile(path.join(temporary,'metadata.json'),JSON.stringify(record,null,2),{mode:0o600});
    // The folder is visible only after both artifacts and metadata have been written.
    await fs.rename(temporary,destination);
    await this.ensureLog(record);
    return {record,duplicate:false};
   }finally{await fs.rm(temporary,{recursive:true,force:true});}
  });
 }
 private async ensureLog(record:ActivityRecord){
  const day=record.received_at.slice(0,10);
  const filename=path.join(this.directory,'logs',day+'.jsonl');
  let previous='';
  try{previous=await fs.readFile(filename,'utf8');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  const lines=previous.split('\n').filter(Boolean);
  if(lines.some(line=>JSON.parse(line).event_id===record.event_id))return;
  const {request_sha256,files,...summary}=record;
  const log={...summary,context:{...summary.context,input_text:undefined},folder:'events/'+record.event_id,files:files.map(f=>f.name)};
  const temporary=filename+'.'+randomUUID()+'.tmp';
  try{await fs.writeFile(temporary,previous+JSON.stringify(log)+'\n',{mode:0o600});await fs.rename(temporary,filename);}
  finally{await fs.rm(temporary,{force:true});}
 }
 async list(date:string,offset=0,limit=50){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>200)throw new ActivityError('Invalid archive date or pagination.');
  let lines:string[];
  try{lines=(await fs.readFile(path.join(this.directory,'logs',date+'.jsonl'),'utf8')).split('\n').filter(Boolean).reverse();}
  catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {date,total:0,records:[],next_offset:null};throw e;}
  return {date,total:lines.length,records:lines.slice(offset,offset+limit).map(s=>JSON.parse(s)),next_offset:offset+limit<lines.length?offset+limit:null};
 }
 async file(id:string,name:string){
  const record=await this.get(id);
  if(name!=='metadata.json'&&!record.files.some(f=>f.name===name))throw new ActivityError('Archive file not found.',404);
  return path.join(this.directory,'events',id,name);
 }
}
