import fs from 'node:fs';
import path from 'node:path';

function readManifest(directory) {
  try {
    return JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  } catch {
    return undefined;
  }
}

export function packageEntryPoints(directory) {
  const manifest = readManifest(directory);
  if (manifest === undefined) return null;
  const bin = manifest?.bin;
  const bins = bin && typeof bin === 'object' ? Object.keys(bin) : bin ? [String(bin)] : [];
  return typeof manifest?.scripts?.start === 'string' ? [...bins, 'npm start'] : bins;
}

const START_FORMS = ['npm start', 'npm run start', 'pnpm start', 'pnpm run start', 'yarn start', 'yarn run start'];

export function packageRunTerms(directory) {
  const manifest = readManifest(directory);
  const bin = manifest?.bin;
  const bins = bin && typeof bin === 'object' ? Object.entries(bin).flat() : bin ? [String(bin)] : [];
  const terms = bins.map((term) => String(term).replace(/^\.\//, ''));
  return typeof manifest?.scripts?.start === 'string' ? [...terms, ...START_FORMS] : terms;
}

export function packageHasEntryPoint(directory) {
  const entryPoints = packageEntryPoints(directory);
  return entryPoints === null || entryPoints.length > 0;
}
