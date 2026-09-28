const router=require('express').Router();
const {supabaseAdmin:db}=require('../lib/supabase');
const {requireAdmin,isOwner}=require('../middleware/auth');
const run=require('../lib/async-handler');
const unwrap=result=>{if(result.error)throw result.error;return result.data;};
const validId=value=>typeof value==='string'&&/^[0-9a-f-]{36}$/i.test(value);
router.use(requireAdmin);
router.get('/users',run(async(req,res)=>{
 const page=Math.max(0,parseInt(req.query.page,10)||0);
 const result=await db.from('profiles').select('*',{count:'exact'}).order('created_at',{ascending:false}).range(page*25,page*25+24);
 res.json({items:unwrap(result).map(user=>({...user,role:isOwner(user)?'owner':user.role,protected:isOwner(user)||user.role==='owner'||user.id===req.user.id})),total:result.count,page});
}));
router.post('/users',run(async(req,res)=>{
 const {email,role='member'}=req.body||{};
 if(typeof email!=='string'||email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email)||!['member','admin'].includes(role))return res.status(400).json({error:'A valid email and role are required.'});
 const redirectTo=`${(process.env.SITE_URL||'https://anviltools.vercel.app').replace(/\/$/,'')}/admin-panel/login.html`;
 const {data,error}=await db.auth.admin.inviteUserByEmail(email.trim().toLowerCase(),{redirectTo});
 if(error)return res.status(400).json({error:'Could not invite this email. It may already be registered; use the user list to manage existing accounts.'});
 unwrap(await db.from('audit_logs').insert({actor_id:req.user.id,action:'user.invited',target:data.user.id,details:{role}}));
 if(role==='admin') unwrap(await db.rpc('change_user_access',{target_id:data.user.id,new_role:'admin',enabled:true,actor:req.user.id}));
 res.status(201).json({ok:true,message:'Invitation sent. The user can sign in with Google using the same email.'});
}));
router.put('/users/:id',run(async(req,res)=>{
 const {role,is_active}=req.body||{};
 if(!validId(req.params.id)||!['member','admin'].includes(role)||typeof is_active!=='boolean')return res.status(400).json({error:'Invalid access settings'});
 const target=unwrap(await db.from('profiles').select('*').eq('id',req.params.id).maybeSingle());
 if(!target)return res.status(404).json({error:'User not found'});
 if(target.id===req.user.id||isOwner(target)||target.role==='owner')return res.status(403).json({error:'Owner and self-access changes are protected.'});
 unwrap(await db.rpc('change_user_access',{target_id:target.id,new_role:role,enabled:is_active,actor:req.user.id}));
 res.json({ok:true});
}));
router.post('/documents',run(async(req,res)=>{
 const p=req.body||{};
 const text=(key,max,required=false)=>typeof p[key]==='string'&&p[key].length<=max&&(!required||p[key].trim());
 if(!text('id',150,true)||!text('slug',150,true)||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug)||!text('title',300,true)||!text('body',100000)||!text('excerpt',5000)||!text('seo_title',160)||!text('seo_description',320)||!['draft','published'].includes(p.status)|| (p.category_slug!==null && (typeof p.category_slug!=='string'||p.category_slug.length>100)))return res.status(400).json({error:'Check the article fields and limits.'});
 if(p.status==='published'&&!p.body.trim())return res.status(400).json({error:'Add article content before publishing.'});
 const result=await db.rpc('save_post_document',{document:{id:p.id,slug:p.slug,title:p.title.trim(),excerpt:p.excerpt,body:p.body,status:p.status,category_slug:p.category_slug,seo_title:p.seo_title,seo_description:p.seo_description},actor:req.user.id});
 if(result.error?.code==='23505')return res.status(409).json({error:'That article slug is already in use.'});
 res.json({ok:true,post:unwrap(result)});
}));
router.get('/documents/:id/revisions',run(async(req,res)=>{
 res.json(unwrap(await db.from('post_revisions').select('*').eq('post_id',req.params.id).order('created_at',{ascending:false}).limit(20)));
}));
router.get('/categories',run(async(req,res)=>{res.json(unwrap(await db.from('categories').select('*').order('sort_order')));}));
router.put('/categories/:slug',run(async(req,res)=>{
 const {name,description=''}=req.body||{};
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(req.params.slug)||req.params.slug.length>100||typeof name!=='string'||!name.trim()||name.length>100||typeof description!=='string'||description.length>2000)return res.status(400).json({error:'Invalid category'});
 unwrap(await db.from('categories').upsert({slug:req.params.slug,name:name.trim(),description}));res.json({ok:true});
}));
router.get('/audit',run(async(req,res)=>{res.json(unwrap(await db.from('audit_logs').select('*').order('created_at',{ascending:false}).limit(100)));}));
router.get('/system',run(async(req,res)=>{res.json({databaseConfigured:true,smtpConfigured:!!(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASS&&process.env.SMTP_FROM),googleSetup:'Enable the Google provider and redirect URL in Supabase Auth.',settings:unwrap(await db.from('site_settings').select('*'))});}));
router.get('/analytics/daily',run(async(req,res)=>{const since=new Date(Date.now()-30*86400000).toISOString().slice(0,10);res.json(unwrap(await db.from('analytics_daily').select('*').gte('day',since).order('day')));}));
module.exports=router;
