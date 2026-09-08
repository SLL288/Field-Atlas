import JSZip from 'jszip';
import Papa from 'papaparse';
import type {FeatureCollection} from 'geojson';
import {kml} from './geo';

export const exportFormats=['KML','KMZ','GeoJSON','CSV'] as const;
export type ExportFormat=typeof exportFormats[number];
export const exportMime:Record<ExportFormat,string>={
 KML:'application/vnd.google-earth.kml+xml',KMZ:'application/vnd.google-earth.kmz',
 GeoJSON:'application/geo+json',CSV:'text/csv'
};
export function exportFilename(name:string,format:ExportFormat){
 const safe=name.replace(/[^\p{L}\p{N}._ -]/gu,'_').replace(/^[. ]+|[. ]+$/g,'').slice(0,100)||'my-project';
 return safe+'.'+format.toLowerCase();
}
// Both browser downloads and backend archives use the same serializer.
export async function generateExport(fc:FeatureCollection,format:ExportFormat):Promise<Uint8Array>{
 if(format==='KMZ')return new JSZip().file('doc.kml',kml(fc),{date:new Date(1980,0,1)}).generateAsync({type:'uint8array',compression:'DEFLATE'});
 let text:string;
 if(format==='KML')text=kml(fc);
 else if(format==='CSV'){
  const rows:unknown[][]=[['feature','geometry','part','ring','vertex','longitude','latitude']];
  fc.features.forEach((f,i)=>{
   const walk=(c:any,path:number[])=>{
    if(typeof c[0]==='number')rows.push([f.properties?.name||i+1,f.geometry.type,path.length>2?path[0]:0,path.length>1?path[path.length-2]:0,path.at(-1)||0,c[0],c[1]]);
    else c.forEach((v:any,j:number)=>walk(v,[...path,j]));
   };
   if('coordinates'in f.geometry)walk(f.geometry.coordinates,[]);
  });
  text=Papa.unparse(rows,{escapeFormulae:true});
 }else text=JSON.stringify(fc,null,2);
 return new TextEncoder().encode(text);
}
