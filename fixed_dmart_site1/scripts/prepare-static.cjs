'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
const publicPaths = ['index.html', 'css', 'js', 'images', 'assets'];

for (const publicPath of publicPaths) {
  fs.accessSync(path.join(root, publicPath));
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const publicPath of publicPaths) {
  fs.cpSync(path.join(root, publicPath), path.join(output, publicPath), { recursive: true });
}

console.log('Static site prepared in dist.');
