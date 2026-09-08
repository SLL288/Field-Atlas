import express from 'express';
import {ActivityError,ActivityStore} from './activity-store';
import {MAX_ACTIVITY_BYTES} from '../shared/activity';
export function activityRouter(store:ActivityStore){
 const router=express.Router();
 let active=0;
 const attempts=new Map<string,{time:number;count:number}>();
 router.post('/',(req,res,next)=>{
  const now=Date.now();for(const [key,v]of attempts)if(now-v.time>60000)attempts.delete(key);
  const key=req.ip||'unknown',entry=attempts.get(key)||{time:now,count:0};
  if(entry.count>=120||attempts.size>10000||active>=4){res.setHeader('Retry-After','60');res.status(429).json({error:'Archive is busy. Pending actions will retry.'});return;}
  entry.count++;attempts.set(key,entry);active++;let released=false;const release=()=>{if(!released){released=true;active--;}};res.once('finish',release);res.once('close',release);next();
 },express.json({limit:MAX_ACTIVITY_BYTES}),async(req,res)=>{
  const result=await store.save(req.body);
  res.setHeader('Cache-Control','no-store');res.status(result.duplicate?200:201).json({event_id:result.record.event_id,received_at:result.record.received_at,duplicate:result.duplicate});
 });
 router.use(activityErrors);
 return router;
}
export function adminActivityRouter(store:ActivityStore){
 const router=express.Router();
 router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
 router.get('/',async(req,res)=>res.json(await store.list(String(req.query.date||new Date().toISOString().slice(0,10)),Number(req.query.offset||0),Number(req.query.limit||50))));
 router.get('/:id',async(req,res)=>res.json(await store.get(req.params.id)));
 router.get('/:id/files/:name',async(req,res)=>res.download(await store.file(req.params.id,req.params.name)));
 router.use(activityErrors);
 return router;
}
const activityErrors:express.ErrorRequestHandler=(error,_req,res,_next)=>{
 if(error instanceof ActivityError){res.status(error.status).json({error:error.message});return;}
 if(error.status===413){res.status(413).json({error:'Activity is too large to archive.'});return;}
 if(error instanceof SyntaxError){res.status(400).json({error:'Invalid activity JSON.'});return;}
 console.error('Activity archive failed:',error.code||error.name);
 res.status(503).json({error:'Archive storage is unavailable. This action will stay queued on your device.'});
};
