export const locationMessages={
 insecure:'Location requires HTTPS when using a network address. Open this app on HTTPS, or use localhost on this device.',
 unsupported:'This browser does not support location. Try a current browser or enter coordinates manually.',
 denied:'Location access is blocked. Allow Location in this site’s browser settings and enable Location Services for your browser in device settings, then try again.',
 unavailable:'Your device could not determine its location. Enable Location Services, check your connection or move outdoors, then try again.',
 timeout:'Location request timed out. Check Location Services and your connection, then try again or enter coordinates manually.',
 invalid:'The device returned an invalid location. Please try again.'
};
type Environment={secure:boolean;geolocation?:Pick<Geolocation,'getCurrentPosition'>};
export async function currentPosition(env:Environment={secure:window.isSecureContext,geolocation:navigator.geolocation}):Promise<GeolocationPosition>{
 if(!env.secure)throw Error(locationMessages.insecure);
 if(!env.geolocation)throw Error(locationMessages.unsupported);
 const request=(high:boolean)=>new Promise<GeolocationPosition>((resolve,reject)=>env.geolocation!.getCurrentPosition(resolve,reject,{enableHighAccuracy:high,timeout:high?15000:10000,maximumAge:0}));
 try{
  let p:GeolocationPosition;
  try{p=await request(true);}catch(e){if((e as GeolocationPositionError).code===1)throw e;p=await request(false);}
  const {latitude,longitude,accuracy}=p.coords;
  if(!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude)>180||!Number.isFinite(accuracy)||accuracy<0)throw Error(locationMessages.invalid);
  return p;
 }catch(e){if(e instanceof Error)throw e;const code=(e as GeolocationPositionError)?.code;throw Error(code===1?locationMessages.denied:code===3?locationMessages.timeout:locationMessages.unavailable);}
}
