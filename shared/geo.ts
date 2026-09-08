import * as turf from '@turf/turf';
import proj4 from 'proj4';
import type {Feature,FeatureCollection,Geometry,Position} from 'geojson';
export const empty=():FeatureCollection=>({type:'FeatureCollection',features:[]});
export function validate(fc:FeatureCollection,liberia=false){
 if(fc?.type!=='FeatureCollection'||!Array.isArray(fc.features)||!fc.features.length)throw Error('Dataset has no valid features.');
 if(fc.features.length>100000)throw Error('Too many features.');
 for(const f of fc.features){
  if(f?.type!=='Feature'||!f.geometry||!['Point','MultiPoint','LineString','MultiLineString','Polygon','MultiPolygon'].includes(f.geometry.type))throw Error('Unsupported or missing geometry.');
  turf.coordEach(f,p=>{if(!Number.isFinite(p[0])||!Number.isFinite(p[1])||Math.abs(p[0])>180||Math.abs(p[1])>90||liberia&&(p[0]<-12||p[0]>-7||p[1]<4||p[1]>9))throw Error('Coordinates out of range.');});
  if(!turf.booleanValid(f))throw Error('Invalid geometry.');
  if(['Polygon','MultiPolygon'].includes(f.geometry.type)&&turf.kinks(f as never).features.length)throw Error('Self-intersecting polygon.');
 }
 return fc;
}
export function parseCoordinates(text:string,system:string,zone:number,hemisphere:string,kind:string):FeatureCollection{
 const points:Feature[]=[];
 for(const raw of text.split(/\r?\n/)){
  let line=raw.trim();if(!line||/^UTM\b/i.test(line))continue;
  let coords:Position;
  let name='';
  if(system==='dms'){
   const matches=[...line.matchAll(/(\d+(?:\.\d+)?)\s*[°d]\s*(\d+(?:\.\d+)?)\s*['′m]\s*(\d+(?:\.\d+)?)\s*["″s]?\s*([NSEW])/gi)];
   if(matches.length!==2)throw Error('DMS needs two values with ° minutes, seconds and N/S/E/W.');
   const vals=matches.map(m=>{if(+m[2]>=60||+m[3]>=60)throw Error('Invalid DMS minutes or seconds.');return (+m[1]+ +m[2]/60+ +m[3]/3600)*(/[SW]/i.test(m[4])?-1:1)});
   const lat=matches.findIndex(m=>/[NS]/i.test(m[4]));if(lat<0||!/[EW]/i.test(matches[1-lat][4]))throw Error('DMS needs latitude and longitude.');
   coords=[vals[1-lat],vals[lat]];name=line.slice(0,matches[0].index).trim();
  }else{
   const m=line.match(/^(.*?)\s*(-?\d+(?:\.\d+)?)\s*[,;/\t ]+\s*(-?\d+(?:\.\d+)?)\s*$/);
   if(!m)throw Error('Cannot read coordinate row: '+line);
   name=m[1].trim();const a=+m[2],b=+m[3];
   if(system==='utm'){if(zone<1||zone>60||a<100000||a>900000||b<0||b>10000000)throw Error('Invalid UTM zone/easting/northing.');coords=proj4('+proj=utm +zone='+zone+(hemisphere==='S'?' +south':'')+' +datum=WGS84 +units=m','EPSG:4326',[a,b]);}
   else coords=[b,a];
  }
  points.push(turf.point(coords,{name:name||'Point '+(points.length+1)}));
 }
 const positions=points.map(f=>(f.geometry as {coordinates:Position}).coordinates);
 let fc:FeatureCollection={type:'FeatureCollection',features:points};
 if(kind!=='Points'){if(positions.length<(kind==='Polygon'?3:2))throw Error('More points are required.');fc=turf.featureCollection<Geometry>([kind==='Polygon'?turf.polygon([[...positions,positions[0]]],{name:'My area'}):turf.lineString(positions,{name:'My line'})]);}
 return validate(fc);
}
const esc=(v:unknown)=>String(v??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]!));
function geom(g:Geometry):string{
 const cs=(p:Position[])=>p.map(x=>x.slice(0,3).join(',')).join(' ');
 switch(g.type){
 case 'Point':return '<Point><coordinates>'+cs([g.coordinates])+'</coordinates></Point>';
 case 'LineString':return '<LineString><coordinates>'+cs(g.coordinates)+'</coordinates></LineString>';
 case 'Polygon':return '<Polygon>'+g.coordinates.map((r,i)=>'<'+(i?'inner':'outer')+'BoundaryIs><LinearRing><coordinates>'+cs(r)+'</coordinates></LinearRing></'+(i?'inner':'outer')+'BoundaryIs>').join('')+'</Polygon>';
 case 'GeometryCollection':return '<MultiGeometry>'+g.geometries.map(geom).join('')+'</MultiGeometry>';
 default:return '<MultiGeometry>'+g.coordinates.map(c=>geom({type:g.type.replace('Multi',''),coordinates:c} as Geometry)).join('')+'</MultiGeometry>';
 }
}
export function kml(fc:FeatureCollection){return '<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>'+fc.features.map(f=>'<Placemark><name>'+esc(f.properties?.name||f.properties?.license_number||'Feature')+'</name><ExtendedData>'+Object.entries(f.properties||{}).map(([k,v])=>'<Data name="'+esc(k)+'"><value>'+esc(typeof v==='object'?JSON.stringify(v):v)+'</value></Data>').join('')+'</ExtendedData>'+geom(f.geometry)+'</Placemark>').join('')+'</Document></kml>';}
export function overlap(user:FeatureCollection,official:FeatureCollection){
 const hits:Feature[]=[];const pieces:Feature[]=[];const polygons=user.features.filter(f=>['Polygon','MultiPolygon'].includes(f.geometry.type));const total=polygons.length>1?turf.area(turf.union(turf.featureCollection(polygons) as never)!):polygons.length?turf.area(polygons[0]):0;
 for(const f of user.features){
  for(const l of official.features){
   if(!turf.booleanIntersects(f,l))continue;
   if(!hits.includes(l))hits.push(l);
   if(['Polygon','MultiPolygon'].includes(f.geometry.type)&&['Polygon','MultiPolygon'].includes(l.geometry.type)){const p=turf.intersect(turf.featureCollection([f,l]) as never);if(p)pieces.push(p);}
  }
 }
 const merged=pieces.length>1?turf.union(turf.featureCollection(pieces) as never):pieces[0];
 const area=merged?turf.area(merged):0;
 return {hits,total,area,percent:total?area/total*100:0,geometry:merged?turf.featureCollection([merged]):empty()};
}
