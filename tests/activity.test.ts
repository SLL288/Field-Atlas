import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import express from 'express';
import type {AddressInfo} from 'node:net';
import {ActivityStore,ActivityError} from '../server/activity-store';
import {activityRouter,adminActivityRouter} from '../server/activity';
import {requireAdmin} from '../server/admin';
import {parseCoordinates} from '../shared/geo';
import {generateExport,type ExportFormat} from '../shared/exports';
import type {ActivityEvent} from '../shared/activity';
const geometry=()=>parseCoordinates('Archive test 7.25 -10.5','decimal',29,'N','Points');
function event(format?:ExportFormat):ActivityEvent{
 return {version:1,event_id:randomUUID(),client_id:randomUUID(),session_id:randomUUID(),occurred_at:new Date().toISOString(),
  action:format?'export':'plot',geometry:geometry(),context:{source:'coordinates',project_name:'Archive test',input_text:'Archive test 7.25 -10.5',input_crs:{system:'decimal',datum:'WGS84'}},
  ...(format?{format,filename:'archive-test.'+format.toLowerCase()}:{} )};
}
async function fixture(run:(store:ActivityStore)=>Promise<void>){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'field-atlas-activity-'));
 try{await run(new ActivityStore(root));}finally{await fs.rm(root,{recursive:true,force:true});}
}
test('plot and every export format create complete, byte-identical archives and readable daily logs',()=>fixture(async store=>{
 for(const format of [undefined,'KML','KMZ','GeoJSON','CSV'] as const){
  const e=event(format),saved=await store.save(e),record=saved.record;
  assert.equal(saved.duplicate,false);assert.equal(record.feature_count,1);assert.equal(record.context.project_name,'Archive test');
  const geo=JSON.parse(await fs.readFile(await store.file(e.event_id,'geometry.geojson'),'utf8'));assert.deepEqual(geo,e.geometry);
  const artifact=await fs.readFile(await store.file(e.event_id,format?'export.'+format.toLowerCase():'plot.kml'));
  assert.deepEqual(artifact,Buffer.from(await generateExport(e.geometry,format||'KML')));
  assert.equal(record.files[1].bytes,artifact.length);assert.match(record.files[1].sha256,/^[a-f0-9]{64}$/);
 }
 const first=await store.list(new Date().toISOString().slice(0,10),0,2);
 assert.equal(first.total,5);assert.equal(first.records.length,2);assert.equal(first.next_offset,2);
}));
test('simultaneous retries are idempotent and an ID cannot overwrite different content',()=>fixture(async store=>{
 const e=event('KMZ');const results=await Promise.all([store.save(e),store.save(e),store.save(e)]);
 assert.equal(results.filter(r=>!r.duplicate).length,1);
 assert.equal((await store.list(new Date().toISOString().slice(0,10))).total,1);
 await assert.rejects(store.save({...e,context:{source:'unknown'}}),err=>err instanceof ActivityError&&err.status===409);
 assert.equal((await store.get(e.event_id)).context.source,'coordinates');
}));
test('failed log writing leaves a complete recoverable event; retry repairs the index exactly once',()=>fixture(async store=>{
 await store.init();const day=new Date().toISOString().slice(0,10),file=path.join(store.directory,'logs',day+'.jsonl');
 await fs.writeFile(file,'broken\n');const e=event();
 await assert.rejects(store.save(e));
 const record=await store.get(e.event_id);assert.equal(record.files.length,2);
 await fs.writeFile(file,'');assert.equal((await store.save(e)).duplicate,true);await store.save(e);
 assert.equal((await store.list(day)).total,1);
}));
test('invalid geometry, oversized coordinate counts and traversal attempts are rejected',()=>fixture(async store=>{
 await assert.rejects(store.save({...event('KML'),filename:'../../outside.kml'}),/filename/);
 await assert.rejects(store.save({...event(),event_id:'../../outside'}),/identifiers/);
 await assert.rejects(store.get('../outside'),/ID/);
 await assert.rejects(store.list('../../outside'),/date/);
 const malformed=event();(malformed.geometry.features[0].geometry as any).coordinates=[181,7];await assert.rejects(store.save(malformed),/range/);
 const tooMany=event();tooMany.geometry.features[0].geometry={type:'MultiPoint',coordinates:Array.from({length:100001},()=>[-10,7])};
 await assert.rejects(store.save(tooMany),err=>err instanceof ActivityError&&err.status===413);
 const e=event();await store.save(e);await assert.rejects(store.file(e.event_id,'../../outside'),/not found/);
}));
test('anonymous receipt exposes no coordinates, and only an administrator can read or download archives',()=>fixture(async store=>{
 const prior=process.env.ADMIN_TOKEN;process.env.ADMIN_TOKEN='activity-test-secret';
 const app=express();app.use('/api/activity',activityRouter(store));app.use('/api/admin/activity',requireAdmin,adminActivityRouter(store));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.on('listening',()=>resolve()));
 const base='http://127.0.0.1:'+(server.address() as AddressInfo).port;
 try{
  const e=event('KML'),body=JSON.stringify(e);
  let response=await fetch(base+'/api/activity',{method:'POST',headers:{'Content-Type':'application/json'},body});
  assert.equal(response.status,201);const receipt=await response.json();assert.equal(receipt.event_id,e.event_id);assert.equal(receipt.geometry,undefined);
  response=await fetch(base+'/api/activity',{method:'POST',headers:{'Content-Type':'application/json'},body});assert.equal(response.status,200);
  assert.equal((await fetch(base+'/api/admin/activity')).status,401);
  const headers={Authorization:'Bearer activity-test-secret'};
  response=await fetch(base+'/api/admin/activity',{headers});assert.equal(response.status,200);assert.equal((await response.json()).total,1);
  response=await fetch(base+'/api/admin/activity/'+e.event_id+'/files/export.kml',{headers});assert.equal(response.status,200);assert.match(response.headers.get('content-disposition')!,/attachment/);assert.match(await response.text(),/<Point>/);
  assert.equal((await fetch(base+'/api/admin/activity/'+e.event_id+'/files/secret.env',{headers})).status,404);
 }finally{
  await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
  if(prior===undefined)delete process.env.ADMIN_TOKEN;else process.env.ADMIN_TOKEN=prior;
 }
}));
