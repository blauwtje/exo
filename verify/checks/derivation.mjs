// Every name in a shipped file is a name exo owns. The list is held
// base64-encoded and decoded here, because a plaintext list would itself be the
// text this check forbids and `git grep -i` for those names has to come back
// empty. A third-party notice file at the root fails too: PolyForm
// Noncommercial 1.0.0 is the whole licence, and a notice file would say
// otherwise.

import fs from 'node:fs';
import path from 'node:path';
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
  'c3VwZXJwb3dlcnM='
];

// Only a name the plugin ships is scanned. `docs/` is git-ignored apart from
// `docs/skills/`, so the private reading these names come from is out of reach.
const ROOT_TEXT_FILES = ['README.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'ABOUT.md'];
const SHIPPED_DOCS = 'docs/skills';

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
  const files = new Set([
    ...repository.processFiles(),
    ...repository.promptFiles(),
    ...repository.agentFiles(),
    ...repository.everySkillFile()
  ]);
  for (const relative of ROOT_TEXT_FILES) {
    const file = repository.join(relative);
    if (fs.existsSync(file)) files.add(file);
  }
  // The one part of docs/ that ships, absent from the verifier's own fixture.
  const shippedDocs = repository.join(SHIPPED_DOCS);
  if (fs.existsSync(shippedDocs)) {
    for (const entry of fs.readdirSync(shippedDocs)) {
      if (entry.endsWith('.md')) files.add(path.join(shippedDocs, entry));
    }
  }
  for (const file of files) {
    const lowered = repository.text(file).toLowerCase();
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
    `no derived name and no third-party notice reaches a shipped file, across ${files.size} files`,
    errors.join('; ')
  );
}
