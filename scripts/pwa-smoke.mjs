import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const b=await chromium.launch({channel:'chrome'});const context=await b.newContext();const p=await context.newPage();await p.goto('http://localhost:3001');await p.evaluate(()=>navigator.serviceWorker.ready);
await p.reload();await p.getByText(/mapped features/).waitFor();const countText=(await p.getByText(/mapped features/).innerText()).split(' · ')[0];await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
await p.getByRole('button',{name:'Map',exact:false}).first().click();await p.getByText('Licence map',{exact:true}).waitFor();
await context.setOffline(true);await p.reload();await p.getByRole('heading',{name:'Your coordinates.'}).waitFor();await p.getByText(/OFFLINE — MME data/).waitFor();assert.ok((await p.locator('body').innerText()).includes(countText));
await b.close();console.log('PWA smoke passed: service worker controls app, shell reloads offline, cached MME features restored.');
