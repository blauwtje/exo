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

const LIST_FILE = 'verify/checks/derivation.mjs';

const NOTICE_FILES = [
  'NOTICE', 'NOTICE.md', 'NOTICE.txt',
  'THIRD-PARTY.md', 'THIRD_PARTY.md',
  'THIRD-PARTY-NOTICES.md', 'THIRD_PARTY_NOTICES.md'
];

export function derivedNames() {
  return ENCODED_NAMES.map((encoded) => Buffer.from(encoded, 'base64').toString('utf8'));
}

function scannedFiles(repository) {
  return repository.trackedFiles()
    .filter((file) => repository.relative(file) !== LIST_FILE)
    .map((file) => ({ file, text: repository.text(file) }))
    .filter(({ text }) => !text.includes('\0'));
}

function derivedNameErrors(files, repository) {
  const names = derivedNames();
  return files.flatMap(({ file, text }) => {
    const lowered = text.toLowerCase();
    return names
      .filter((name) => lowered.includes(name))
      .map((name) => `${repository.relative(file)}: derived name '${name}'`);
  });
}

export function checkDerivation(report, repository) {
  const files = scannedFiles(repository);
  const scanned = files.length;
  const noticeErrors = NOTICE_FILES
    .filter((notice) => fs.existsSync(repository.join(notice)))
    .map((notice) => `${notice} exists, and LICENSE is the only licence file exo ships`);
  const errors = [...derivedNameErrors(files, repository), ...noticeErrors];
  report.assert(
    errors.length === 0,
    'derivation',
    { pass: `no derived name and no third-party notice reaches a tracked file, across ${scanned} files`, fail: errors.join('; ') }
  );
}
