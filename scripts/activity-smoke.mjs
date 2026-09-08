import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const b=await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
const context=await b.newContext(),p=await context.newPage();let block=false;const sent=new Map();
await p.route('**/api/activity',async route=>{const payload=route.request().postDataJSON();sent.set(payload.event_id,payload);if(block)await route.abort();else await route.continue();});
const queued=()=>p.evaluate(async()=>{
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('field-atlas-activity');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 const values=await new Promise((resolve,reject)=>{const r=db.transaction('outbox').objectStore('outbox').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});db.close();return values.filter(v=>v?.event).map(v=>v.event);
});
const waitEmpty=async()=>{for(let i=0;i<100;i++){if(!(await queued()).length)return;await p.waitForTimeout(200);}throw Error('Archive queue did not drain.');};
await p.goto('http://localhost:5173/?lang=en');await p.getByRole('button',{name:'Paste coordinates'}).click();
await p.getByLabel('Coordinates',{exact:true}).fill('Archive smoke test 7.25 -10.5');await p.getByLabel('Coordinate system').selectOption('decimal');await p.getByLabel('Create as').selectOption('Points');await p.getByRole('button',{name:'Create map →',exact:true}).click();await p.getByText('LICENSE CHECK',{exact:true}).waitFor();await waitEmpty();
const dl=p.waitForEvent('download');await p.getByRole('button',{name:'KMZ ↓',exact:true}).click();const download=await dl;const bytes=await fs.readFile(await download.path());await waitEmpty();
const exported=[...sent.values()].find(e=>e.action==='export'&&e.format==='KMZ');assert.ok(exported);
const root=path.resolve(process.env.ACTIVITY_DIR||path.join(process.env.DATA_DIR||'data','activity'));
assert.deepEqual(await fs.readFile(path.join(root,'events',exported.event_id,'export.kmz')),bytes);
block=true;await context.setOffline(true);await p.getByText(/OFFLINE — MME data/).waitFor();
await p.getByRole('button',{name:'＋ Coordinates',exact:true}).click();await p.getByLabel('Coordinates',{exact:true}).fill('Archive smoke offline 7.26 -10.51');await p.getByRole('button',{name:'Create map →',exact:true}).click();
const offlineDl=p.waitForEvent('download');await p.getByRole('button',{name:'KML ↓',exact:true}).click();await offlineDl;
const before=await queued();assert.equal(before.length,2);assert.equal(new Set(before.map(e=>e.client_id)).size,1);
for(const e of before)await assert.rejects(fs.access(path.join(root,'events',e.event_id)));
// Simulate a restarted page while the archive endpoint remains unavailable.
await context.setOffline(false);await p.reload();assert.deepEqual((await queued()).map(e=>e.event_id).sort(),before.map(e=>e.event_id).sort());
block=false;await p.getByRole('button',{name:'Settings',exact:false}).click();await p.getByRole('button',{name:'Retry uploads',exact:true}).click();await waitEmpty();
for(const e of before){const metadata=JSON.parse(await fs.readFile(path.join(root,'events',e.event_id,'metadata.json'),'utf8'));assert.equal(metadata.occurred_at,e.occurred_at);assert.equal(metadata.client_id,e.client_id);}
const record=JSON.parse(await fs.readFile(path.join(root,'events',exported.event_id,'metadata.json'),'utf8'));
const lines=(await fs.readFile(path.join(root,'logs',record.received_at.slice(0,10)+'.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
for(const id of sent.keys())assert.equal(lines.filter(r=>r.event_id===id).length,1);
await b.close();console.log('Activity browser smoke passed: plot/archive, exact KMZ bytes, offline plot/export, queue survives reload, retry reaches backend once per event. Test records are labeled Archive smoke.');
