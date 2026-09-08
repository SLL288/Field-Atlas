interface Env { BACKEND?: {fetch(request:Request):Promise<Response>} }
export const onRequest = async ({request,env}:{request:Request;env:Env}) => {
 if(!env.BACKEND)return Response.json({error:'Cloudflare backend is not connected. Add the BACKEND service binding and redeploy Pages.'},{status:503,headers:{'Cache-Control':'no-store'}});
 try{return await env.BACKEND.fetch(request);}catch{return Response.json({error:'Backend temporarily unavailable. Saved actions will retry.'},{status:503,headers:{'Cache-Control':'no-store'}});}
};
