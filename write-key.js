const fs = require('fs');
if (!process.env.SERVICE_ACCOUNT_KEY) {
  throw new Error('SERVICE_ACCOUNT_KEY environment variable is not set!');
}
fs.writeFileSync(
  'serviceAccountKey.json',
  process.env.SERVICE_ACCOUNT_KEY.replace(/\\n/g, '\n')
);
