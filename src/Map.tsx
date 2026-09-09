import {useEffect,useRef,useState} from 'react';
import * as maplibregl from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
// Bundle the worker and its imports; Pages must serve JavaScript, not its HTML fallback.
maplibregl.setWorkerUrl(mapWorkerUrl);
import * as turf from '@turf/turf';
import type {Feature,FeatureCollection} from 'geojson';
import type {Language} from './i18n';
import {empty} from '../shared/geo';
import {distanceMetres,formatDistance} from '../shared/measurement';
import {archiveAction} from './activity';
export default function MapView({language,official,user,overlap,selected,onSelect,onLocate,visible}:{language:Language;official:FeatureCollection;user:FeatureCollection;overlap:FeatureCollection;selected:Feature|null;onSelect:(f:Feature)=>void;onLocate:()=>Promise<void>;visible:Record<string,boolean>}){
 const [measuring,measuringSet]=useState(false),[measurePoints,measurePointsSet]=useState<[number,number][]>([]),[measureSaving,measureSavingSet]=useState(false),[measureError,measureErrorSet]=useState('');
 const measuringRef=useRef(measuring);measuringRef.current=measuring;
 const pointsRef=useRef(measurePoints);pointsRef.current=measurePoints;
 const distance=distanceMetres(measurePoints);
 function updateMeasurement(){const m=map.current;if(!m?.getSource('measurement'))return;const points=pointsRef.current;const features:Feature[]=points.map((p,i)=>turf.point(p,{vertex:i+1}));if(points.length>1)features.unshift(turf.lineString(points));void (m.getSource('measurement') as maplibregl.GeoJSONSource).setData(turf.featureCollection(features));}
 async function finishMeasurement(){
  if(measurePoints.length<2||measureSaving)return;measuringRef.current=false;measureSavingSet(true);measureErrorSet('');
  try{const geometry=turf.featureCollection([turf.lineString(measurePoints,{name:'Distance measurement',distance_m:distance,measurement_method:'Geodesic segment sum; not terrain or road distance'})]);await archiveAction({action:'plot',geometry,context:{source:'coordinates',project_name:'Distance measurement'}});measuringRef.current=false;measuringSet(false);}
  catch{measuringRef.current=true;measureErrorSet(language==='zh'?'无法保存测距，请重试。':'Could not save measurement. Please retry.');}finally{measureSavingSet(false);}
 }
 const [basemap,basemapSet]=useState<'street'|'satellite'>(()=>{try{return localStorage.getItem('field-atlas-basemap')==='satellite'?'satellite':'street';}catch{return 'street';}});
 const baseRef=useRef(basemap);baseRef.current=basemap;
 const [imageryError,imageryErrorSet]=useState(false);
 function updateBasemap(){
  const m=map.current;if(!m?.getLayer('official-fill'))return;
  const satellite=baseRef.current==='satellite';
  if(satellite&&!m.getSource('satellite')){
   m.addSource('satellite',{type:'raster',tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256,maxzoom:19,attribution:'Imagery © <a href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9" target="_blank" rel="noopener noreferrer">Esri</a>, Vantor, Earthstar Geographics, and the GIS User Community'});
   m.addLayer({id:'satellite-base',type:'raster',source:'satellite'},'official-fill');
  }
  m.setLayoutProperty('base','visibility',satellite?'none':'visible');
  if(m.getLayer('satellite-base'))m.setLayoutProperty('satellite-base','visibility',satellite?'visible':'none');
  m.setPaintProperty('official-line','line-color',satellite?'#ffd166':'#95661b');
  m.setPaintProperty('official-line','line-width',satellite?2:1.3);
 }
 const div=useRef<HTMLDivElement>(null),map=useRef<maplibregl.Map|null>(null);
 const latest=useRef({language,official,user,overlap,visible,onSelect,onLocate});latest.current={language,official,user,overlap,visible,onSelect,onLocate};
 function update(){
  const m=map.current;if(!m?.getLayer('overlap-fill'))return;
  for(const name of ['official','user','overlap'] as const)(m.getSource(name) as maplibregl.GeoJSONSource)?.setData(latest.current[name]);
  for(const id of ['official-fill','official-line','official-point','official-reference-line','official-reference-point','user-fill','user-line','user-point','overlap-fill']){
   const key=id.startsWith('official')?'official':id==='user-fill'?'polygons':id==='user-line'?'lines':id==='user-point'?'points':'overlap';
   m.setLayoutProperty(id,'visibility',latest.current.visible[key]===false?'none':'visible');
  }
 }
 useEffect(()=>{
  const m=new maplibregl.Map({container:div.current!,locale:language==='zh'?{'GeolocateControl.FindMyLocation':'定位当前位置','GeolocateControl.LocationNotAvailable':'无法获取位置','NavigationControl.ResetBearing':'拖动旋转地图，点击恢复朝北','NavigationControl.ZoomIn':'放大','NavigationControl.ZoomOut':'缩小','AttributionControl.ToggleAttribution':'显示或隐藏地图来源'}:undefined,center:[-9.5,6.5],zoom:6.5,style:{version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap contributors'}},layers:[{id:'base',type:'raster',source:'osm'}]}});map.current=m;
  m.addControl(new maplibregl.NavigationControl(),'top-right');const locationGroup=document.createElement('div');locationGroup.className='maplibregl-ctrl maplibregl-ctrl-group';
  const locationButton=document.createElement('button');locationButton.type='button';locationButton.className='maplibregl-ctrl-geolocate';locationButton.title=language==='zh'?'定位并保存当前位置':'Plot and save current location';locationButton.setAttribute('aria-label',locationButton.title);locationButton.innerHTML='<span class="maplibregl-ctrl-icon" aria-hidden="true"></span>';
  locationButton.onclick=()=>{locationButton.disabled=true;void latest.current.onLocate().finally(()=>{locationButton.disabled=false;});};locationGroup.append(locationButton);
  m.addControl({onAdd:()=>locationGroup,onRemove:()=>locationGroup.remove()},'top-right');
  m.on('error',event=>{if('sourceId' in event&&event.sourceId==='satellite')imageryErrorSet(true);});
  m.on('style.load',()=>{
   for(const name of ['official','user','overlap'] as const)m.addSource(name,{type:'geojson',data:latest.current[name]});
   m.addLayer({id:'official-fill',type:'fill',source:'official',paint:{'fill-color':'#b7842c','fill-opacity':0.28}});
   m.addLayer({id:'official-line',type:'line',source:'official',filter:['!=',['get','geometry_reference'],true],paint:{'line-color':'#95661b','line-width':1.3}});
   m.addLayer({id:'official-point',type:'circle',source:'official',filter:['all',['==',['geometry-type'],'Point'],['!=',['get','geometry_reference'],true]],paint:{'circle-color':'#95661b','circle-radius':6}});
   m.addLayer({id:'official-reference-line',type:'line',source:'official',filter:['==',['get','geometry_reference'],true],paint:{'line-color':'#b05dcc','line-width':3,'line-dasharray':[2,2]}});
   m.addLayer({id:'official-reference-point',type:'circle',source:'official',filter:['all',['==',['geometry-type'],'Point'],['==',['get','geometry_reference'],true]],paint:{'circle-color':'#b05dcc','circle-radius':6,'circle-stroke-color':'#fff','circle-stroke-width':2}});
   m.addLayer({id:'user-fill',type:'fill',source:'user',filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':'#187fbc','fill-opacity':0.3}});
   m.addLayer({id:'user-line',type:'line',source:'user',filter:['==',['geometry-type'],'LineString'],paint:{'line-color':'#126ba4','line-width':4}});
   m.addLayer({id:'user-point',type:'circle',source:'user',filter:['==',['geometry-type'],'Point'],paint:{'circle-color':'#167baa','circle-radius':7,'circle-stroke-color':'#fff','circle-stroke-width':2}});
   m.addLayer({id:'overlap-fill',type:'fill',source:'overlap',paint:{'fill-color':'#e34736','fill-opacity':0.65}});
   const select=(e:maplibregl.MapLayerMouseEvent)=>{if(measuringRef.current)return;const f=e.features?.[0];if(f){const p=f.properties;const real=latest.current.official.features.find(x=>String(x.properties?.id)===String(p.id));if(real)latest.current.onSelect(real);}};
   m.on('click','official-fill',select);m.on('click','official-point',select);m.on('click','official-line',select);m.on('click','official-reference-line',select);m.on('click','official-reference-point',select);
   m.addSource('measurement',{type:'geojson',data:empty()});
   m.addLayer({id:'measurement-line',type:'line',source:'measurement',filter:['==',['geometry-type'],'LineString'],paint:{'line-color':'#00c7dc','line-width':4,'line-dasharray':[2,1]}});
   m.addLayer({id:'measurement-point',type:'circle',source:'measurement',filter:['==',['geometry-type'],'Point'],paint:{'circle-color':'#00aabd','circle-radius':5,'circle-stroke-color':'#fff','circle-stroke-width':2}});
   update();updateBasemap();updateMeasurement();
   if(latest.current.user.features.length)m.fitBounds(turf.bbox(latest.current.user) as [number,number,number,number],{padding:70,maxZoom:16});
  });
  m.on('click',e=>{if(!measuringRef.current)return;const p:[number,number]=[e.lngLat.lng,e.lngLat.lat];const last=pointsRef.current.at(-1);if(last&&last[0]===p[0]&&last[1]===p[1])return;pointsRef.current=[...pointsRef.current,p];measurePointsSet(pointsRef.current);});
  return ()=>{m.remove();map.current=null;};
 },[language]);
 useEffect(()=>{imageryErrorSet(false);try{localStorage.setItem('field-atlas-basemap',basemap);}catch{}updateBasemap();},[basemap]);
 useEffect(updateMeasurement,[measurePoints]);
 useEffect(()=>{const m=map.current;if(!m)return;m.getCanvas().style.cursor=measuring?'crosshair':'';if(measuring)m.doubleClickZoom.disable();else m.doubleClickZoom.enable();},[measuring,language]);
 useEffect(update,[official,user,overlap,visible]);
 useEffect(()=>{if(user.features.length)map.current?.fitBounds(turf.bbox(user) as [number,number,number,number],{padding:70,maxZoom:16});},[user]);
 useEffect(()=>{if(selected)map.current?.fitBounds(turf.bbox(selected) as [number,number,number,number],{padding:80,maxZoom:14});},[selected]);
 return <><div ref={div} className="map-canvas" aria-label={language==='zh'?'利比里亚矿权交互地图': 'Interactive Liberia licence map'}/><label className="basemap-switch">{language==='zh'?'底图':'Basemap'}<select aria-label={language==='zh'?'底图':'Basemap'} value={basemap} onChange={e=>basemapSet(e.target.value as 'street'|'satellite')}><option value="street">{language==='zh'?'街道地图':'Street map'}</option><option value="satellite">{language==='zh'?'卫星影像':'Satellite'}</option></select></label>{basemap==='satellite'&&!measuring&&!measurePoints.length&&<div className="imagery-note" role="status">{imageryError?(language==='zh'?'卫星影像暂时无法加载，请检查网络或切换到街道地图。':'Satellite imagery could not load. Check your connection or switch to Street map.'):(language==='zh'?'影像日期与精度因地区而异，非实时影像。需要联网。':'Imagery dates and detail vary; not live imagery. Internet required.')}</div>}<div className="measure-tool"><button type="button" aria-pressed={measuring} disabled={measureSaving} onClick={()=>{if(measuring){void finishMeasurement();return;}pointsRef.current=[];measurePointsSet([]);measuringRef.current=true;measuringSet(true);measureErrorSet('');}}>{language==='zh'?'测量距离':'Measure distance'}</button>{(measuring||measurePoints.length>0)&&<section className="measure-panel" aria-label={language==='zh'?'距离测量':'Distance measurement'}><strong role="status">{formatDistance(distance,language)}</strong><small>{language==='zh'?'点击地图添加点。按顺序累计地表距离，不含地形高差。':'Click the map to add points. Sums ground-distance segments; excludes elevation.'}</small><small>{measurePoints.length} {language==='zh'?'个点':'points'}</small><div className="measure-actions">{measuring&&<><button disabled={!measurePoints.length||measureSaving} onClick={()=>{pointsRef.current=pointsRef.current.slice(0,-1);measurePointsSet(pointsRef.current);}}>{language==='zh'?'撤销':'Undo'}</button><button disabled={measurePoints.length<2||measureSaving} onClick={()=>void finishMeasurement()}>{language==='zh'?'完成并保存':'Finish & save'}</button></>}<button disabled={measureSaving} onClick={()=>{pointsRef.current=[];measurePointsSet([]);measuringRef.current=false;measuringSet(false);measureErrorSet('');}}>{language==='zh'?'清除':'Clear'}</button></div>{measuring&&<small>{language==='zh'?'完成后，测量路线将保存到服务器。':'Finishing saves the measured line to the server.'}</small>}{measureError&&<p role="alert">{measureError}</p>}</section>}</div></>;
}
