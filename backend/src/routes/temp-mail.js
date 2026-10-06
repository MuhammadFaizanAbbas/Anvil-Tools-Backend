const router=require('express').Router();
const crypto=require('node:crypto');
const {supabaseAdmin:db}=require('../lib/supabase');
const {requireAdmin}=require('../middleware/auth');
const run=require('../lib/async-handler');
const provider=require('../lib/guerrilla-mail');
const unwrap=r=>{if(r.error)throw r.error;return r.data;};
const mailDate=value=>{const time=Number(value)*1000;return Number.isFinite(time)&&time>0&&time<=8640000000000000?new Date(time).toISOString():null;};
const isProviderWelcome=message=>String(message?.mail_from||'').trim().toLowerCase()==='no-reply@guerrillamail.com'&&/^welcome to guerrilla mail$/i.test(String(message?.mail_subject||'').trim());
const client=req=>({ip:process.env.VERCEL?req.get('x-vercel-forwarded-for'):req.socket.remoteAddress,agent:req.get('User-Agent')||''});
const authorize=run(async(req,res,next)=>{
 const cap=req.get('X-Inbox-Capability')||req.query.cap||req.body?.cap;
 if(typeof cap!=='string'||!/^[a-f0-9]{64}$/.test(cap))return res.status(404).json({error:'Invalid inbox'});
 const row=unwrap(await db.from('temp_mail_sessions').select('*').eq('capability',cap).maybeSingle());
 if(!row)return res.status(404).json({error:'Inbox unavailable'});
 if(Date.parse(row.expires_at)<=Date.now()||row.account_id!=='guerrilla-mail')return res.status(410).json({error:'Inbox expired. Create a new inbox.'});
 req.mail=row;next();
});
async function call(req,fn,params){
 const old=JSON.parse(req.mail.token);
 const result=await provider.call(fn,params,old,client(req));
 if(fn==='get_email_list'&&typeof result.data.email==='string'&&result.data.email.toLowerCase()!==req.mail.address.toLowerCase())throw Object.assign(Error('Inbox expired. Create a new inbox.'),{status:410});
 if(result.session.sid!==old.sid||result.session.cookie!==old.cookie)unwrap(await db.from('temp_mail_sessions').update({token:JSON.stringify(result.session)}).eq('capability',req.mail.capability));
 return result.data;
}
router.post('/create',run(async(req,res)=>{
 const info=client(req);if(!info.ip)return res.status(503).json({error:'Client address unavailable'});
 const key=crypto.createHash('sha256').update(info.ip).digest('hex');
 let result=await db.rpc('consume_inbox_creation_limit',{client_key:key});
 // Older deployments still have the original atomic limiter. Keep enforcing it until the new RPC is installed.
 if(['PGRST202','42883'].includes(result.error?.code)){
  const minute=Math.floor(Date.now()/60000),resetIn=60-Math.floor(Date.now()/1000)%60;
  result=await db.rpc('consume_temp_mail_limit',{client_key:`inbox-minute:${minute}:${key}`});
  if(result.data)result.data={...result.data,resetIn};
 }
 if(result.error)return res.status(503).json({error:'Inbox creation is being configured. Please try again later.',code:'INBOX_LIMIT_SETUP_REQUIRED'});
 const limit=result.data;
 if(!limit.allowed){res.set('Retry-After',String(limit.resetIn));return res.status(429).json({error:'This site limits new inbox creation to prevent automated abuse. Your current inbox still works; wait before creating another.',code:'INBOX_CREATION_LIMIT',...limit});}
 const {data,session}=await provider.call('get_email_address',{},null,info);
 if(!data?.email_addr||!session.sid)throw Object.assign(Error('Provider could not create an inbox.'),{status:503});
 const capability=crypto.randomBytes(32).toString('hex'),expiresAt=Date.now()+3600000;
 try{unwrap(await db.from('temp_mail_sessions').insert({capability,address:data.email_addr,token:JSON.stringify(session),account_id:'guerrilla-mail',expires_at:new Date(expiresAt).toISOString()}));}
 catch(error){try{await provider.call('forget_me',{email_addr:data.email_addr},session,info);}catch(_){}throw error;}
 res.json({ok:true,capability,address:data.email_addr,expiresAt,remaining:limit.remaining});
}));
router.get('/messages',authorize,run(async(req,res)=>{
 const data=await call(req,'get_email_list',{offset:'0'});
 const messages=(Array.isArray(data.list)?data.list:[]).filter(message=>!isProviderWelcome(message));
 res.json({ok:true,address:req.mail.address,expiresAt:Date.parse(req.mail.expires_at),messages:messages.map(m=>({id:String(m.mail_id),from:m.mail_from,subject:m.mail_subject,intro:m.mail_excerpt,createdAt:mailDate(m.mail_timestamp)}))});
}));
router.get('/messages/:id',authorize,run(async(req,res)=>{
 if(!/^\d+$/.test(req.params.id))return res.status(400).json({error:'Invalid message'});
 const data=await call(req,'fetch_email',{email_id:req.params.id});
 if(!data?.mail_id)return res.status(404).json({error:'Message not found'});
 if(isProviderWelcome(data))return res.status(404).json({error:'Message not found'});
 const body=String(data.mail_body||'');
 const containsHtml=/<\/?[a-z][\s\S]*>/i.test(body);
 const text=data.content_type==='text'&&!containsHtml?body:body.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<br\s*\/?\s*>|<\/(?:p|div|li|tr|h[1-6])>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');
 res.json({ok:true,id:String(data.mail_id),from:{address:data.mail_from},subject:data.mail_subject,text,textEncoded:data.content_type!=='text'||containsHtml,createdAt:mailDate(data.mail_timestamp)});
}));
router.post('/delete',authorize,run(async(req,res)=>{
 await call(req,'forget_me',{email_addr:req.mail.address});
 unwrap(await db.from('temp_mail_sessions').delete().eq('capability',req.mail.capability));res.json({ok:true});
}));
router.get('/stats', requireAdmin, run(async (req, res) => {
  const result = await db.from('temp_mail_sessions').select('*', { count: 'exact', head: true }).gt('expires_at', new Date().toISOString());
  unwrap(result);
  res.json({ ok: true, inMemory: 0, supabase: result.count, total: result.count, ttlHours: 1, storageMode: 'supabase' });
}));
router.use((error,req,res,next)=>{
 if(error.code==='MAIL_PROVIDER_UNAVAILABLE')return res.status(503).json({error:error.message,code:error.code});
 next(error);
});
module.exports = router;
