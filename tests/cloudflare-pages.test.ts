import {test} from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/api/[[path]]';
test('Pages missing binding returns retryable JSON instead of HTML',async()=>{
 const r=await onRequest({request:new Request('https://example/api/mme'),env:{}});assert.equal(r.status,503);assert.match(r.headers.get('Content-Type')||'',/json/);assert.match((await r.json()).error,/BACKEND/);
});
test('Pages forwards API request including authorization and payload through service binding',async()=>{
 const request=new Request('https://example/api/admin/mme/refresh',{method:'POST',headers:{Authorization:'Bearer test'},body:'{}'});
 const r=await onRequest({request,env:{BACKEND:{async fetch(req){assert.equal(req.url,request.url);assert.equal(req.headers.get('Authorization'),'Bearer test');assert.equal(await req.text(),'{}');return Response.json({ok:true});}}}});assert.equal((await r.json()).ok,true);
});
