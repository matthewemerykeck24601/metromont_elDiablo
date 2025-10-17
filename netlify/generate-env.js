import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const clientId = process.env.ACC_CLIENT_ID || '';
const outputPath = path.join(__dirname, '..', 'scripts', 'env.js');
const content = `window.ACC_CLIENT_ID = ${JSON.stringify(clientId)};`;

fs.writeFileSync(outputPath, content);
console.log('Injected ACC_CLIENT_ID into ' + outputPath);
