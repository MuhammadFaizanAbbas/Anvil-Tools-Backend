const router=require('express').Router();
const {supabaseAdmin:db}=require('../lib/supabase');
const run=require('../lib/async-handler');
const {renderArticle,escape}=require('../lib/articles');
const {requestSiteOrigin}=require('../lib/site-origin');
const unwrap=result=>{if(result.error)throw result.error;return result.data;};
router.get('/articles/:slug',run(async(req,res)=>{
 const siteOrigin=requestSiteOrigin(req);
 const post=unwrap(await db.from('posts').select('*').eq('slug',req.params.slug).eq('status','published').maybeSingle());
 if(!post)return res.status(404).type('html').send(`<!doctype html><title>Article unavailable</title><h1>Article unavailable</h1><a href="${escape(siteOrigin)}/blog/index.html">Return to guides</a>`);
 res.removeHeader('X-Robots-Tag');res.set('Cache-Control','no-store').type('html').send(renderArticle(post,siteOrigin));
}));
router.get('/post-images/:id',run(async(req,res)=>{
 if(!/^[a-f0-9-]{36}$/i.test(req.params.id))return res.sendStatus(404);
 const posts=unwrap(await db.from('posts').select('id').eq('cover_image_id',req.params.id).eq('status','published').limit(1));
 if(!posts.length)return res.sendStatus(404);
 const asset=unwrap(await db.from('media_assets').select('storage_path,mime_type').eq('id',req.params.id).maybeSingle());
 if(!asset)return res.sendStatus(404);
 const blob=unwrap(await db.storage.from('editorial-media').download(asset.storage_path));
 const normalize=value=>String(value||'').split(';')[0].trim().toLowerCase().replace(/^image\/jpg$/,'image/jpeg');
 const supported=new Set(['image/svg+xml','image/png','image/jpeg','image/webp','image/gif','image/avif','image/bmp','image/x-icon']);
 const extension=asset.storage_path.split('.').pop().toLowerCase();
 const inferred={svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',avif:'image/avif',bmp:'image/bmp',ico:'image/x-icon'}[extension];
 const mime=[normalize(asset.mime_type),normalize(blob.type),inferred].find(type=>supported.has(type));
 if(!mime)return res.status(415).json({error:'Unsupported image type'});
 res.removeHeader('X-Robots-Tag');res.set('X-Content-Type-Options','nosniff');res.set('Cache-Control','no-store');
 if(mime==='image/svg+xml')res.set('Content-Security-Policy',"sandbox; default-src 'none'; style-src 'unsafe-inline'");
 res.type(mime).send(Buffer.from(await blob.arrayBuffer()));
}));
router.get('/sitemap.xml',run(async(req,res)=>{
 const siteOrigin=requestSiteOrigin(req);
 const posts=unwrap(await db.from('posts').select('slug,updated_at').eq('status','published').order('updated_at',{ascending:false}).limit(10000));
 res.removeHeader('X-Robots-Tag');res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${posts.map(p=>`<url><loc>${escape(siteOrigin+'/journal/'+encodeURIComponent(p.slug))}</loc><lastmod>${escape(p.updated_at)}</lastmod></url>`).join('')}</urlset>`);
}));
module.exports=router;
