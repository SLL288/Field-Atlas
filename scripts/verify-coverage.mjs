import fs from 'node:fs/promises';
const base='https://repo-prod.revenuedev.org/api/map/geojson/LR/ws/-1';
const initial=await (await fetch(base+'?status=Active%20Licenses&type=&owner.id=&minerals.id=')).json();
const dictionary=await (await fetch('https://repo-prod.revenuedev.org/api/dictionary/LR/types?onlyName=false')).json();
const types=[...new Set([...dictionary.map(t=>t.name),...initial.features.map(f=>f.properties.type)])].sort();
const all=new Map();const counts=[];
for(const type of types){
 const url=base+'?status=Active%20Licenses&type='+encodeURIComponent(type)+'&owner.id=&minerals.id=';
 const r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error(r.status);
 const fc=await r.json();if(fc.type!=='FeatureCollection')throw Error(JSON.stringify(fc));
 counts.push({type,count:fc.features.length});for(const f of fc.features)all.set(f.properties.id,f);
 console.log(type,fc.features.length);
 await new Promise(r=>setTimeout(r,300));
}
const data={type:'FeatureCollection',features:[...all.values()]};
await fs.writeFile('/tmp/mme-verified.json',JSON.stringify(data));
await fs.writeFile('docs/mme-coverage.json',JSON.stringify({tested_at:new Date().toISOString(),initial_count:initial.features.length,unique_count:all.size,partitions:counts},null,2));
console.log('UNIQUE',all.size);
