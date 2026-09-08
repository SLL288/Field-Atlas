export type CoordinateCandidate={name:string;first:string;second:string;uncertain:boolean;note:string};
export type PhotoReading={rows:CoordinateCandidate[];rawText:string;system:'utm'|'decimal'|'dms'|'unknown';zone:number|null;hemisphere:'N'|'S'|null;datum:string|null};
export function extractCandidates(rawText:string):PhotoReading{
 const zone=rawText.match(/\bUTM\s*(?:zone\s*)?(\d{1,2})\s*([NS])?\b/i);
 const rows:CoordinateCandidate[]=[];
 for(const raw of rawText.split(/\r?\n/)){
  if(/^\s*UTM\b/i.test(raw))continue;
  const line=raw.trim().replace(/^\d{1,3}(?:[.)]\s+|\)\s*)/,'');
  // Never turn letters into digits or infer missing digits. Keep questionable values editable.
  const slash=line.match(/^([\d\s?.,-]+)\s*[/|\\]\s*([\d\s?.,-]+)$/);
  const pair=line.match(/^(.*?)\s*(-?\d{1,8}(?:\.\d+)?|\?+)\s*[,;\t ]+\s*(-?\d{1,8}(?:\.\d+)?|\?+)\s*$/);
  if(!slash&&!pair)continue;
  const first=(slash?slash[1]:pair![2]).trim(),second=(slash?slash[2]:pair![3]).trim();
  // Ignore likely prose years/small list markers; accept decimal lat/lon and long projected numbers.
  if(!slash&&!first.includes('.')&&!second.includes('.')&&Math.abs(+first)<1000&&Math.abs(+second)<1000)continue;
  rows.push({name:slash?'Point '+(rows.length+1):pair![1].trim()||'Point '+(rows.length+1),first,second,uncertain:true,note:'Check against the photo.'});
 }
 const projected=rows.some(r=>Number(r.first)>180||Number(r.second)>90);
 return {rows,rawText,system:zone||projected?'utm':rows.length?'decimal':'unknown',zone:zone?+zone[1]:null,hemisphere:zone?.[2]?.toUpperCase() as 'N'|'S'||null,datum:/\bWGS\s*84\b/i.test(rawText)?'WGS84':null};
}
export function validateReading(value:unknown):PhotoReading{
 const v=value as PhotoReading;
 if(!v||!Array.isArray(v.rows)||v.rows.length>500||typeof v.rawText!=='string'||v.rawText.length>50000||!['utm','decimal','dms','unknown'].includes(v.system))throw Error('Invalid recognition response.');
 if(v.zone!==null&&(!Number.isInteger(v.zone)||v.zone<1||v.zone>60))throw Error('Invalid detected UTM zone.');
 if(![null,'N','S'].includes(v.hemisphere)||v.datum!==null&&typeof v.datum!=='string')throw Error('Invalid recognition response.');
 for(const row of v.rows){
  if(!row||['name','first','second','note'].some(k=>typeof (row as any)[k]!=='string'||(row as any)[k].length>500)||typeof row.uncertain!=='boolean')throw Error('Invalid coordinate row.');
 }
 return v;
}
export function candidateText(rows:CoordinateCandidate[]){
 if(!rows.length)throw Error('Add at least one coordinate row.');
 return rows.map((r,i)=>{
  const a=r.first.trim(),b=r.second.trim();
  if(!/^-?\d+(?:\.\d+)?$/.test(a)||!/^-?\d+(?:\.\d+)?$/.test(b))throw Error('Correct missing or uncertain coordinate values before continuing.');
  return (r.name.trim().replace(/[\r\n]/g,' ')||'Point '+(i+1))+' '+a+' '+b;
 }).join('\n');
}
