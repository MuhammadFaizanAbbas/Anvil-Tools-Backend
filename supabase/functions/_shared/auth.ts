import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
export const db = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {auth:{persistSession:false,autoRefreshToken:false}});
export function cors(req: Request) {
 const origin=req.headers.get('origin');
 const allowed=(Deno.env.get('FRONTEND_ORIGINS')||'https://anviltools.vercel.app').split(',').map(s=>s.trim());
 if(origin&&!allowed.includes(origin))throw new Error('Origin denied');
 return {'Access-Control-Allow-Origin':origin||allowed[0], 'Vary':'Origin','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS','Cache-Control':'no-store'};
}
export function json(data:unknown,status=200,headers:Record<string,string>={}){return new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json'}});}
export async function admin(req:Request){
 const token=req.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];if(!token)throw new Error('Unauthorized');
 const client=db();const {data,error}=await client.auth.getUser(token);if(error||!data.user)throw new Error('Unauthorized');
 const owners=(Deno.env.get('ADMIN_EMAILS')||'').toLowerCase().split(',').map(s=>s.trim());
 if(data.user.email_confirmed_at&&data.user.email&&owners.includes(data.user.email.toLowerCase()))return data.user;
 const result=await client.from('profiles').select('role,is_active').eq('id',data.user.id).maybeSingle();
 if(result.error||!result.data?.is_active||!['admin','owner'].includes(result.data.role))throw new Error('Forbidden');return data.user;
}
export function failure(error:unknown,headers:Record<string,string>){const msg=error instanceof Error?error.message:'';return json({error:['Unauthorized','Forbidden','Origin denied'].includes(msg)?msg:'Function request failed'},msg==='Unauthorized'?401:['Forbidden','Origin denied'].includes(msg)?403:500,headers);}
