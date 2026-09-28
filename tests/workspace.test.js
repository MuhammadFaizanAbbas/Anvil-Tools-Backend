const {test,before,after}=require('node:test');const assert=require('node:assert/strict');
process.env.ADMIN_EMAILS='owner@example.com';
const ids={owner:'11111111-1111-4111-8111-111111111111',admin:'22222222-2222-4222-8222-222222222222',member:'33333333-3333-4333-8333-333333333333'};
const profiles=Object.entries(ids).map(([role,id])=>({id,email:`${role}@example.com`,role:role==='owner'?'member':role,is_active:true}));
const rpc=[];
const db={auth:{getUser:async token=>({data:{user:ids[token]?{id:ids[token],email_confirmed_at:'2026-01-01',email:`${token}@example.com`,user_metadata:{role:'owner'}}:null}})},from(){let id;return{select(){return this;},eq(k,v){id=v;return this;},maybeSingle:async()=>({data:profiles.find(p=>p.id===id)||null}),order(){return this;},range:async()=>({data:profiles,count:profiles.length})};},rpc:async(name,args)=>{rpc.push({name,args});if(name==='change_user_access'){const p=profiles.find(p=>p.id===args.target_id);p.role=args.new_role;p.is_active=args.enabled;}return{data:{}};}};
const cp=require.resolve('../backend/src/lib/supabase');require.cache[cp]={id:cp,filename:cp,loaded:true,exports:{supabaseAdmin:db,requireDatabase:(req,res,next)=>next()}};
const app=require('../backend/src/app');let server,base;
before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;});after(()=>new Promise(r=>server.close(r)));
const request=(path,token,body)=>fetch(base+path,{method:body?'PUT':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
test('verified identity metadata cannot self-grant admin; database roles grant access',async()=>{
 assert.equal((await request('/api/admin/me','member')).status,403);
 assert.equal((await request('/api/admin/me','admin')).status,200);
 const owner=await request('/api/admin/me','owner');assert.equal((await owner.json()).user.role,'owner');
});
test('admins can grant access but cannot edit owner or their own permissions',async()=>{
 assert.equal((await request(`/api/admin/users/${ids.owner}`,'admin',{role:'member',is_active:false})).status,403);
 assert.equal((await request(`/api/admin/users/${ids.admin}`,'admin',{role:'member',is_active:false})).status,403);
 assert.equal((await request(`/api/admin/users/${ids.member}`,'admin',{role:'owner',is_active:true})).status,400);
 assert.equal((await request(`/api/admin/users/${ids.member}`,'admin',{role:'admin',is_active:true})).status,200);
 assert.equal((await request('/api/admin/me','member')).status,200);
 assert.equal(rpc.at(-1).args.actor,ids.admin);
});
test('revocation takes effect on the next request even with an existing token',async()=>{
 assert.equal((await request(`/api/admin/users/${ids.member}`,'owner',{role:'admin',is_active:false})).status,200);
 assert.equal((await request('/api/admin/me','member')).status,403);
});
