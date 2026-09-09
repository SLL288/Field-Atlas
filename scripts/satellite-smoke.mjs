import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage();page.setDefaultTimeout(25000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const state=()=>{const el=document.querySelector('.map-canvas');if(!el)return null;let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber'))];for(;f;f=f.return)for(let h=f.memoizedState;h;h=h.next){const m=h.memoizedState?.current;if(m?.getStyle&&m.getLayer('official-fill'))return {center:m.getCenter().toArray(),zoom:m.getZoom(),polygons:m.queryRenderedFeatures({layers:['official-fill']}).length,street:m.getLayoutProperty('base','visibility'),satellite:m.getLayer('satellite-base')?m.getLayoutProperty('satellite-base','visibility'):null};}return null;};
 await page.goto('http://localhost:3001/?lang=en',{waitUntil:'domcontentloaded'});await page.locator('nav button').filter({hasText:'Map'}).click();
 await page.waitForFunction(()=>!!document.querySelector('.maplibregl-canvas'));await page.waitForTimeout(1500);const before=await page.evaluate(state);
 const tile=page.waitForResponse(r=>r.url().includes('/World_Imagery/MapServer/tile/')&&r.status()===200);
 await page.getByLabel('Basemap',{exact:true}).selectOption('satellite');const response=await tile;assert.match(response.headers()['content-type'],/image/);
 await page.waitForTimeout(1000);const after=await page.evaluate(state);assert.equal(after.satellite,'visible');assert.equal(after.street,'none');assert.ok(after.polygons>0);assert.deepEqual(after.center,before.center);assert.equal(after.zoom,before.zoom);
 await page.reload({waitUntil:'domcontentloaded'});await page.locator('nav button').filter({hasText:'Map'}).click();assert.equal(await page.getByLabel('Basemap',{exact:true}).inputValue(),'satellite');
 await page.getByLabel('Language',{exact:true}).selectOption('zh');await page.getByLabel('底图',{exact:true}).selectOption('street');
 await page.setViewportSize({width:390,height:844});assert.ok(await page.getByLabel('底图',{exact:true}).isVisible());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 console.log('Satellite smoke passed: real imagery tiles, visible licence polygons, preserved viewport, remembered selection, Chinese controls and mobile layout.');
}finally{await browser.close();}
