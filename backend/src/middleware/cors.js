module.exports = (req, res, next) => {
  const origin = req.get('Origin');
  if (origin) res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Frontend-Origin');
  res.set('Access-Control-Expose-Headers', 'Retry-After,X-Total-Count');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
};
