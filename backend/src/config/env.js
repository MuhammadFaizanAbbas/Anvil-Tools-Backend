const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
module.exports = {
  port: Number(process.env.PORT || 3000),
  adminEmails: (process.env.ADMIN_EMAILS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean),
};
