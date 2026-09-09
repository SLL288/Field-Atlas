import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as turf from '@turf/turf';
import {parseCoordinates,overlap,kml,validate} from '../shared/geo';
import {normalize,prepareGeometry,verifyUpdate,collect,INITIAL,DICTIONARY} from '../server/source';
test('acceptance UTM polygon transforms to Liberia and closes',()=>{
 const fc=parseCoordinates('Pit 1 341099 806040\nPit 2 341555 806321\nPit 3 341881 805929\nUTM 29N','utm',29,'N','Polygon');
 const bb=turf.bbox(fc);assert.ok(bb[0]>-11&&bb[2]<-10&&bb[1]>7&&bb[3]<8);assert.ok(turf.area(fc)>0);assert.match(kml(fc),/<Polygon>/);
});
test('decimal, DMS, hemisphere and malformed input',()=>{
 assert.deepEqual((parseCoordinates('Site 7.25 -10.5','decimal',29,'N','Points').features[0].geometry as any).coordinates,[-10.5,7.25]);
 assert.deepEqual((parseCoordinates('7° 15\' 0" N 10° 30\' 0" W','dms',29,'N','Points').features[0].geometry as any).coordinates,[-10.5,7.25]);
 assert.throws(()=>parseCoordinates('91 12','decimal',29,'N','Points'));
 assert.throws(()=>parseCoordinates('341099 806040','utm',0,'N','Points'));
 assert.throws(()=>parseCoordinates('garbage','utm',29,'N','Polygon'));
});
const box=turf.polygon([[[-10,6],[-9,6],[-9,7],[-10,7],[-10,6]]],{id:'1'});
test('point and line intersections and polygon union prevent double counting',()=>{
 const official=turf.featureCollection([box,{...box,properties:{id:'2'}}]);
 const result=overlap(turf.featureCollection([box]),official);assert.equal(result.hits.length,2);assert.ok(Math.abs(result.percent-100)<.001);
 assert.equal(overlap(turf.featureCollection([turf.point([-9.5,6.5])]),official).hits.length,2);
 assert.equal(overlap(turf.featureCollection([turf.lineString([[-11,6.5],[-8,6.5]])]),official).hits.length,2);
 assert.equal(overlap(turf.featureCollection([turf.point([0,0])]),official).hits.length,0);
});
test('KML escapes hostile properties; invalid geometry and record loss rejected',()=>{
 assert.match(kml(turf.featureCollection([{...box,properties:{name:'<script>&'}}])),/&lt;script&gt;&amp;/);
 assert.throws(()=>validate(turf.featureCollection([turf.polygon([[[0,0],[1,1],[0,1],[1,0],[0,0]]])])));assert.throws(()=>verifyUpdate(turf.featureCollection([box]),10));
 assert.throws(()=>verifyUpdate({type:'FeatureCollection',features:[]}));
});
test('normalization preserves metadata, quarantines unusable source polygons',()=>{
 const valid={...box,properties:{id:'1',code:'CLA',owner:'Example',assets:[{name:'Gold'}],extra:'retained'}};
 const invalid={...box,properties:{id:'2'},geometry:{type:'Polygon' as const,coordinates:[[[-100,6],[-100,6]]]}};
 const r=prepareGeometry(normalize(turf.featureCollection([valid,{...valid,properties:{...valid.properties,id:'3'}},{...valid,properties:{...valid.properties,id:'4'}},invalid])));
 assert.equal(r.data.features.length,3);assert.equal(r.quarantined.length,1);assert.equal(r.data.features[0].properties?.source_data.extra,'retained');assert.equal(r.data.features[0].properties?.commodity,'Gold');assert.equal(r.data.features[0].properties?.county,undefined);
});
test('collector rejects truncated partitions and ignored filters',async()=>{
 const feature={...box,properties:{id:'1',type:'Test'}};
 await assert.rejects(collect({},async url=>({body:url===DICTIONARY?[{name:'Test'}]:{type:'FeatureCollection',features:url===INITIAL?[feature]:Array(500).fill(feature)}})),/500/);
 await assert.rejects(collect({},async url=>({body:url===DICTIONARY?[{name:'Test'}]:{type:'FeatureCollection',features:[url===INITIAL?feature:{...feature,properties:{id:'1',type:'Wrong'}}]}})),/ignored/);
});
