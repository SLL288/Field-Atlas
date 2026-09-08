import type {FeatureCollection} from 'geojson';
import {exportFormats,type ExportFormat} from './exports';

export const MAX_ACTIVITY_BYTES=20*1024*1024;
export const sources=['coordinates','photo','file_import','gps','project_open','project_export','mme_dataset','unknown'] as const;
export type ActivityContext={
 source:typeof sources[number];
 project_name?:string;
 input_filename?:string;
 input_text?:string;
 input_crs?:{system:'utm'|'decimal'|'dms';zone?:number;hemisphere?:'N'|'S';datum:'WGS84'};
 mme_updated_at?:string;
};
export type ActivityEvent={
 version:1;
 event_id:string;
 client_id:string;
 session_id:string;
 occurred_at:string;
 action:'plot'|'export';
 geometry:FeatureCollection;
 context:ActivityContext;
 format?:ExportFormat;
 filename?:string;
};
export const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateActivityShape(value:unknown):asserts value is ActivityEvent{
 const v=value as ActivityEvent;
 if(!v||v.version!==1||!uuidPattern.test(v.event_id)||!uuidPattern.test(v.client_id)||!uuidPattern.test(v.session_id))throw Error('Invalid activity identifiers.');
 if(typeof v.occurred_at!=='string'||v.occurred_at.length>40||!Number.isFinite(Date.parse(v.occurred_at)))throw Error('Invalid activity timestamp.');
 if(!['plot','export'].includes(v.action)||!v.context||!sources.includes(v.context.source))throw Error('Invalid activity action.');
 if(v.action==='export'&&(!exportFormats.includes(v.format!)||typeof v.filename!=='string'||!v.filename||v.filename.length>150||/[\/\\\x00-\x1f]/.test(v.filename)))throw Error('Invalid export format or filename.');
 if(v.action==='plot'&&(v.format!==undefined||v.filename!==undefined))throw Error('Plot events cannot specify export files.');
 for(const [key,limit] of [['project_name',200],['input_filename',300],['input_text',200000],['mme_updated_at',40]] as const){
  const val=v.context[key];if(val!==undefined&&(typeof val!=='string'||val.length>limit))throw Error('Activity details exceed the allowed size.');
 }
 const crs=v.context.input_crs;
 if(crs&&(!['utm','decimal','dms'].includes(crs.system)||crs.datum!=='WGS84'||crs.zone!==undefined&&(!Number.isInteger(crs.zone)||crs.zone<1||crs.zone>60)||crs.hemisphere!==undefined&&!['N','S'].includes(crs.hemisphere)))throw Error('Invalid activity coordinate system.');
 if(v.geometry?.type!=='FeatureCollection'||!Array.isArray(v.geometry.features)||!v.geometry.features.length)throw Error('Activity has no geometry.');
}
