import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as turf from '@turf/turf';
import {repairSourcePolygon} from '../server/source';
import {validate} from '../shared/geo';
const ring=[[-10,6],[-9.9,6],[-9.9,6.1],[-10,6.1],[-10,6]];
test('repair recovers valid area beside collapsed parts and preserves source/provenance',()=>{
 const original=turf.multiPolygon([[ring],[[[-10,6],[-10,6]]]],{id:'source'});const before=JSON.stringify(original);const result=repairSourcePolygon(original);
 validate(turf.featureCollection([result]),true);assert.equal(result.properties?.geometry_partial,true);assert.deepEqual(result.properties?.source_geometry,original.geometry);assert.equal(JSON.stringify(original),before);assert.equal(turf.area(result),turf.area(turf.polygon([ring])));
});
test('repair unions overlapping valid parts without double counting',()=>{
 const r2=ring.map(([x,y])=>[x+0.05,y]);const result=repairSourcePolygon(turf.multiPolygon([[ring],[r2]]));assert.equal(result.properties?.geometry_partial,false);assert.ok(turf.area(result)<2*turf.area(turf.polygon([ring])));validate(turf.featureCollection([result]),true);
 assert.ok(turf.booleanPointInPolygon([-9.975,6.05],result as any));assert.ok(turf.booleanPointInPolygon([-9.875,6.05],result as any));
});
test('repair never invents areas from missing vertices or self-crossing boundaries',()=>{
 const f=(coordinates:any)=>({type:'Feature' as const,properties:{},geometry:{type:'Polygon' as const,coordinates}});
 assert.throws(()=>repairSourcePolygon(f([[[-10,6],[-9.9,6],[-10,6]]])));
 assert.throws(()=>repairSourcePolygon(f([[[-10,6],[-9.9,6.1],[-10,6.1],[-9.9,6],[-10,6]]])));
 assert.throws(()=>repairSourcePolygon(f([[[-100,6],[-100,6]]])));
});
