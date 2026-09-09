import {length,lineString} from '@turf/turf';
import type {Position} from 'geojson';
export function distanceMetres(points:Position[]):number{return points.length<2?0:length(lineString(points),{units:'kilometers'})*1000;}
export function formatDistance(metres:number,language:'en'|'zh'='en'):string{return metres>=1000?(metres/1000).toFixed(2)+(language==='zh'?' 公里':' km'):metres.toFixed(1)+(language==='zh'?' 米':' m');}
