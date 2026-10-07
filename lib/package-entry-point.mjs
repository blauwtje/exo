// Whether a project runs as a product: proof-check.mjs blocks a test-runner Proof
// and verify.mjs prints its ready Proof line by this one rule. A package.json that
// names no `bin` and no `scripts.start` is a library, whose tests are the one way to run it.

import fs from 'node:fs';
import path from 'node:path';

// False only when directory's package.json parses and names no `bin` and no
// `scripts.start`; a missing or unreadable one counts as an entry point.
export function packageHasEntryPoint(directory) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  } catch {
    return true;
  }
  return Boolean(manifest?.bin) || typeof manifest?.scripts?.start === 'string';
}
