import JSZip from 'jszip';
import {kml as readKml} from '@tmcw/togeojson';
import Papa from 'papaparse';
import type {FeatureCollection} from 'geojson';
import {validate} from '../shared/geo';
import {generateExport,exportFilename,exportFormats,exportMime,type ExportFormat} from '../shared/exports';
import {archiveAction} from './activity';
import type {ActivityContext} from '../shared/activity';
export async function importFile(file:File):Promise<{geometry?:FeatureCollection;text?:string}>{
 if(file.size>10*1024*1024)throw Error('File limit is 10 MB.');
 let content=await file.text();const ext=file.name.split('.').pop()?.toLowerCase();
 if(ext==='kmz'){
  const z=await JSZip.loadAsync(file);const entry=Object.values(z.files).find(f=>!f.dir&&f.name.toLowerCase().endsWith('.kml'));
  if(!entry)throw Error('KMZ has no KML.');
  const stream=(entry as unknown as {internalStream:(type:string)=>any}).internalStream('string');content=await new Promise<string>((resolve,reject)=>{let s='';stream.on('data',(chunk:string)=>{s+=chunk;if(s.length>10*1024*1024){stream.pause();reject(Error('Expanded KML exceeds 10 MB.'));}}).on('error',reject).on('end',()=>resolve(s)).resume();});
 }
 if(ext==='kml'||ext==='kmz'){
  if(/<!DOCTYPE|<!ENTITY/i.test(content))throw Error('XML declarations and entities are not allowed.');
  const doc=new DOMParser().parseFromString(content,'text/xml');
  if(doc.querySelector('parsererror')||doc.documentElement.localName!=='kml')throw Error('Invalid KML XML.');
  return {geometry:validate(readKml(doc) as FeatureCollection)};
 }
 if(ext==='json'||ext==='geojson'){const j=JSON.parse(content);if(j.crs&&!JSON.stringify(j.crs).match(/4326|CRS84/))throw Error('Import WGS84 GeoJSON only.');return {geometry:validate(j.type==='Feature'?{type:'FeatureCollection',features:[j]}:j)};}
 if(ext==='csv'){
  const rows=Papa.parse<string[]>(content,{skipEmptyLines:true});if(rows.errors.length)throw Error('Invalid CSV.');
  const headers=rows.data[0].map(x=>x.trim().toLowerCase());const lat=headers.findIndex(x=>['latitude','lat','easting','east','e'].includes(x));const lon=headers.findIndex(x=>['longitude','lon','lng','northing','north','n'].includes(x));const name=headers.findIndex(x=>['name','point','id'].includes(x));
  return {text:lat>=0&&lon>=0?rows.data.slice(1).map(r=>(name>=0?r[name]+' ':'')+r[lat]+' '+r[lon]).join('\n'):rows.data.map(r=>r.join(' ')).join('\n')};
 }
 if(ext==='txt')return {text:content};
 throw Error('Use KML, KMZ, GeoJSON, CSV or TXT.');
}
export async function download(fc:FeatureCollection,format:string,name='my-project',context:ActivityContext={source:'unknown'}){
 if(!exportFormats.includes(format as ExportFormat))throw Error('Unsupported export format.');
 const kind=format as ExportFormat,filename=exportFilename(name,kind);
 const bytes=await generateExport(fc,kind);
 await archiveAction({action:'export',geometry:fc,format:kind,filename,context});
 const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:exportMime[kind]}));
 const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
