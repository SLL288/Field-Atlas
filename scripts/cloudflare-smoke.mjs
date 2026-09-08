import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
const fc={type:'FeatureCollection',features:[{type:'Feature',properties:{id:'test-1',code:'TEST-1',type:'Class A',status:'Active'},geometry:{type:'Polygon',coordinates:[[[-10,6],[-9.99,6],[-9.99,6.01],[-10,6]]]}}]};
let requests=0,failSource=false;
const outboundService=async req=>{const url=new URL(req.url);if(url.hostname!=='repo-prod.revenuedev.org')throw Error('Unexpected upstream');if(url.pathname.startsWith('/api/map/geojson/')){requests++;return failSource?new Response('Denied',{status:403}):Response.json(fc);}if(url.pathname==='/api/dictionary/LR/types')return Response.json([{name:'Class A'}]);throw Error('Unexpected URL');};
const scriptPath=process.argv[2]||'/tmp/field-atlas-worker-build/worker.js';
const createRuntime=()=>new Miniflare(convertV4MiniflareOptions({modules:true,modulesRoot:path.dirname(scriptPath),scriptPath,compatibilityDate:'2026-04-01',compatibilityFlags:['nodejs_compat'],durableObjects:{ATLAS:{className:'Atlas',useSQLite:true}},r2Buckets:['FILES'],bindings:{ADMIN_TOKEN:'test-admin'},outboundService}));
let mf=createRuntime();
const call=(path,init)=>mf.dispatchFetch('https://test'+path,init);
try{
 assert.equal((await call('/api/health')).status,200);
 assert.equal((await call('/api/admin/activity')).status,401);
 const e={version:1,event_id:randomUUID(),client_id:randomUUID(),session_id:randomUUID(),occurred_at:new Date().toISOString(),action:'plot',geometry:fc,context:{source:'coordinates'}};
 const post=v=>call('/api/activity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(v)});
 const responses=await Promise.all([post(e),post(e)]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,201]);assert.equal((await post({...e,context:{source:'gps'}})).status,409);
 const bucket=await mf.getR2Bucket('FILES');assert.ok(await bucket.get(`activity/events/${e.event_id}/plot.kml`));
 for(const format of ['KML','KMZ','GeoJSON','CSV'])assert.equal((await post({...e,event_id:randomUUID(),action:'export',format,filename:'test.'+format.toLowerCase()})).status,201);
 const auth={headers:{Authorization:'Bearer test-admin'}};
 const list=await (await call('/api/admin/activity',auth)).json();assert.equal(list.total,5);
 assert.equal((await call(`/api/admin/activity/${e.event_id}/files/plot.kml`,auth)).status,200);
 assert.equal((await call(`/api/admin/activity/${e.event_id}/files/nope`,auth)).status,404);
 assert.equal((await call('/api/ocr/capabilities')).status,200);
 await call('/api/mme');let data;
 for(let i=0;i<80;i++){await new Promise(r=>setTimeout(r,100));data=await (await call('/api/mme')).json();if(data.data.features.length)break;}
 assert.equal(data.data.features.length,1,JSON.stringify(data.meta));assert.ok(data.meta.last_successful_update_at);assert.ok(await bucket.get('mme/current.json'));
 const before=requests;await call('/api/mme/refresh',{method:'POST'});await new Promise(r=>setTimeout(r,1200));assert.equal(requests,before,'refresh gate prevents repeat upstream traffic');
 const saved=await (await bucket.get('mme/current.json')).text();
 await mf.dispose();failSource=true;mf=createRuntime();
 const recovered=await mf.getR2Bucket('FILES');await recovered.put('mme/current.json',saved);
 await call('/api/mme');let failed;
 for(let i=0;i<80;i++){await new Promise(r=>setTimeout(r,100));failed=await (await call('/api/mme')).json();if(failed.meta.error)break;}
 assert.match(failed.meta.error,/authorization/);assert.equal(failed.data.features.length,1);assert.equal(await (await recovered.get('mme/current.json')).text(),saved);
 console.log('Cloudflare runtime passed: R2 artifacts, concurrent idempotency, four exports, protected log reads, MME alarm collection refresh gating and last-good retention after upstream denial.');
}finally{await mf.dispose();}
