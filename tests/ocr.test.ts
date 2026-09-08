import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractCandidates,candidateText,validateReading} from '../shared/ocr';
import {parseCoordinates} from '../shared/geo';
import {recognizeHandwriting} from '../server/ocr';
import {translator} from '../src/i18n';
test('slash-separated handwritten-style rows keep order and unknown CRS',()=>{
 const r=extractCandidates('Area Name: field notes\n1. 424749/923027\n2. 424935 / 922474\n3. 425399/922303');
 assert.equal(r.rows.length,3);assert.equal(r.rows[0].first,'424749');assert.equal(r.zone,null);assert.equal(r.hemisphere,null);assert.equal(r.datum,null);assert.equal(r.system,'utm');assert.ok(r.rows.every(row=>row.uncertain));
 assert.equal(parseCoordinates(candidateText(r.rows),'utm',29,'N','Points').features.length,3);
 assert.equal(parseCoordinates('1. 424749/923027','utm',29,'N','Points').features.length,1);
});
test('decimal latitude is not mistaken for row numbering; unknown digits are never repaired',()=>{
 const d=extractCandidates('7.25 -10.5');assert.equal(d.rows[0].first,'7.25');assert.equal(d.system,'decimal');
 const r=extractCandidates('7. 45552/922921\n8. 42?935/922474');assert.equal(r.rows[0].first,'45552');assert.equal(r.rows[1].first,'42?935');assert.throws(()=>candidateText(r.rows),/uncertain/);
 assert.throws(()=>parseCoordinates(candidateText([r.rows[0]]),'utm',29,'N','Points'),/UTM/);
 assert.equal(extractCandidates('Pit 1 341099 806040\nUTM 29N WGS84').zone,29);
});
test('vision uses image input, structured output, no storage, and validates service response',async()=>{
 const sample=extractCandidates('1. 424749/923027');let payload:any;
 const request:typeof fetch=async(_url,init)=>{payload=JSON.parse(init!.body as string);return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(sample)}]}]}));};
 const result=await recognizeHandwriting(Buffer.from('example'),'image/png',request);
 assert.equal(result.rows[0].first,'424749');assert.equal(payload.store,false);assert.equal(payload.text.format.strict,true);assert.equal(payload.input[0].content[1].type,'input_image');assert.equal(payload.tools,undefined);
 await assert.rejects(recognizeHandwriting(Buffer.from('example'),'image/png',async()=>new Response('{}',{status:401})),/credentials/);
 assert.throws(()=>validateReading({...sample,zone:80}));
});
test('Chinese labels and coverage warnings translate without altering original identifiers',()=>{
 const t=translator('zh');assert.equal(t('Home'),'首页');assert.equal(t('Coordinates'),'坐标');assert.match(t('98 source records have invalid polygon geometry and are excluded. Overlap coverage is incomplete.'),/98.*覆盖不完整/);assert.equal(t('CLA 5000/09'),'CLA 5000/09');assert.equal(translator('en')('Home'),'Home');
});
