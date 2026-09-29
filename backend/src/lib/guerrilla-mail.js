const API = 'https://api.guerrillamail.com/ajax.php';
async function call(fn, params = {}, session, client = {}) {
 const query = new URLSearchParams({ f: fn, lang: 'en', ...params, ...(session?.sid ? { sid_token: session.sid } : {}), ...(client.ip ? { ip: client.ip } : {}), ...(client.agent ? { agent: client.agent.slice(0,160) } : {}) });
 let response, data;
 try {
  response = await fetch(`${API}?${query}`, { signal: AbortSignal.timeout(15000), headers: { Accept:'application/json', ...(session?.cookie ? { Cookie:`PHPSESSID=${session.cookie}` } : {}) } });
  if(!response.ok)throw Error('Provider rejected request');
  data=await response.json();
  if(data?.error || (fn==='get_email_list' && !Array.isArray(data?.list)))throw Error('Provider rejected request');
 }catch(_){throw Object.assign(new Error('Temporary email provider is unavailable. Please try again shortly.'),{status:503,code:'MAIL_PROVIDER_UNAVAILABLE'});}
 const cookie=response.headers.get('set-cookie')?.match(/PHPSESSID=([^;\s,]+)/)?.[1];
 return { data, session: {sid:data?.sid_token||session?.sid,cookie:cookie||session?.cookie} };
}
module.exports={call};
