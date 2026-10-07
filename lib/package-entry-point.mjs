// Whether a project runs as a product: verify.mjs prints its ready Proof line
// by this one rule. A
// package.json that names no `bin` and no `scripts.start` is a library, whose
// tests are the one way to run it.

import fs from 'node:fs';
import path from 'node:path';

// The entry points directory's package.json names: the `bin` path when `bin`
// is a string, else each bin name, then `npm start` for a `scripts.start`;
// null when the package.json is missing or unreadable.
export function packageEntryPoints(directory) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
  const bin = manifest?.bin;
  const bins = bin && typeof bin === 'object' ? Object.keys(bin) : bin ? [String(bin)] : [];
  return typeof manifest?.scripts?.start === 'string' ? [...bins, 'npm start'] : bins;
}

// False only when directory's package.json parses and names no `bin` and no
// `scripts.start`; a missing or unreadable one counts as an entry point.
export function packageHasEntryPoint(directory) {
  const entryPoints = packageEntryPoints(directory);
  return entryPoints === null || entryPoints.length > 0;
}
