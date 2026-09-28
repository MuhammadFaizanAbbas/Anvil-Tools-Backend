const sharp = require('sharp');
async function prepareImage(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 3 * 1024 * 1024) throw Object.assign(new Error('Choose a JPEG, PNG, or WebP image under 3 MB.'), { status: 400 });
  try {
    const source = sharp(bytes, { limitInputPixels: 24000000, failOn: 'warning' });
    const metadata = await source.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1) throw new Error('Unsupported image');
    return await source.rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
  } catch (_) { throw Object.assign(new Error('This image cannot be processed. Use a non-animated JPEG, PNG, or WebP up to 24 megapixels.'), { status: 400 }); }
}
module.exports = { prepareImage };
