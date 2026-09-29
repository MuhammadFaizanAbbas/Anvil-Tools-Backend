const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.VERCEL = '';
const originalFetch = global.fetch;
let failure = '', deleted = false, inserted, lastProvider, rpcCalls=[];
let mailList=[], mailDetail={};
const session = { capability: 'a'.repeat(64), token: JSON.stringify({sid:'private-token'}), account_id: 'guerrilla-mail', address: 'test@example.test', expires_at: new Date(Date.now() + 60000).toISOString() };
const db = {
  rpc: async name => { rpcCalls.push(name); if(failure==='legacy'&&name==='consume_inbox_creation_limit')return {error:{code:'PGRST202'}}; return failure === 'limit' ? { error: { code: 'DB_ERROR', message: 'secret database details' } } : { data: { allowed: failure!=='limited', remaining: 4, resetIn:60 } }; },
  from() { return { delete() { return this; }, lt: async () => ({ data: [] }), select() { return this; }, eq() { return this; }, then(resolve){return Promise.resolve({data:[]}).then(resolve);}, maybeSingle: async () => ({ data: session }), insert: async row => { inserted = row; return failure === 'storage' ? { error: { code: 'DB_ERROR' } } : { data: [] }; } }; },
};
const cp = require.resolve('../backend/src/lib/supabase');
require.cache[cp] = { id: cp, filename: cp, loaded: true, exports: { supabaseAdmin: db, requireDatabase: (req, res, next) => next() } };
global.fetch = async (url, options = {}) => {
 if(!String(url).startsWith('https://api.guerrillamail.com'))return originalFetch(url,options);
 lastProvider={url:new URL(url),options};
 const fn=lastProvider.url.searchParams.get('f');
 if(failure==='network')throw Error('private network details');
 if(failure==='domains')return new Response('private details',{status:503});
 if(fn==='get_email_address')return Response.json({email_addr:'test@example.test',sid_token:'private-token'});
 if(fn==='get_email_list')return Response.json(failure==='malformed'?{}:{list:mailList,email:failure==='expired'?'another@example.test':session.address});
 if(fn==='fetch_email')return Response.json(mailDetail);
 if(fn==='forget_me'){deleted=true;return Response.json(true);}
 throw Error('Unexpected provider call');
};
const app = require('../backend/src/app');
let server, base;
before(async () => { server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}/api/temp-mail`; });
after(async () => { global.fetch = originalFetch; await new Promise(resolve => server.close(resolve)); });
test('creation fails closed when limiter schema is missing',async()=>{
 failure='limit';const r=await originalFetch(base+'/create',{method:'POST'});assert.equal(r.status,503);assert.equal((await r.json()).code,'INBOX_LIMIT_SETUP_REQUIRED');
});
test('provider failure never exposes credentials or internal errors',async()=>{
 failure='network';const r=await originalFetch(base+'/create',{method:'POST'});assert.equal(r.status,503);assert.doesNotMatch(JSON.stringify(await r.json()),/private/);
});
test('Guerrilla Mail session is stored server-side and never returned',async()=>{
 failure='';const r=await originalFetch(base+'/create',{method:'POST'});assert.equal(r.status,200);const data=await r.json();assert.match(data.capability,/^[a-f0-9]{64}$/);assert.equal(data.token,undefined);assert.equal(JSON.parse(inserted.token).sid,'private-token');
});
test('resuming inbox restores address, and forgetting invalidates the local capability',async()=>{
 const r=await originalFetch(base+'/messages?cap='+session.capability);assert.equal(r.status,200);assert.equal((await r.json()).address,session.address);
 const d=await originalFetch(base+'/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cap:session.capability})});assert.equal(d.status,200);assert.equal(deleted,true);
});
test('missing new limiter uses the production limiter while database failures stay closed',async()=>{
 failure='legacy';rpcCalls=[];
 assert.equal((await originalFetch(base+'/create',{method:'POST'})).status,200);
 assert.deepEqual(rpcCalls,['consume_inbox_creation_limit','consume_temp_mail_limit']);
 failure='limited';
 const response=await originalFetch(base+'/create',{method:'POST'});
 assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'60');
 failure='';
});
test('messages use the original provider session and tolerate missing timestamps',async()=>{
 mailList=[{mail_id:1,mail_subject:'Welcome to Guerrilla Mail',mail_from:'no-reply@guerrillamail.com'},{mail_id:42,mail_subject:'New &amp; ready',mail_from:'sender@example.test'}];
 const response=await originalFetch(base+'/messages?cap='+session.capability);
 assert.equal(response.status,200);
 const data=await response.json();assert.equal(data.messages.length,1);assert.equal(data.messages[0].id,'42');assert.equal(data.messages[0].createdAt,null);
 assert.equal(lastProvider.url.searchParams.get('sid_token'),'private-token');
 assert.doesNotMatch(JSON.stringify(data),/private-token/);
});
test('message details retain plain text and remove HTML without losing line breaks',async()=>{
 mailDetail={mail_id:42,mail_body:'Code: 2 < 3 & 4 > 1',content_type:'text'};
 let response=await originalFetch(base+'/messages/42?cap='+session.capability);
 assert.equal(response.status,200);assert.equal((await response.json()).text,mailDetail.mail_body);
 mailDetail={mail_id:42,mail_body:'<p>Code &amp; link</p><script>bad()</script><p>123456</p>',content_type:'text/html'};
 response=await originalFetch(base+'/messages/42?cap='+session.capability);
 const data=await response.json();assert.equal(data.text,'Code & link\n123456\n');assert.equal(data.textEncoded,true);
});
test('provider welcome message cannot be opened directly',async()=>{
 mailDetail={mail_id:1,mail_from:'no-reply@guerrillamail.com',mail_subject:'Welcome to Guerrilla Mail',mail_body:'Provider introduction',content_type:'text'};
 assert.equal((await originalFetch(base+'/messages/1?cap='+session.capability)).status,404);
});
test('invalid provider data is an error and changed inbox identities expire',async()=>{
 failure='malformed';assert.equal((await originalFetch(base+'/messages?cap='+session.capability)).status,503);
 failure='expired';assert.equal((await originalFetch(base+'/messages?cap='+session.capability)).status,410);
 failure='';
});
test('failed storage cleans up only the newly created provider inbox',async()=>{
 failure='storage';deleted=false;
 assert.equal((await originalFetch(base+'/create',{method:'POST'})).status,500);
 assert.equal(deleted,true);failure='';
});
