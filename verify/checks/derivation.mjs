// Every name in a tracked text file is a name exo owns: shipped files, the
// changelog, benchmarks, tests and the verifier alike. The list is held
// base64-encoded and decoded here, because a plaintext list would itself be the
// text this check forbids and `git grep -i` for those names has to come back
// empty; this file is the one tracked file the scan skips, since it holds the
// list. A third-party notice file at the root fails too: the MIT licence in
// LICENSE is the whole licence, and a notice file would say otherwise.

import fs from 'node:fs';
import { Buffer } from 'node:buffer';

const ENCODED_NAMES = [
  'cG9jb2Nr',
  'bWF0dHBvY29jaw==',
  'bWF0dC1wb2NvY2s=',
  'Z3JpbGxpbmc=',
  'Z3JpbGwtbWU=',
  'Z3JpbGwtd2l0aC1kb2Nz',
  'dG8tc3BlYw==',
  'dG8tdGlja2V0cw==',
  'YXNrLW1hdHQ=',
  'd2F5ZmluZGVy',
  'd2FpdC13aGF0',
  'dG8tcXVlc3Rpb25uYWlyZQ==',
  'bG9vcC1tZQ==',
  'c3VwZXJwb3dlcnM=',
  'cHN0YWNr',
  'cG90ZXRv',
  'bGF1cmVuIHRhbg==',
  'bWF0dCBwb2NvY2s=',
  'Z29kbW9kZQ==',
  'Ym1hZA==',
  'Ymxhc3QtcmFkaXVz',
  'aGlsbGNsaW1i',
  'dmlzdWFsLXBhcml0eQ==',
  'dGVjaG5pY2FsLXdyaXRpbmc=',
  'YmFieXNpdA=='
];

// Only tracked files are scanned: `docs/` is git-ignored apart from
// `docs/skills/`, so the private reading these names come from stays out of reach.
const LIST_FILE = 'verify/checks/derivation.mjs';

const NOTICE_FILES = [
  'NOTICE', 'NOTICE.md', 'NOTICE.txt',
  'THIRD-PARTY.md', 'THIRD_PARTY.md',
  'THIRD-PARTY-NOTICES.md', 'THIRD_PARTY_NOTICES.md'
];

function derivedNames() {
  return ENCODED_NAMES.map((encoded) => Buffer.from(encoded, 'base64').toString('utf8'));
}

export function checkDerivation(report, repository) {
  const errors = [];
  const names = derivedNames();
  let scanned = 0;
  for (const file of repository.trackedFiles()) {
    if (repository.relative(file) === LIST_FILE) continue;
    const text = repository.text(file);
    // A NUL byte marks a binary file, which holds no prose to scan.
    if (text.includes('\0')) continue;
    scanned += 1;
    const lowered = text.toLowerCase();
    for (const name of names) {
      if (lowered.includes(name)) errors.push(`${repository.relative(file)}: derived name '${name}'`);
    }
  }
  for (const notice of NOTICE_FILES) {
    if (fs.existsSync(repository.join(notice))) {
      errors.push(`${notice} exists, and LICENSE is the only licence file exo ships`);
    }
  }
  report.assert(
    errors.length === 0,
    'derivation',
    `no derived name and no third-party notice reaches a tracked file, across ${scanned} files`,
    errors.join('; ')
  );
}
