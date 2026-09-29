const { allowedOrigins } = require('../config/env');
module.exports = (req, res, next) => {
  const origin = req.get('Origin');
  res.vary('Origin');
  if (origin && !allowedOrigins.includes(origin)) return res.status(403).json({ error: 'Origin is not allowed' });
  if (origin) res.set('Access-Control-Allow-Origin', origin);
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.set('Access-Control-Expose-Headers', 'Retry-After,X-Total-Count');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
};
