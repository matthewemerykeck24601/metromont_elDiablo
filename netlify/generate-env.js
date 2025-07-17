const fs = require('fs');
const path = require('path');

const clientId = process.env.ACC_CLIENT_ID || '';
const outputPath = path.join(__dirname, '..', 'scripts', 'env.js');
const content = `window.ACC_CLIENT_ID = ${JSON.stringify(clientId)};`;

fs.writeFileSync(outputPath, content);
console.log('Injected ACC_CLIENT_ID into ' + outputPath);
