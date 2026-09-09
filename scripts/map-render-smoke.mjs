import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
try{
 const context=await browser.newContext();const page=await context.newPage();page.setDefaultTimeout(20000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const workerResponses=[];page.on('response',r=>{if(/maplibre.*worker.*\.js/.test(r.url()))workerResponses.push({url:r.url(),status:r.status(),type:r.headers()['content-type']});});
 await page.goto(process.env.MAP_TEST_URL||'http://localhost:3001/?lang=en',{waitUntil:'domcontentloaded'});
 await page.locator('nav button').filter({hasText:'Map'}).click();
 // Inspect the actual renderer via React's map ref, without exposing a debug API in production.
 const rendered=()=>{const el=document.querySelector('.map-canvas');if(!el)return 0;let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber'))];for(;f;f=f.return)for(let h=f.memoizedState;h;h=h.next){const m=h.memoizedState?.current;if(m?.getStyle&&m.getLayer('official-fill'))return m.queryRenderedFeatures({layers:['official-fill']}).length;}return 0;};
 await page.waitForFunction(rendered);assert.ok(await page.evaluate(rendered)>0);
 assert.ok(workerResponses.some(r=>r.status===200&&/javascript/.test(r.type)),JSON.stringify(workerResponses));
 assert.deepEqual(errors,[]);
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await page.locator('nav button').filter({hasText:'Map'}).click();await page.waitForFunction(rendered);
 assert.ok(await page.evaluate(rendered)>0);assert.deepEqual(errors,[]);
 console.log('Map render smoke passed: emitted worker served as JavaScript, official polygons render online and after offline PWA reload.');
}finally{await browser.close();}
