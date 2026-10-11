// Whether a project runs as a product: verify.mjs prints its ready Proof line
// by this one rule. A
// package.json that names no `bin` and no `scripts.start` is a library, whose
// tests are the one way to run it.

import fs from 'node:fs';
import path from 'node:path';

function readManifest(directory) {
  try {
    return JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  } catch {
    return undefined;
  }
}

// The entry points directory's package.json names: the `bin` path when `bin`
// is a string, else each bin name, then `npm start` for a `scripts.start`;
// null when the package.json is missing or unreadable.
export function packageEntryPoints(directory) {
  const manifest = readManifest(directory);
  if (manifest === undefined) return null;
  const bin = manifest?.bin;
  const bins = bin && typeof bin === 'object' ? Object.keys(bin) : bin ? [String(bin)] : [];
  return typeof manifest?.scripts?.start === 'string' ? [...bins, 'npm start'] : bins;
}

const START_FORMS = ['npm start', 'npm run start', 'pnpm start', 'pnpm run start', 'yarn start', 'yarn run start'];

// What a command may contain to run the product: each bin name and bin file
// path (a leading `./` dropped), plus the start forms when `scripts.start`
// exists; [] for a library or a missing or unreadable package.json.
export function packageRunTerms(directory) {
  const manifest = readManifest(directory);
  const bin = manifest?.bin;
  const bins = bin && typeof bin === 'object' ? Object.entries(bin).flat() : bin ? [String(bin)] : [];
  const terms = bins.map((term) => String(term).replace(/^\.\//, ''));
  return typeof manifest?.scripts?.start === 'string' ? [...terms, ...START_FORMS] : terms;
}

// False only when directory's package.json parses and names no `bin` and no
// `scripts.start`; a missing or unreadable one counts as an entry point.
export function packageHasEntryPoint(directory) {
  const entryPoints = packageEntryPoints(directory);
  return entryPoints === null || entryPoints.length > 0;
}
