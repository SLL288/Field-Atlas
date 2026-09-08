import type {FeatureCollection,Feature} from 'geojson';
import * as turf from '@turf/turf';
import {validate} from '../shared/geo';
export const SOURCE='https://repo-prod.revenuedev.org/api/map/geojson/LR/ws/-1';
export const DICTIONARY='https://repo-prod.revenuedev.org/api/dictionary/LR/types?onlyName=false';
export const INITIAL=SOURCE+'?status=Active%20Licenses&type=&owner.id=&minerals.id=';
export type Resource={etag?:string;modified?:string;body:any};
export function normalize(raw:FeatureCollection):FeatureCollection{
 return {type:'FeatureCollection',features:raw.features.map(f=>{
  const p=f.properties||{};const out:Record<string,unknown>={source_url:INITIAL,source_data:p};
  for(const [source,target] of Object.entries({id:'id',code:'license_number',type:'license_type',status:'status',owner:'holder_name',application_date:'application_date',start_date:'issue_date',expiry_date:'expiry_date'}))if(p[source]!=null)out[target]=p[source];
  if(Array.isArray(p.assets)&&p.assets.some((a:any)=>a.name))out.commodity=p.assets.map((a:any)=>a.name).filter(Boolean).join(', ');
  return {...f,id:String(p.id),properties:out};
 })};
}
export function verifyUpdate(next:FeatureCollection,previousCount=0){
 validate(next,true);
 if(previousCount&&next.features.length<previousCount*.7)throw Error('Update rejected: more than 30% of records disappeared. Last known good data retained; administrator must investigate.');
 const ids=next.features.map(f=>f.properties?.id);if(ids.some(id=>!id)||new Set(ids).size!==ids.length)throw Error('Invalid or duplicate source IDs.');
}
export async function collect(resources:Record<string,Resource>,request:(url:string,old?:Resource)=>Promise<Resource>){
 const next:Record<string,Resource>={};
 async function get(url:string){const r=await request(url,resources[url]);next[url]=r;return r.body;}
 const initial=await get(INITIAL);
 if(initial?.type!=='FeatureCollection'||!initial.features?.length)throw Error('Empty or invalid source response.');
 const dictionary=await get(DICTIONARY);if(!Array.isArray(dictionary)||!dictionary.length)throw Error('Invalid licence type dictionary.');
 const types=[...new Set<string>([...dictionary.map(t=>t.name),...initial.features.map((f:Feature)=>f.properties?.type)])].sort();
 if(types.some(t=>typeof t!=='string'||!t)||types.length>200)throw Error('Invalid type catalogue.');
 const records=new Map<string,Feature>();
 for(const type of types){
  const fc=await get(SOURCE+'?status=Active%20Licenses&type='+encodeURIComponent(type)+'&owner.id=&minerals.id=');
  if(fc?.type!=='FeatureCollection'||!Array.isArray(fc.features))throw Error('Invalid type partition.');
  // Public map ignores pagination. Refuse possible truncation rather than claiming completeness.
  if(fc.features.length>=500)throw Error('Type partition reached 500 records: completeness cannot be verified. Last known good retained.');
  for(const f of fc.features){if(!String(f.properties?.type||'').toLowerCase().includes(type.toLowerCase()))throw Error('Source ignored type filter.');records.set(String(f.properties.id),f);}
 }
 if(initial.features.some((f:Feature)=>!records.has(String(f.properties?.id))))throw Error('Partition download missed records present in default map.');
 const normalized=normalize({type:'FeatureCollection',features:[...records.values()].sort((a,b)=>String(a.properties?.id).localeCompare(String(b.properties?.id)))});
 const prepared=prepareGeometry(normalized);
 return {...prepared,resources:next,sourceCount:records.size};
}

export function prepareGeometry(normalized:FeatureCollection){
 const features:Feature[]=[];const quarantined:{id:string;license_number:string;reason:string;feature:Feature}[]=[];
 let cleaned=0;
 for(const original of normalized.features){
  try{
   let f=structuredClone(original);
   // Removing consecutive duplicate positions does not move or invent vertices.
   f=turf.cleanCoords(f);
   if(JSON.stringify(f.geometry)!==JSON.stringify(original.geometry)){f.properties={...f.properties,geometry_normalization:'Removed duplicate/collinear positions',source_geometry:original.geometry};cleaned++;}
   validate({type:'FeatureCollection',features:[f]},true);
   features.push(f);
  }catch(e){quarantined.push({id:String(original.properties?.id),license_number:String(original.properties?.license_number),reason:e instanceof Error?e.message:String(e),feature:original});}
 }
 if(!features.length||features.length<normalized.features.length*.7)throw Error('More than 30% of source geometries invalid; update rejected.');
 return {data:{type:'FeatureCollection',features} as FeatureCollection,quarantined,cleaned};
}
