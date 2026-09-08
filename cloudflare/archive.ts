import {createHash} from 'node:crypto';
import {validateActivityShape,MAX_ACTIVITY_BYTES,uuidPattern} from '../shared/activity';
import {validate} from '../shared/geo';
import {generateExport} from '../shared/exports';
import type {ActivityRecord} from '../server/activity-store';
export class HttpError extends Error {constructor(public status:number,message:string){super(message);}}
export const hash=(s:string|Uint8Array)=>createHash('sha256').update(s).digest('hex');
export class Archive {
 constructor(private bucket:R2Bucket,private sql:SqlStorage) {
 sql.exec('CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, received TEXT NOT NULL, summary TEXT NOT NULL)');
 sql.exec('CREATE INDEX IF NOT EXISTS events_received ON events(received)');
 }
 async get(id:string):Promise<ActivityRecord>{
  if(!uuidPattern.test(id))throw new HttpError(400,'Invalid archive ID.');
  const obj=await this.bucket.get(`activity/events/${id}/metadata.json`);if(!obj)throw new HttpError(404,'Archive record not found.');return obj.json();
 }
 // Called through the Durable Object's serial writer. Metadata is the commit marker.
 async save(input:unknown){
  try{validateActivityShape(input);}catch(e){throw new HttpError(400,(e as Error).message);}
  const event=input;const serialized=JSON.stringify(event);
  if(new TextEncoder().encode(serialized).length>MAX_ACTIVITY_BYTES)throw new HttpError(413,'Activity is too large to archive.');
  let count=0;const walk=(v:any,d=0)=>{if(d>6||!Array.isArray(v))throw new HttpError(400,'Invalid geometry.');if(typeof v[0]==='number'){if(++count>100000)throw new HttpError(413,'Too many coordinates.');}else for(const c of v)walk(c,d+1);};
  for(const f of event.geometry.features)walk((f.geometry as any)?.coordinates);
  try{validate(event.geometry);}catch(e){throw new HttpError(400,(e as Error).message);}
  const digest=hash(serialized);let record:ActivityRecord|undefined;
  try{record=await this.get(event.event_id);}catch(e){if(!(e instanceof HttpError&&e.status===404))throw e;}
  const duplicate=!!record;
  if(record&&record.request_sha256!==digest)throw new HttpError(409,'Archive ID was already used for different content.');
  if(!record){
   const format=event.action==='export'?event.format!:'KML';const name=event.action==='export'?`export.${format.toLowerCase()}`:'plot.kml';
   const files=[{name:'geometry.geojson',bytes:new TextEncoder().encode(JSON.stringify(event.geometry,null,2))},{name,bytes:await generateExport(event.geometry,format)}];
   for(const f of files)await this.bucket.put(`activity/events/${event.event_id}/${f.name}`,f.bytes);
   record={event_id:event.event_id,client_id:event.client_id,session_id:event.session_id,action:event.action,occurred_at:event.occurred_at,received_at:new Date().toISOString(),feature_count:event.geometry.features.length,geometry_types:[...new Set(event.geometry.features.map(f=>f.geometry.type))],context:event.context,...(event.action==='export'?{format:event.format,filename:event.filename}:{}),files:files.map(f=>({name:f.name,bytes:f.bytes.length,sha256:hash(f.bytes)})),request_sha256:digest};
   await this.bucket.put(`activity/events/${event.event_id}/metadata.json`,JSON.stringify(record,null,2));
  }
  const summary={...record,context:{...record.context,input_text:undefined},request_sha256:undefined,folder:`activity/events/${record.event_id}`};
  // Individual immutable log files avoid concurrent JSONL append loss in object storage.
  await this.bucket.put(`activity/logs/${record.received_at.slice(0,10)}/${record.event_id}.json`,JSON.stringify(summary));
  this.sql.exec('INSERT OR IGNORE INTO events (id,received,summary) VALUES (?,?,?)',record.event_id,record.received_at,JSON.stringify(summary));
  return {record,duplicate};
 }
 list(date:string,offset:number,limit:number){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>200)throw new HttpError(400,'Invalid date or pagination.');
  const prefix=date+'%';const total=Number(this.sql.exec('SELECT COUNT(*) AS n FROM events WHERE received LIKE ?',prefix).one().n);
  const rows=this.sql.exec('SELECT summary FROM events WHERE received LIKE ? ORDER BY received DESC,id DESC LIMIT ? OFFSET ?',prefix,limit,offset).toArray();
  return {date,total,records:rows.map(r=>JSON.parse(String(r.summary))),next_offset:offset+limit<total?offset+limit:null};
 }
 async file(id:string,name:string){const r=await this.get(id);if(name!=='metadata.json'&&!r.files.some(f=>f.name===name))throw new HttpError(404,'Archive file not found.');const obj=await this.bucket.get(`activity/events/${id}/${name}`);if(!obj)throw new HttpError(404,'Archive file not found.');return new Response(obj.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${name}"`,'Cache-Control':'no-store'}});}
}
