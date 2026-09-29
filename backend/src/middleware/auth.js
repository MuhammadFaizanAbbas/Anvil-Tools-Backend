const { supabaseAdmin } = require('../lib/supabase');
const { adminEmails } = require('../config/env');
const asyncHandler = require('../lib/async-handler');
function isOwner(user) { return Boolean(user?.email && adminEmails.includes(user.email.toLowerCase())); }
async function accessFor(user) {
  if (user?.app_metadata?.password_setup_required) return { role: 'member', is_active: false };
  if (isOwner(user) && user.email_confirmed_at) return { role: 'owner', is_active: true };
  if (!user?.id || !supabaseAdmin) return null;
  const {data,error} = await supabaseAdmin.from('profiles').select('role,is_active').eq('id',user.id).maybeSingle();
  if (error) throw error;
  return data;
}
async function isAdmin(user) { const access = await accessFor(user); return !!(access?.is_active && ['admin','owner'].includes(access.role)); }
const requireAdmin = asyncHandler(async (req,res,next) => {
  const token=(req.get('Authorization')||'').match(/^Bearer (\S+)$/)?.[1];
  if(!token) return res.status(401).json({error:'Missing admin token'});
  if(!supabaseAdmin) return res.status(503).json({error:'Supabase is not configured'});
  const {data,error}=await supabaseAdmin.auth.getUser(token);
  if(error || !data.user) return res.status(401).json({error:'Invalid or expired session'});
  const access=await accessFor(data.user);
  if(!access?.is_active || !['admin','owner'].includes(access.role)) return res.status(403).json({error:'Admin access required'});
  req.user=data.user;req.accessToken=token;req.role=access.role;next();
});
module.exports={requireAdmin,isAdmin,isOwner,accessFor};
