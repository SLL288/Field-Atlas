import {extractCandidates,type PhotoReading} from '../shared/ocr';
export type Crop={top:number;bottom:number;left:number;right:number};
export const fullCrop:Crop={top:0,bottom:100,left:0,right:100};
export async function preparePhoto(file:File,crop:Crop,rotation:number,enhance:boolean):Promise<Blob>{
 if(file.size>10*1024*1024)throw Error('Image limit is 10 MB.');
 let bitmap:ImageBitmap;try{bitmap=await createImageBitmap(file);}catch{throw Error('Cannot open this image. Please use JPEG, PNG or WebP.');}
 try{
  if(bitmap.width*bitmap.height>40000000)throw Error('Image is too large. Use a photo under 40 megapixels.');
  const rotated=document.createElement('canvas');const quarter=rotation%180!==0;
  const scale=Math.min(1,2600/Math.max(bitmap.width,bitmap.height));
  rotated.width=Math.round((quarter?bitmap.height:bitmap.width)*scale);rotated.height=Math.round((quarter?bitmap.width:bitmap.height)*scale);
  const rc=rotated.getContext('2d')!;rc.fillStyle='white';rc.fillRect(0,0,rotated.width,rotated.height);rc.translate(rotated.width/2,rotated.height/2);rc.rotate(rotation*Math.PI/180);rc.drawImage(bitmap,-bitmap.width*scale/2,-bitmap.height*scale/2,bitmap.width*scale,bitmap.height*scale);
  const sw=(crop.right-crop.left)*rotated.width/100,sh=(crop.bottom-crop.top)*rotated.height/100;
  if(sw<20||sh<20)throw Error('Crop is too small.');
  const canvas=document.createElement('canvas');const up=Math.min(2,2400/Math.max(sw,sh));canvas.width=Math.round(sw*up);canvas.height=Math.round(sh*up);
  const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(rotated,crop.left*rotated.width/100,crop.top*rotated.height/100,sw,sh,0,0,canvas.width,canvas.height);
  if(enhance){
   const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),hist=new Uint32Array(256);
   for(let i=0;i<pixels.data.length;i+=4){const g=Math.round(.299*pixels.data[i]+.587*pixels.data[i+1]+.114*pixels.data[i+2]);hist[g]++;}
   const count=canvas.width*canvas.height;let low=0,high=255,cumulative=0;
   for(let i=0;i<256;i++){cumulative+=hist[i];if(cumulative>count*.01){low=i;break;}}
   cumulative=0;for(let i=255;i>=0;i--){cumulative+=hist[i];if(cumulative>count*.01){high=i;break;}}
   for(let i=0;i<pixels.data.length;i+=4){const g=.299*pixels.data[i]+.587*pixels.data[i+1]+.114*pixels.data[i+2];const v=Math.max(0,Math.min(255,(g-low)*255/Math.max(1,high-low)));pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;}
   ctx.putImageData(pixels,0,0);
  }
  return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Cannot prepare image.')),'image/png'));
 }finally{bitmap.close();}
}
export async function readPrintedPhoto(image:Blob,progress:(percent:number)=>void):Promise<PhotoReading>{
 const {createWorker,PSM}=await import('tesseract.js');
 const worker=await createWorker('eng',1,{logger:m=>{if(m.status==='recognizing text')progress(Math.round(m.progress*100));}});
 try{
  await worker.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT});
  const first=await worker.recognize(image);let reading=extractCandidates(first.data.text);
  // A second layout pass can recover list rows without merging conflicting readings.
  if(reading.rows.length<2){await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_BLOCK});const second=extractCandidates((await worker.recognize(image)).data.text);if(second.rows.length>reading.rows.length)reading=second;}
  return reading;
 }finally{await worker.terminate();}
}
