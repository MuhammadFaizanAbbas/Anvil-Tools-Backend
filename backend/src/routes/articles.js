const router=require('express').Router();
const {supabaseAdmin:db}=require('../lib/supabase');
const run=require('../lib/async-handler');
const {renderArticle,escape,site}=require('../lib/articles');
const unwrap=result=>{if(result.error)throw result.error;return result.data;};
router.get('/articles/:slug',run(async(req,res)=>{
 const post=unwrap(await db.from('posts').select('*').eq('slug',req.params.slug).eq('status','published').maybeSingle());
 if(!post)return res.status(404).type('html').send('<!doctype html><title>Article unavailable</title><h1>Article unavailable</h1><a href="https://anviltools.vercel.app/blog/index.html">Return to guides</a>');
 res.removeHeader('X-Robots-Tag');res.set('Cache-Control','no-store').type('html').send(renderArticle(post));
}));
router.get('/post-images/:id',run(async(req,res)=>{
 if(!/^[a-f0-9-]{36}$/i.test(req.params.id))return res.sendStatus(404);
 const posts=unwrap(await db.from('posts').select('id').eq('cover_image_id',req.params.id).eq('status','published').limit(1));
 if(!posts.length)return res.sendStatus(404);
 const asset=unwrap(await db.from('media_assets').select('storage_path,mime_type').eq('id',req.params.id).maybeSingle());
 if(!asset)return res.sendStatus(404);
 const blob=unwrap(await db.storage.from('editorial-media').download(asset.storage_path));
 res.removeHeader('X-Robots-Tag');res.set('X-Content-Type-Options','nosniff');res.set('Cache-Control','no-store');res.type('image/webp').send(Buffer.from(await blob.arrayBuffer()));
}));
router.get('/sitemap.xml',run(async(req,res)=>{
 const posts=unwrap(await db.from('posts').select('slug,updated_at').eq('status','published').order('updated_at',{ascending:false}).limit(10000));
 res.removeHeader('X-Robots-Tag');res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${posts.map(p=>`<url><loc>${escape(site()+'/journal/'+encodeURIComponent(p.slug))}</loc><lastmod>${escape(p.updated_at)}</lastmod></url>`).join('')}</urlset>`);
}));
module.exports=router;
