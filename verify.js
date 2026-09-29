// Offline syntax checks for the standalone backend repository.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function files(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const name = path.join(directory, entry.name);
    return entry.isDirectory() ? files(name) : [name];
  });
}

const sources = ['server.js', ...files('backend'), ...files('scripts')].filter(file => file.endsWith('.js'));
for (const file of sources) execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
console.log(`Verified syntax in ${sources.length} backend JavaScript files.`);
