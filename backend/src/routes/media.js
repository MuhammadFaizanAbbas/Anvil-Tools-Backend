const router = require('express').Router();
const express = require('express');
const { randomUUID } = require('node:crypto');
const { supabaseAdmin: db } = require('../lib/supabase');
const { requireAdmin } = require('../middleware/auth');
const run = require('../lib/async-handler');
const { prepareImage } = require('../lib/images');
const unwrap = result => { if (result.error) throw result.error; return result.data; };
const bucket = () => db.storage.from('editorial-media');
router.use(requireAdmin);
router.get('/', run(async (req, res) => {
  const page = Math.max(0, Math.min(10000, parseInt(req.query.page, 10) || 0));
  const result = await db.from('media_assets').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(page * 24, page * 24 + 23);
  const items = unwrap(result);
  res.json({ items: await Promise.all(items.map(async item => ({ ...item, url: unwrap(await bucket().createSignedUrl(item.storage_path, 3600)).signedUrl }))), total: result.count, page });
}));
router.get('/:id', run(async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: 'Invalid image ID' });
  const item = unwrap(await db.from('media_assets').select('*').eq('id', req.params.id).maybeSingle());
  if (!item) return res.status(404).json({ error: 'Image not found' });
  res.json({ ...item, url: unwrap(await bucket().createSignedUrl(item.storage_path, 3600)).signedUrl });
}));
router.post('/', express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '3mb' }), run(async (req, res) => {
  const image = await prepareImage(req.body);
  const id = randomUUID(), storagePath = `${req.user.id}/${id}.webp`;
  const filename = typeof req.query.name === 'string' ? req.query.name.slice(0, 200).replace(/[\r\n\x00]/g, '') : 'Image';
  unwrap(await bucket().upload(storagePath, image.data, { contentType: 'image/webp', upsert: false }));
  let asset;
  try {
    asset = unwrap(await db.from('media_assets').insert({ id, storage_path: storagePath, file_name: filename, mime_type: 'image/webp', width: image.info.width, height: image.info.height, uploaded_by: req.user.id }).select().single());
  } catch (error) { await bucket().remove([storagePath]); throw error; }
  const signed = await bucket().createSignedUrl(storagePath, 3600);
  res.status(201).json({ ...asset, url: signed.data?.signedUrl || null });
}));
module.exports = router;
