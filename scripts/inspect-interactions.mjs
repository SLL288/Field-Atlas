import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const b=await chromium.launch({channel:'chrome'});const p=await b.newPage();const log=[];p.on('response',r=>{if(r.url().includes('/api/map/')){log.push({url:r.url(),status:r.status()});console.log(r.url());}});
await p.goto('https://portal.mme.gov.lr/map',{waitUntil:'networkidle',timeout:90000});
console.log('selects',await p.locator('ng-select').count());
console.log((await p.locator('ng-select').evaluateAll(es=>es.map(e=>e.outerHTML))).join('\n').slice(0,6000));
const paths=p.locator('path.leaflet-interactive');console.log('polygons',await paths.count());
if(await paths.count()){await paths.first().dispatchEvent('click');console.log('clicked',await p.locator('.leaflet-popup-content').allTextContents());}
const licence=p.getByText('Licenses',{exact:true}).last();if(await licence.count()){await licence.click();await licence.click();}
console.log('filter buttons',await p.locator('button,a').evaluateAll(es=>es.filter(e=>/filter/i.test(e.textContent)).map(e=>e.outerHTML)));await p.locator('ng-select').filter({hasText:'Type select'}).click();console.log('options',await p.locator('.ng-option').allTextContents());const option=p.locator('.ng-option').filter({hasText:'Class C Mining License'}).first();if(await option.count()){await option.click();console.log('AFTER SELECT',await p.locator('body').innerText());await p.screenshot({path:'/tmp/mme-filter.png'});await p.locator('button').filter({hasText:/filter/i}).dispatchEvent('click');await p.waitForTimeout(4000);}
await fs.writeFile('docs/mme-interactions.json',JSON.stringify(log,null,2));await b.close();
