import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const b=await chromium.launch({channel:'chrome'});const p=await b.newPage();await p.goto('http://localhost:5173');
const result=await p.evaluate(async()=>{
 const {importFile}=await import('/src/io.ts');const {kml,parseCoordinates}=await import('/shared/geo.ts');const {default:JSZip}=await import('/node_modules/.vite/deps/jszip.js');
 const fc=parseCoordinates('7.1 -10.1\n7.2 -10.1\n7.2 -10.2','decimal',29,'N','Polygon');
 const xml=kml(fc);const k=await importFile(new File([xml],'test.kml'));const z=await new JSZip().file('doc.kml',xml).generateAsync({type:'blob'});const kmz=await importFile(new File([z],'test.kmz'));
 const csv=await importFile(new File(['name,easting,northing\nPit 1,341099,806040'],'test.csv'));
 let rejected=false;try{await importFile(new File(['<!DOCTYPE kml [<!ENTITY x SYSTEM "file:///etc/passwd">]><kml/>'],'evil.kml'));}catch{rejected=true;}
 return {kml:k.geometry.features.length,kmz:kmz.geometry.features.length,csv:csv.text,rejected};
});
assert.deepEqual(result,{kml:1,kmz:1,csv:'Pit 1 341099 806040',rejected:true});await b.close();console.log('Import smoke passed: KML/KMZ roundtrip, CSV mapping, XML entity rejection.');
