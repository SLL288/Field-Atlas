import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as turf from '@turf/turf';
import {repairSourcePolygon,referenceGeometry} from '../server/source';
import {validate,overlap} from '../shared/geo';
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

test('one distinct coordinate becomes a reference point; two become a line without area',()=>{
 const point=referenceGeometry({type:'Feature',properties:{id:'p'},geometry:{type:'Polygon',coordinates:[[[-10,6],[-10,6]]]}});
 const line=referenceGeometry({type:'Feature',properties:{id:'l'},geometry:{type:'Polygon',coordinates:[[[-10,6],[-9.95,6.05],[-10,6]]]}});
 assert.equal(point.geometry.type,'Point');assert.equal(line.geometry.type,'LineString');assert.deepEqual((line.geometry as any).coordinates,[[-10,6],[-9.95,6.05]]);
 assert.equal(line.properties?.geometry_reference,true);assert.equal(point.properties?.id,'p');assert.ok(point.properties?.source_geometry);
 const result=overlap(turf.featureCollection([turf.polygon([ring])]),turf.featureCollection([point,line]));assert.equal(result.area,0);assert.equal(result.hits.length,0);
 assert.throws(()=>referenceGeometry(turf.polygon([ring])));
});
