// Only shipped synthetic fixtures and recorded tool screenshots are public.
const path = require('node:path');
const router = require('express').Router();
const groups = new Set(['url-encoding', 'sha256']);
const files = new Set(['cases.json', 'results.json', 'tool-run.png']);
router.get('/experiment-assets/:experiment/:file', (req, res) => {
  const { experiment, file } = req.params;
  if (!groups.has(experiment) || !files.has(file)) return res.sendStatus(404);
  res.set('Cache-Control', 'public, max-age=3600');
  res.sendFile(path.resolve(__dirname, '../../assets/experiments', experiment, file));
});
module.exports = router;
