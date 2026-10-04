const {test,before,after}=require('node:test');const assert=require('node:assert/strict');const sharp=require('sharp');
const {prepareImage}=require('../backend/src/lib/images');const {renderArticle}=require('../backend/src/lib/articles');
process.env.ADMIN_EMAILS='owner@example.com';
const assets=[],posts=[],objects=new Map();let failInsert=false;
const db={auth:{getUser:async token=>({data:{user:token==='owner'?{id:'11111111-1111-4111-8111-111111111111',email:'owner@example.com',email_confirmed_at:'2026-01-01'}:null}})},storage:{from(){return{upload:async(key,data)=>{objects.set(key,data);return{data:{path:key}};},remove:async keys=>{keys.forEach(k=>objects.delete(k));return{data:{}};},createSignedUrl:async key=>({data:{signedUrl:`https://storage.example.test/${key}`}}),download:async key=>({data:new Blob([objects.get(key)])})};}},from(table){let filters=[],newRow,limit,bounds;const rows=table==='posts'?posts:assets;return{select(){return this;},eq(k,v){filters.push(r=>r[k]===v);return this;},order(){return this;},range(a,b){bounds=[a,b];return this;},limit(n){limit=n;return this;},insert(row){newRow=row;return this;},async single(){if(failInsert)return{error:Error('Insert failed')};rows.push(newRow);return{data:newRow};},async maybeSingle(){return{data:rows.find(r=>filters.every(f=>f(r)))||null};},then(resolve,reject){let result=rows.filter(r=>filters.every(f=>f(r)));if(limit)result=result.slice(0,limit);if(bounds)result=result.slice(bounds[0],bounds[1]+1);return Promise.resolve({data:result,count:rows.length}).then(resolve,reject);}};}};
const cp=require.resolve('../backend/src/lib/supabase');require.cache[cp]={id:cp,filename:cp,loaded:true,exports:{supabaseAdmin:db,requireDatabase:(req,res,next)=>next()}};
const app=require('../backend/src/app');let server,base,png;
before(async()=>{png=await sharp({create:{width:120,height:80,channels:3,background:'#663399'}}).png().toBuffer();server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;});after(()=>new Promise(r=>server.close(r)));
const upload=(body,token='owner',type='image/png')=>fetch(base+'/api/admin/media?name=cover.png',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':type},body});
test('image processing rejects fake raster files and oversized payloads',async()=>{
 await assert.rejects(()=>prepareImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>')),/cannot be processed/);
 await assert.rejects(()=>prepareImage(Buffer.alloc(3*1024*1024+1)),/under 3 MB/);
 const image=await prepareImage(png);assert.equal(image.info.format,'webp');assert.equal(image.info.width,120);
});
test('upload requires admin, validates bytes, and stores optimized image metadata',async()=>{
 assert.equal((await upload(png,'invalid')).status,401);
 assert.equal((await upload(Buffer.from('not an image'))).status,400);
 const response=await upload(png);assert.equal(response.status,201);const asset=await response.json();assert.equal(asset.mime_type,'image/webp');assert.equal(asset.width,120);assert.ok(objects.has(asset.storage_path));
});
test('failed metadata writes remove the uploaded object',async()=>{
 failInsert=true;const count=objects.size;assert.equal((await upload(png)).status,500);failInsert=false;assert.equal(objects.size,count);
});
test('draft cover bytes and draft articles stay private',async()=>{
 const asset=assets[0];posts.push({id:'post',slug:'image-guide',status:'draft',cover_image_id:asset.id,title:'Image guide',body:'Article body',tags:['images'],published_at:'2026-09-29T00:00:00Z',updated_at:'2026-09-29T00:00:00Z'});
 assert.equal((await fetch(base+`/api/public/post-images/${asset.id}`)).status,404);
 assert.equal((await fetch(base+'/api/public/articles/image-guide')).status,404);
 posts[0].status='published';assert.equal((await fetch(base+`/api/public/post-images/${asset.id}`)).status,200);
 const response=await fetch(base+'/api/public/articles/image-guide',{headers:{'X-Frontend-Origin':'https://nevco.online'}});assert.equal(response.status,200);assert.equal(response.headers.get('x-robots-tag'),null);const html=await response.text();assert.match(html,/rel="canonical" href="https:\/\/nevco\.online\/journal\/image-guide"/);assert.match(html,/og:image/);assert.match(html,/Article body/);
 const sitemap=await fetch(base+'/api/public/sitemap.xml',{headers:{'X-Forwarded-Host':'site-two.example','X-Forwarded-Proto':'https'}});assert.match(await sitemap.text(),/https:\/\/site-two\.example\/journal\/image-guide/);
});
test('article SEO, body, alt text, tags and JSON-LD are escaped',()=>{
 const html=renderArticle({slug:'safe',title:'<script>bad()</script>',body:'<img src=x onerror=bad()>',seo_title:'A better title',seo_description:'Search description',tags:['<script>'],cover_alt:'" onerror="bad()',cover_image_id:'id'},'https://site.example');
 assert.match(html,/<title>A better title/);assert.match(html,/content="Search description"/);assert.ok(!html.includes('<script>bad()'));assert.ok(!html.includes('<img src=x'));assert.match(html,/\\u003cscript/);
});
test('article renderer creates a complete guide layout with safe headings and lists',()=>{
 const html=renderArticle({slug:'formatted-guide',title:'A useful guide',excerpt:'A short introduction.',body:'# Keep filenames useful\n\nA descriptive filename helps the team.\n\n## Final checks\n\n- Keep the source\n- Export a copy',tags:['workflow'],published_at:'2026-09-29T00:00:00Z'},'https://site.example');
 assert.match(html,/class="main-nav"/);assert.match(html,/<h2 id="keep-filenames-useful">Keep filenames useful<\/h2>/);assert.match(html,/<h3 id="final-checks">Final checks<\/h3>/);assert.match(html,/<ul><li>Keep the source<\/li><li>Export a copy<\/li><\/ul>/);assert.match(html,/Back to all blogs/);assert.match(html,/class="footer-grid"/);assert.match(html,/privacy-policy\.html/);assert.doesNotMatch(html,/id="privacy-settings"/);assert.doesNotMatch(html,/id="consent-banner"/);
});
test('published covers preserve SVG, PNG, JPEG and WebP bytes and MIME types',async()=>{
 const samples=[
  ['svg','image/svg+xml',Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>')],
  ['png','image/png',png],
  ['jpg','image/jpeg',await sharp(png).jpeg().toBuffer()],
  ['webp','image/webp',await sharp(png).webp().toBuffer()]
 ];
 for(const [extension,mime,bytes] of samples){
  const id=require('node:crypto').randomUUID(),path=`fixtures/${id}.${extension}`;
  assets.push({id,storage_path:path,mime_type:mime});objects.set(path,bytes);
  posts.push({id,slug:id,status:'published',cover_image_id:id});
  const response=await fetch(base+`/api/public/post-images/${id}`);
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type').split(';')[0],mime);
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
  if(extension==='svg')assert.match(response.headers.get('content-security-policy'),/sandbox/);
 }
});
test('legacy image metadata falls back to the stored file extension',async()=>{
 const id=require('node:crypto').randomUUID(),path=`fixtures/${id}.png`;
 assets.push({id,storage_path:path,mime_type:null});objects.set(path,png);
 posts.push({id,slug:id,status:'published',cover_image_id:id});
 const response=await fetch(base+`/api/public/post-images/${id}`);
 assert.equal(response.headers.get('content-type'),'image/png');
 assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
});
test('published guide pagination includes undated posts and never exposes drafts',async()=>{
 const start=posts.length;
 for(let i=0;i<105;i++)posts.push({id:`page-${i}`,slug:`page-${i}`,status:i===104?'draft':'published',published_at:null});
 const response=await fetch(base+`/api/public/posts?limit=12&offset=${start+96}`);
 assert.equal(response.status,200);
 const page=await response.json();
 assert.equal(page.length,8);assert.equal(page[0].slug,'page-96');assert.equal(page[7].slug,'page-103');
 for(const query of ['limit=101','limit=0','offset=-1','offset=1.5','limit=abc']){
  assert.equal((await fetch(base+'/api/public/posts?'+query)).status,400);
 }
});
test('admin post pagination returns a page, total count and rejects invalid ranges',async()=>{
 const response=await fetch(base+'/api/posts?limit=10&offset=10',{headers:{Authorization:'Bearer owner'}});
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.items.length,10);assert.equal(data.total,posts.length);assert.equal(data.limit,10);assert.equal(data.offset,10);
 for(const query of ['limit=0','limit=101','offset=-1','offset=1.5']){
  assert.equal((await fetch(base+'/api/posts?'+query,{headers:{Authorization:'Bearer owner'}})).status,400);
 }
});
