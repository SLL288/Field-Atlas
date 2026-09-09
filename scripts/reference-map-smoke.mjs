import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const fixture=JSON.parse(await fs.readFile('/tmp/atlas-reference-fixture.json','utf8'));
const browser=await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage();page.setDefaultTimeout(20000);await page.route('**/api/mme',r=>r.fulfill({json:fixture}));
 await page.goto('http://localhost:3001/?lang=en',{waitUntil:'domcontentloaded'});await page.locator('nav button').filter({hasText:'Map'}).click();await page.locator('.maplibregl-canvas').waitFor();
 await page.evaluate(()=>{const el=document.querySelector('.map-canvas');let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber'))];for(;f;f=f.return)for(let h=f.memoizedState;h;h=h.next){const m=h.memoizedState?.current;if(m?.getStyle){window.testMap=m;return;}}});
 for(const [type,layer] of [['Point','official-reference-point'],['LineString','official-reference-line']]){
  const feature=fixture.data.features.find(f=>f.properties.geometry_reference&&f.geometry.type===type);assert.ok(feature);
  const coords=type==='Point'?feature.geometry.coordinates:feature.geometry.coordinates[0].map((v,i)=>(v+feature.geometry.coordinates[1][i])/2);
  await page.evaluate(c=>window.testMap.jumpTo({center:c,zoom:14}),coords);
  await page.waitForFunction(id=>window.testMap.getLayer(id)&&window.testMap.queryRenderedFeatures({layers:[id]}).length>0,layer);
  const pixel=await page.evaluate(c=>{const p=window.testMap.project(c),r=window.testMap.getCanvas().getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y}},coords);
  await page.mouse.click(pixel.x,pixel.y);await page.getByText('Reference location only. The source does not provide a polygon area; this point or line is excluded from licence overlap checks.',{exact:true}).waitFor();
 }
 console.log('Reference map passed: actual source point and line render in dedicated layers and open the reference-only licence warning.');
}finally{await browser.close();}
