import {db,cors,json,failure} from '../_shared/auth.ts';
// Public read-only endpoint; never returns draft posts or private author records.
Deno.serve(async req=>{let headers:Record<string,string>={};try{
 headers=cors(req);if(req.method==='OPTIONS')return new Response(null,{status:204,headers});if(req.method!=='GET')return json({error:'Method not allowed'},405,headers);
 const slug=new URL(req.url).searchParams.get('slug');
 let query=db().from('posts').select('slug,title,excerpt,body,published_at,category_slug,seo_title,seo_description').eq('status','published');
 if(slug){const {data,error}=await query.eq('slug',slug).maybeSingle();if(error)throw error;return json(data||{error:'Article not found'},data?200:404,headers);}
 const {data,error}=await query.order('published_at',{ascending:false}).limit(100);if(error)throw error;return json(data,200,headers);
}catch(error){return failure(error,headers);}});
