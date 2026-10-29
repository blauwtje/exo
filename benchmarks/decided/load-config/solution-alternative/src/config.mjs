import fs from 'node:fs';

export function loadConfig(file) {
  return { port: 3000, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
}
