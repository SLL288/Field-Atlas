import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const b=await chromium.launch({channel:'chrome'});const context=await b.newContext();const p=await context.newPage();
await p.goto('http://localhost:3001/?lang=zh');await p.getByRole('heading',{name:/您的坐标/}).waitFor();
await p.evaluate(()=>navigator.serviceWorker.ready);await p.reload();await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
assert.equal(await p.locator('link[rel=manifest]').getAttribute('href'),'/manifest.zh.webmanifest');
const manifest=await (await p.request.get('http://localhost:3001/manifest.zh.webmanifest')).json();assert.equal(manifest.lang,'zh-CN');assert.equal(manifest.name,'实地地图 · 利比里亚');
await p.getByText(/个地图要素/).waitFor();await context.setOffline(true);await p.reload();await p.getByRole('heading',{name:/您的坐标/}).waitFor();await p.getByText(/离线 — 矿权数据/).waitFor();assert.equal(await p.locator('html').getAttribute('lang'),'zh-CN');await b.close();console.log('Chinese PWA passed: translated install manifest, offline reload and cached data in Chinese.');
