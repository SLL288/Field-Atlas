import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
test('cache persists a good dataset, gates refresh, uses ETag, retains data after failure and recovers backup',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'field-atlas-cache-'));process.env.DATA_DIR=dir;
 const originalFetch=globalThis.fetch,originalNow=Date.now;let calls=0,conditional=0,fail=false;
 const body={type:'FeatureCollection',features:[{type:'Feature',properties:{id:'1',type:'Test',code:'TEST'},geometry:{type:'Polygon',coordinates:[[[-10,6],[-9,6],[-9,7],[-10,7],[-10,6]]]}}]};
 globalThis.fetch=async(input,init)=>{calls++;if(fail)return new Response('',{status:401});if(new Headers(init?.headers).get('If-None-Match')){conditional++;return new Response(null,{status:304});}return new Response(JSON.stringify(String(input).includes('dictionary')?[{name:'Test'}]:body),{headers:{etag:'"test"'}});};
 try{
  const cache=await import('../server/cache');await cache.initCache();await cache.sync();assert.equal(cache.snapshot().data.features.length,1);assert.equal(calls,3);
  await cache.sync();assert.equal(calls,3);
  Date.now=()=>originalNow()+7*60*60*1000;await cache.sync();assert.equal(conditional,3);
  const hash=cache.snapshot().meta.source_hash;fail=true;Date.now=()=>originalNow()+14*60*60*1000;
  await cache.sync();assert.equal(cache.snapshot().meta.source_hash,hash);assert.equal(cache.snapshot().data.features.length,1);assert.match(cache.snapshot().meta.error,/authorization/);
  await fs.writeFile(path.join(dir,'current.json'),'broken');await cache.initCache();assert.equal(cache.snapshot().data.features.length,1);
  assert.match(await fs.readFile(path.join(dir,'mme_licenses_latest.kml'),'utf8'),/<Polygon>/);
 }finally{globalThis.fetch=originalFetch;Date.now=originalNow;await fs.rm(dir,{recursive:true,force:true});}
});
