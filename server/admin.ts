import {timingSafeEqual} from 'node:crypto';
import type {RequestHandler} from 'express';
export const requireAdmin:RequestHandler=(req,res,next)=>{
 const expected=process.env.ADMIN_TOKEN,actual=req.headers.authorization?.replace(/^Bearer /,'');
 if(!expected||!actual||Buffer.byteLength(expected)!==Buffer.byteLength(actual)||!timingSafeEqual(Buffer.from(expected),Buffer.from(actual))){
  res.status(401).json({error:'Administrator authorization required.'});return;
 }
 next();
};
