import {chromium} from 'playwright';import assert from 'node:assert/strict';
const b=await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
try{
 const p=await b.newPage({viewport:{width:1280,height:900}});p.setDefaultTimeout(20000);let event;
 await p.route('**/api/activity',async r=>{event=r.request().postDataJSON();await r.fulfill({json:{event_id:event.event_id,received_at:new Date().toISOString()}})});
 await p.goto('http://localhost:3001/?lang=en',{waitUntil:'domcontentloaded'});await p.locator('nav button').filter({hasText:'Map'}).click();await p.locator('.maplibregl-canvas').waitFor();
 await p.getByRole('button',{name:'Measure distance',exact:true}).click();const box=await p.locator('.maplibregl-canvas').boundingBox();
 await p.mouse.click(box.x+box.width*.3,box.y+box.height*.5);await p.mouse.click(box.x+box.width*.5,box.y+box.height*.6);await p.mouse.click(box.x+box.width*.6,box.y+box.height*.7);
 const panel=p.getByRole('region',{name:'Distance measurement'});await panel.getByText('3 points',{exact:true}).waitFor();assert.equal(await p.getByText('LICENCE DETAILS',{exact:true}).count(),0);
 const three=await panel.getByRole('status').textContent();await panel.getByRole('button',{name:'Undo',exact:true}).click();await panel.getByText('2 points',{exact:true}).waitFor();assert.notEqual(await panel.getByRole('status').textContent(),three);
 await panel.getByRole('button',{name:'Finish & save',exact:true}).click();await p.waitForTimeout(1200);assert.equal(event.context.project_name,'Distance measurement');assert.equal(event.geometry.features[0].geometry.coordinates.length,2);assert.ok(event.geometry.features[0].properties.distance_m>0);
 assert.equal(await p.getByRole('button',{name:'Measure distance',exact:true}).getAttribute('aria-pressed'),'false');await panel.getByRole('button',{name:'Clear',exact:true}).click();assert.equal(await panel.count(),0);
 await p.getByLabel('Language',{exact:true}).selectOption('zh');await p.setViewportSize({width:390,height:844});await p.getByRole('button',{name:'测量距离',exact:true}).click();await p.getByRole('region',{name:'距离测量'}).waitFor();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 console.log('Measurement smoke passed: clicks, cumulative distance, undo, isolated licence selection, saved line, clear, Chinese/mobile controls.');
}finally{await b.close();}
