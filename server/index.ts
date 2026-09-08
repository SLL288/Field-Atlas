import './env';
import express from 'express';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {requireAdmin} from './admin';
import {ActivityStore} from './activity-store';
import {activityRouter,adminActivityRouter} from './activity';
import {initCache,snapshot,sync} from './cache';
import {ocrRouter} from './ocr';
import {kml} from '../shared/geo';
const app=express();app.disable('x-powered-by');
const activityStore=new ActivityStore();
app.use((_req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');next();});
app.use('/api/activity',activityRouter(activityStore));
app.use(express.json({limit:'2kb'}));
app.use('/api/admin/activity',requireAdmin,adminActivityRouter(activityStore));
app.use('/api/ocr',ocrRouter);
app.get('/api/health',(_req,res)=>res.json({ok:true,feature_count:snapshot().meta.feature_count}));
app.get('/api/mme',(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json(snapshot());});
app.post('/api/mme/refresh',(_req,res)=>{void sync();res.status(202).json({message:'Freshness check requested',...snapshot().meta});});
app.post('/api/admin/mme/refresh',requireAdmin,(_req,res)=>{
 void sync(true);res.status(202).json({message:'Administrator refresh requested; minimum interval 15 minutes.'});
});
app.get('/api/mme/:filename',async(req,res)=>{
 const s=snapshot();if(!s.data.features.length){res.status(503).json({error:'No verified MME dataset available yet.'});return;}
 if(!['mme_licenses_latest.kml','mme_licenses_latest.geojson'].includes(req.params.filename)){res.sendStatus(404);return;}
 try{
  await activityStore.save({version:1,event_id:randomUUID(),client_id:randomUUID(),session_id:randomUUID(),occurred_at:new Date().toISOString(),action:'export',geometry:s.data,format:req.params.filename.endsWith('.kml')?'KML':'GeoJSON',filename:req.params.filename,context:{source:'mme_dataset',mme_updated_at:s.meta.last_successful_update_at}});
 }catch{res.status(503).json({error:'Cannot archive the generated dataset file. Please retry later.'});return;}
 if(req.params.filename==='mme_licenses_latest.kml')res.type('application/vnd.google-earth.kml+xml').attachment(req.params.filename).send(kml(s.data));
 else if(req.params.filename==='mme_licenses_latest.geojson')res.type('application/geo+json').attachment(req.params.filename).send(JSON.stringify(s.data,null,2));
 else res.sendStatus(404);
});
app.use('/api',(_req,res)=>res.sendStatus(404));
app.use(express.static(path.resolve('dist')));
app.get('/{*splat}',(_req,res)=>res.sendFile(path.resolve('dist/index.html')));
await activityStore.init();
await initCache();
app.listen(Number(process.env.PORT||3001),'0.0.0.0',()=>console.log('Field Atlas backend: http://localhost:'+(process.env.PORT||3001)));
void sync();setInterval(()=>void sync(),60*1000).unref();
