const router=require('express').Router();
const {supabaseAdmin:db}=require('../lib/supabase');
const run=require('../lib/async-handler');
const {renderArticle,escape}=require('../lib/articles');
const {requestSiteOrigin}=require('../lib/site-origin');
const {PAGE_SIZE,blogPage,renderBlog}=require('../lib/blog');
const redirects=require('../lib/article-redirects.json');
const {renderUnavailable}=require('../lib/retired-article');
const unwrap=result=>{if(result.error)throw result.error;return result.data;};
router.get('/blog',run(async(req,res)=>{
 const page=blogPage(req.query.page);
 if(page===null)return res.status(400).json({error:'Page must be a whole number between 1 and 33334.'});
 const offset=(page-1)*PAGE_SIZE;
 let posts;
 try { posts=unwrap(await db.from('posts').select('slug,title,excerpt,cover_image_id,cover_alt').eq('status','published').order('published_at',{ascending:false,nullsFirst:false}).order('slug').range(offset,offset+PAGE_SIZE)); }
 catch(error) {
  console.error('Published blog listing unavailable:',error.code||'query failed');
  res.removeHeader('X-Robots-Tag');
  return res.set('Cache-Control','no-store').type('html').send(renderBlog([],requestSiteOrigin(req),{page,unavailable:true}));
 }
 if(page>1&&!posts.length)return res.set('X-Robots-Tag','noindex, follow').set('Cache-Control','no-store').status(404).type('html').send(renderUnavailable(requestSiteOrigin(req),false,{title:'Page not found',message:'There are no articles on this page. Browse the current guides instead.'}));
 res.removeHeader('X-Robots-Tag');
 res.set('Cache-Control','no-store').type('html').send(renderBlog(posts.slice(0,PAGE_SIZE),requestSiteOrigin(req),{page,hasNext:posts.length>PAGE_SIZE}));
}));
router.get('/articles/:slug',run(async(req,res)=>{
 const siteOrigin=requestSiteOrigin(req);
 const target=Object.hasOwn(redirects,req.params.slug)?redirects[req.params.slug]:null;
 if(Object.hasOwn(redirects,req.params.slug)&&target===null)return res.set('X-Robots-Tag','noindex, follow').set('Cache-Control','no-store').status(410).type('html').send(renderUnavailable(siteOrigin,true));
 if(target){res.removeHeader('X-Robots-Tag');return res.set('Cache-Control','public, max-age=300').redirect(301,`${siteOrigin}/journal/${target}`);}
 const post=unwrap(await db.from('posts').select('*').eq('slug',req.params.slug).eq('status','published').maybeSingle());
 if(!post)return res.set('X-Robots-Tag','noindex, follow').status(404).type('html').send(renderUnavailable(siteOrigin));
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
