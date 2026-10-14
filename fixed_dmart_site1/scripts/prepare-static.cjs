'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
const publicEntries = ['index.html', 'assets', 'css', 'images', 'js'];

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const entry of publicEntries) {
  fs.cpSync(path.join(root, entry), path.join(output, entry), { recursive: true });
}

console.log('Static site prepared in dist.');
