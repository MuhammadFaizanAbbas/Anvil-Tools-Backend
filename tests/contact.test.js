const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.ADMIN_EMAILS = 'admin@example.com';
process.env.VERCEL = '';
process.env.SMTP_HOST = 'smtp.test'; process.env.SMTP_USER = 'sender'; process.env.SMTP_PASS = 'test'; process.env.SMTP_FROM = 'info@velloxtech.com';
const contacts = [], jobs = [], sent = [];
let smtpFailure = null, blocked = false, persistenceFailure = false;
const nodemailer = require('nodemailer');
nodemailer.createTransport = () => ({ sendMail: async mail => {
  if (smtpFailure) throw Object.assign(new Error('Provider error'), { code: smtpFailure });
  sent.push(mail); return { accepted: [mail.to.address], messageId: mail.messageId };
} });
const db = {
  auth: { getUser: async token => ({ data: { user: token === 'admin' ? { email: 'admin@example.com', email_confirmed_at: '2026-01-01' } : { email: 'other@example.com' } } }) },
  from(table) {
    const rows = table === 'contact_requests' ? contacts : jobs;
    let filters = [], action = 'select', values, bounds;
    const query = {
      select() { return this; }, order() { return this; },
      eq(key, value) { filters.push(row => row[key] === value); return this; },
      in(key, values) { filters.push(row => values.includes(row[key])); return this; },
      update(value) { action = 'update'; values = value; return this; },
      insert(value) { action = 'insert'; values = value; return this; },
      range(a,b) { bounds = [a,b]; return this; },
      execute(single = false) {
        let found = rows.filter(row => filters.every(fn => fn(row)));
        if (action === 'insert') {
          if (rows.some(row => row.id === values.id)) return { error: { code: '23505' } };
          const row = { status:'queued', attempts:0, created_at:new Date().toISOString(), ...values }; rows.push(row); found = [row];
        }
        if (action === 'update') found.forEach(row => Object.assign(row,values));
        if (bounds) found = found.slice(bounds[0],bounds[1]+1);
        return { data: single ? (found[0] ? {...found[0]} : null) : found.map(row => ({...row})), count: rows.length };
      },
      maybeSingle() { return Promise.resolve(this.execute(true)); }, single() { return Promise.resolve(this.execute(true)); },
      then(resolve,reject) { return Promise.resolve(this.execute()).then(resolve,reject); }
    }; return query;
  },
  async rpc(name, args) {
    if (name === 'consume_temp_mail_limit') return { data:{allowed:!blocked,resetIn:120} };
    if (persistenceFailure) return { error:new Error('Database write unavailable') };
    if (contacts.some(row=>row.id === args.request_id)) return { data:false };
    contacts.push({id:args.request_id,name:args.sender_name,email:args.sender_email,subject:args.contact_subject,message:args.contact_message,created_at:new Date().toISOString()});
    for (const kind of ['alert','receipt']) jobs.push({id:crypto.randomUUID(),contact_id:args.request_id,kind,recipient:kind === 'alert'?'faizan@velloxtech.com':args.sender_email,subject:args.contact_subject,body:args.contact_message,status:'queued',attempts:0});
    return {data:true};
  }
};
const clientPath = require.resolve('../backend/src/lib/supabase');
require.cache[clientPath] = {id:clientPath,filename:clientPath,loaded:true,exports:{supabaseAdmin:db,requireDatabase:(req,res,next)=>next()}};
const app = require('../backend/src/app'); let server,base;
before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;});
after(()=>new Promise(r=>server.close(r)));
const payload = ()=>({id:crypto.randomUUID(),name:'Test Sender',email:'sender@example.com',subject:'Help with PDF',message:'Please help with merging my documents.'});
async function post(path,body,admin=false) {return fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(admin?{Authorization:'Bearer admin'}:{})},body:JSON.stringify(body)});}
test('contact validates input and rate limits before storage or SMTP',async()=>{
  let res=await post('/api/contact',{...payload(),email:'a@example.com\r\nBcc: bad@example.com'});assert.equal(res.status,400);
  blocked=true;res=await post('/api/contact',payload());blocked=false;assert.equal(res.status,429);assert.equal(res.headers.get('retry-after'),'120');assert.equal(contacts.length,0);assert.equal(sent.length,0);
});
test('contact logs both emails and duplicate request IDs do not resend',async()=>{
  const p=payload();assert.equal((await post('/api/contact',p)).status,202);
  const own=jobs.filter(j=>j.contact_id===p.id);assert.equal(own.length,2);assert.ok(own.every(j=>j.status==='sent'));
  assert.ok(sent.some(m=>m.to.address==='faizan@velloxtech.com'));assert.ok(sent.some(m=>m.to.address===p.email));
  const count=sent.length;await post('/api/contact',p);assert.equal(sent.length,count);
});
test('failed SMTP preserves contact and supports authenticated retry only',async()=>{
  smtpFailure='EAUTH';const p=payload();assert.equal((await post('/api/contact',p)).status,202);smtpFailure=null;
  const job=jobs.find(j=>j.contact_id===p.id);assert.equal(job.status,'failed');
  assert.equal((await post(`/api/admin/contact-jobs/${job.id}/retry`,{})).status,401);
  assert.equal((await post(`/api/admin/contact-jobs/${job.id}/retry`,{},true)).status,200);assert.equal(job.status,'sent');assert.equal(job.attempts,2);
  assert.equal((await post(`/api/admin/contact-jobs/${job.id}/retry`,{},true)).status,409);
});
test('unknown delivery is logged and cannot be retried blindly',async()=>{
  smtpFailure='ETIMEDOUT';const p=payload();await post('/api/contact',p);smtpFailure=null;
  const job=jobs.find(j=>j.contact_id===p.id);assert.equal(job.status,'unknown');assert.equal((await post(`/api/admin/contact-jobs/${job.id}/retry`,{},true)).status,409);
});
test('admin replies only to stored client, records author and deduplicates concurrent requests',async()=>{
  const contact=contacts[0], reply={id:crypto.randomUUID(),message:'Here is how to use the tool.',recipient:'attacker@example.com'};
  assert.equal((await post(`/api/admin/contacts/${contact.id}/replies`,reply)).status,401);
  const before=sent.length;await Promise.all([post(`/api/admin/contacts/${contact.id}/replies`,reply,true),post(`/api/admin/contacts/${contact.id}/replies`,reply,true)]);
  assert.equal(sent.length,before+1);assert.equal(sent.at(-1).to.address,contact.email);assert.equal(jobs.find(j=>j.id===reply.id).created_by,'admin@example.com');
});
test('contact data stays private and database failure never sends mail',async()=>{
  assert.equal((await fetch(base+'/api/admin/contacts')).status,401);
  assert.equal((await fetch(base+'/api/admin/contacts',{headers:{Authorization:'Bearer other'}})).status,403);
  assert.equal((await fetch(base+'/api/admin/contacts',{headers:{Authorization:'Bearer admin'}})).status,200);
  persistenceFailure=true;const before=sent.length;assert.equal((await post('/api/contact',payload())).status,500);persistenceFailure=false;assert.equal(sent.length,before);
});
