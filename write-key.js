// write-key.js
const fs = require('fs');
fs.writeFileSync(
  'serviceAccountKey.json',
  process.env.SERVICE_ACCOUNT_KEY.replace(/\\n/g, '\n')
);
