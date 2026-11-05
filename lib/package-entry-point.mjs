import path from 'node:path';
import { readJsonOrNull } from '#basics';

const readManifest = (directory) => readJsonOrNull(path.join(directory, 'package.json'));

export function packageEntryPoints(directory) {
  const manifest = readManifest(directory);
  if (manifest === null) return null;
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
