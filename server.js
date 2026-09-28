// Vercel detects this Express export. Only local execution opens a listener.
const express = require('express');
const app = express();
app.disable('x-powered-by');
app.use(require('./backend/src/app'));
if (require.main === module) {
  const { port } = require('./backend/src/config/env');
  app.listen(port, () => console.log(`Anvil API: http://localhost:${port}/api/health`));
}
module.exports = app;
