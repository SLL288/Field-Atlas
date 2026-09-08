import {test} from 'node:test';
import assert from 'node:assert/strict';
import {currentPosition,locationMessages as m} from '../src/location';
const position={coords:{latitude:6.3,longitude:-10.8,accuracy:12},timestamp:Date.now()} as GeolocationPosition;
test('location requires secure context and browser support',async()=>{
 await assert.rejects(currentPosition({secure:false}),{message:m.insecure});
 await assert.rejects(currentPosition({secure:true}),{message:m.unsupported});
});
test('location denial is actionable and never retries permission',async()=>{
 let calls=0;await assert.rejects(currentPosition({secure:true,geolocation:{getCurrentPosition(_ok,fail){calls++;fail!({code:1} as GeolocationPositionError);}}}),{message:m.denied});assert.equal(calls,1);
});
test('location retries without high accuracy after a provider timeout',async()=>{
 const options:PositionOptions[]=[];const p=await currentPosition({secure:true,geolocation:{getCurrentPosition(ok,fail,opt){options.push(opt!);if(options.length===1)fail!({code:3} as GeolocationPositionError);else ok(position);}}});assert.equal(p,position);assert.deepEqual(options.map(x=>x.enableHighAccuracy),[true,false]);assert.ok(options.every(x=>x.maximumAge===0));
});
test('location reports final timeout and rejects invalid coordinates',async()=>{
 await assert.rejects(currentPosition({secure:true,geolocation:{getCurrentPosition(_ok,fail){fail!({code:3} as GeolocationPositionError);}}}),{message:m.timeout});
 await assert.rejects(currentPosition({secure:true,geolocation:{getCurrentPosition(ok){ok({...position,coords:{...position.coords,latitude:NaN}});}}}),{message:m.invalid});
});
