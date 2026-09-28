const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
module.exports = {
  port: Number(process.env.PORT || 3000),
  allowedOrigins: (process.env.FRONTEND_ORIGINS || 'http://localhost:8080,http://127.0.0.1:8080')
    .split(',').map(value => value.trim()).filter(Boolean),
  adminEmails: (process.env.ADMIN_EMAILS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean),
};
