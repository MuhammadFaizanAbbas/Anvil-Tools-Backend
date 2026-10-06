// Public article images are authorized by the API; the storage bucket itself
// must never expose drafts. Use Storage's API rather than editing its metadata.
function privateBucketGuard(storage) {
  let ready;
  return async function ensurePrivateMedia() {
    if (!ready) {
      ready = (async () => {
        const result = await storage.updateBucket('editorial-media', { public: false });
        if (result.error) throw new Error('Editorial storage privacy could not be confirmed.');
      })();
    }
    try { await ready; }
    catch (error) { ready = null; throw error; }
  };
}
const { supabaseAdmin } = require('./supabase');
module.exports = { privateBucketGuard, ensurePrivateMedia: privateBucketGuard(supabaseAdmin?.storage) };
