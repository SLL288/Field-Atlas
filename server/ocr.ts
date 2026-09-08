import express from 'express';
import {recognizeHandwriting} from './handwriting';
export {recognizeHandwriting,readingSchema} from './handwriting';
export const ocrRouter=express.Router();
ocrRouter.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
ocrRouter.get('/capabilities',(_req,res)=>res.json({handwritingAvailable:Boolean(process.env.OPENAI_API_KEY),provider:'OpenAI'}));
const attempts=new Map<string,{time:number;count:number}>();let active=0;
ocrRouter.post('/handwriting',(req,res,next)=>{
 if(!process.env.OPENAI_API_KEY){res.status(503).json({error:'Handwriting recognition is not configured. Use local reading or manual review.'});return;}
 const now=Date.now();for(const [key,v] of attempts)if(now-v.time>60000)attempts.delete(key);
 const ip=req.ip||'unknown';const entry=attempts.get(ip)||{time:now,count:0};
 if(entry.count>=5||attempts.size>10000||active>=2){res.status(429).json({error:'Too many photo requests. Please wait a minute.'});return;}
 entry.count++;attempts.set(ip,entry);next();
},express.raw({type:['image/png','image/jpeg','image/webp'],limit:'10mb'}),async(req,res)=>{
 const data=req.body;
 const isPng=Buffer.isBuffer(data)&&data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const isJpeg=Buffer.isBuffer(data)&&data[0]===255&&data[1]===216&&data[2]===255;
 const isWebp=Buffer.isBuffer(data)&&data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP';
 if(!Buffer.isBuffer(data)||!data.length||!(isPng||isJpeg||isWebp)){res.status(400).json({error:'Use a valid JPEG, PNG or WebP image.'});return;}
 if(active>=2){res.status(429).json({error:'Handwriting service is busy. Try again later.'});return;}
 active++;
 try{res.json(await recognizeHandwriting(data,isPng?'image/png':isJpeg?'image/jpeg':'image/webp'));}
 catch(e){res.status(502).json({error:e instanceof Error&&!(e instanceof SyntaxError)?e.message:'Invalid recognition response. Please try again.'});}
 finally{active--;}
});
ocrRouter.use((err:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(err.status===413?413:400).json({error:err.status===413?'Image limit is 10 MB.':'Cannot read uploaded image.'}));
