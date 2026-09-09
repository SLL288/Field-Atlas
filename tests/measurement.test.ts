import {test} from 'node:test';import assert from 'node:assert/strict';
import {distanceMetres,formatDistance} from '../shared/measurement';
test('distance sums geodesic segments and formats metric units',()=>{
 assert.equal(distanceMetres([]),0);assert.equal(distanceMetres([[0,0]]),0);
 const one=distanceMetres([[0,0],[1,0]]);assert.ok(Math.abs(one-111195)<2);
 assert.ok(Math.abs(distanceMetres([[0,0],[1,0],[2,0]])-2*one)<0.01);
 assert.equal(formatDistance(125),'125.0 m');assert.equal(formatDistance(1250,'zh'),'1.25 公里');
});
