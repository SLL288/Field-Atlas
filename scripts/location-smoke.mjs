import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
try{
 const c=await browser.newContext({permissions:['geolocation'],geolocation:{latitude:6.3,longitude:-10.8,accuracy:12}});const p=await c.newPage();let event;const events=[];
 await p.route('**/api/activity',async r=>{event=r.request().postDataJSON();events.push(event);await r.fulfill({json:{event_id:event.event_id,received_at:new Date().toISOString()}});});
 await p.goto((process.env.LOCATION_TEST_URL||'http://localhost:5173')+'/?lang=en');await p.getByRole('button',{name:/Use current location/}).click();await p.getByText('LICENSE CHECK',{exact:true}).waitFor();
 assert.equal(event.context.source,'gps');assert.deepEqual(event.geometry.features[0].geometry.coordinates,[-10.8,6.3]);assert.equal(event.geometry.features[0].properties.accuracy_m,12);await p.getByRole('button',{name:'Plot and save current location',exact:true}).click();for(let i=0;i<100&&events.length<2;i++)await p.waitForTimeout(100);assert.equal(events.length,2);assert.equal(events[1].context.source,'gps');assert.deepEqual(events[1].geometry.features[0].geometry.coordinates,[-10.8,6.3]);await c.close();
 const denied=await browser.newContext();await denied.addInitScript(()=>{Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok,fail){fail({code:1});}}});});
 const q=await denied.newPage();await q.goto((process.env.LOCATION_TEST_URL||'http://localhost:5173')+'/?lang=zh');await q.getByRole('button',{name:/使用当前位置/}).click();await q.getByText(/定位权限被阻止/).waitFor();await denied.close();
 console.log('Location browser smoke passed: Home and map location buttons each archive one GPS point, exact coordinates and accuracy, Chinese permission guidance.');
}finally{await browser.close();}
