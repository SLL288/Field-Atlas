import {useEffect,useRef} from 'react';
import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import type {Feature,FeatureCollection} from 'geojson';
import type {Language} from './i18n';
import {empty} from '../shared/geo';
export default function MapView({language,official,user,overlap,selected,onSelect,visible}:{language:Language;official:FeatureCollection;user:FeatureCollection;overlap:FeatureCollection;selected:Feature|null;onSelect:(f:Feature)=>void;visible:Record<string,boolean>}){
 const div=useRef<HTMLDivElement>(null),map=useRef<maplibregl.Map|null>(null);
 const latest=useRef({language,official,user,overlap,visible,onSelect});latest.current={language,official,user,overlap,visible,onSelect};
 function update(){
  const m=map.current;if(!m?.getLayer('overlap-fill'))return;
  for(const name of ['official','user','overlap'] as const)(m.getSource(name) as maplibregl.GeoJSONSource)?.setData(latest.current[name]);
  for(const id of ['official-fill','official-line','official-point','user-fill','user-line','user-point','overlap-fill']){
   const key=id.startsWith('official')?'official':id==='user-fill'?'polygons':id==='user-line'?'lines':id==='user-point'?'points':'overlap';
   m.setLayoutProperty(id,'visibility',latest.current.visible[key]===false?'none':'visible');
  }
 }
 useEffect(()=>{
  const m=new maplibregl.Map({container:div.current!,locale:language==='zh'?{'GeolocateControl.FindMyLocation':'定位当前位置','GeolocateControl.LocationNotAvailable':'无法获取位置','NavigationControl.ResetBearing':'拖动旋转地图，点击恢复朝北','NavigationControl.ZoomIn':'放大','NavigationControl.ZoomOut':'缩小','AttributionControl.ToggleAttribution':'显示或隐藏地图来源'}:undefined,center:[-9.5,6.5],zoom:6.5,style:{version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap contributors'}},layers:[{id:'base',type:'raster',source:'osm'}]}});map.current=m;
  m.addControl(new maplibregl.NavigationControl(),'top-right');m.addControl(new maplibregl.GeolocateControl({positionOptions:{enableHighAccuracy:true},trackUserLocation:true}),'top-right');
  m.on('style.load',()=>{
   for(const name of ['official','user','overlap'] as const)m.addSource(name,{type:'geojson',data:latest.current[name]});
   m.addLayer({id:'official-fill',type:'fill',source:'official',paint:{'fill-color':'#b7842c','fill-opacity':0.28}});
   m.addLayer({id:'official-line',type:'line',source:'official',paint:{'line-color':'#95661b','line-width':1.3}});
   m.addLayer({id:'official-point',type:'circle',source:'official',filter:['==',['geometry-type'],'Point'],paint:{'circle-color':'#95661b','circle-radius':6}});
   m.addLayer({id:'user-fill',type:'fill',source:'user',filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':'#187fbc','fill-opacity':0.3}});
   m.addLayer({id:'user-line',type:'line',source:'user',filter:['==',['geometry-type'],'LineString'],paint:{'line-color':'#126ba4','line-width':4}});
   m.addLayer({id:'user-point',type:'circle',source:'user',filter:['==',['geometry-type'],'Point'],paint:{'circle-color':'#167baa','circle-radius':7,'circle-stroke-color':'#fff','circle-stroke-width':2}});
   m.addLayer({id:'overlap-fill',type:'fill',source:'overlap',paint:{'fill-color':'#e34736','fill-opacity':0.65}});
   const select=(e:maplibregl.MapLayerMouseEvent)=>{const f=e.features?.[0];if(f){const p=f.properties;const real=latest.current.official.features.find(x=>String(x.properties?.id)===String(p.id));if(real)latest.current.onSelect(real);}};
   m.on('click','official-fill',select);m.on('click','official-point',select);m.on('click','official-line',select);
   update();
   if(latest.current.user.features.length)m.fitBounds(turf.bbox(latest.current.user) as [number,number,number,number],{padding:70,maxZoom:16});
  });
  return ()=>{m.remove();map.current=null;};
 },[language]);
 useEffect(update,[official,user,overlap,visible]);
 useEffect(()=>{if(user.features.length)map.current?.fitBounds(turf.bbox(user) as [number,number,number,number],{padding:70,maxZoom:16});},[user]);
 useEffect(()=>{if(selected)map.current?.fitBounds(turf.bbox(selected) as [number,number,number,number],{padding:80,maxZoom:14});},[selected]);
 return <div ref={div} className="map-canvas" aria-label={language==='zh'?'利比里亚矿权交互地图':'Interactive Liberia licence map'}/>;
}
