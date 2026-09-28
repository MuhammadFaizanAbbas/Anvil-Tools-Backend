import {admin,cors,json,failure} from '../_shared/auth.ts';
// Optional authenticated gateway to the Vercel admin API. Browser access stays role checked.
Deno.serve(async req=>{let headers:Record<string,string>={};try{
 headers=cors(req);if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 await admin(req);
 const path=new URL(req.url).searchParams.get('path')||'/api/admin/me';
 if(!/^\/api\/admin\/(me|users|documents|categories|audit|system|analytics\/daily|contacts|contact-jobs)(\/[a-zA-Z0-9-]+)*(\/replies|\/revisions|\/retry)?(\?(page|offset)=\d+)?$/.test(path)||!['GET','POST','PUT'].includes(req.method))return json({error:'Route not allowed'},400,headers);
 const base=Deno.env.get('BACKEND_URL')||'https://anvil-tools-backend.vercel.app';if(new URL(base).protocol!=='https:')throw new Error('Invalid backend URL');
 const body=req.method==='GET'?undefined:await req.text();if(body&&body.length>200000)return json({error:'Request too large'},413,headers);
 const response=await fetch(new URL(path,base),{method:req.method,headers:{Authorization:req.headers.get('authorization')!,'Content-Type':'application/json'},body,redirect:'error',signal:AbortSignal.timeout(50000)});
 return new Response(await response.text(),{status:response.status,headers:{...headers,'Content-Type':'application/json'}});
}catch(error){return failure(error,headers);}});
