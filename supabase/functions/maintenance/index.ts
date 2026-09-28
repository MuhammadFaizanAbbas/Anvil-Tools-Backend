import {admin,db,cors,json,failure} from '../_shared/auth.ts';
// Manually invoked by a verified administrator; no embedded scheduler secret.
Deno.serve(async req=>{let headers:Record<string,string>={};try{
 headers=cors(req);if(req.method==='OPTIONS')return new Response(null,{status:204,headers});if(req.method!=='POST')return json({error:'Method not allowed'},405,headers);
 const user=await admin(req);const client=db();const {data,error}=await client.rpc('cleanup_expired_state');if(error)throw error;
 const audit=await client.from('audit_logs').insert({actor_id:user.id,action:'maintenance.cleanup',target:'expired_state',details:data});if(audit.error)throw audit.error;
 return json({ok:true,...data},200,headers);
}catch(error){return failure(error,headers);}});
