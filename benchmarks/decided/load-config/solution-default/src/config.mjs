import fs from 'node:fs';

export function loadConfig(file) {
  const defaults = { port: 3000 };
  if (!fs.existsSync(file)) return defaults;
  return { ...defaults, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
}
