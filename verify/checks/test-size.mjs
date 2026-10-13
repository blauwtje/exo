// Each tests/*.mjs file stays within TEST_FILE_CAP bytes, so a large test file
// is split before it lands.

import fs from 'node:fs';
import { TEST_FILE_CAP } from '../budgets.mjs';

export function checkTestSize(report, repository) {
  const directory = repository.join('tests');
  const files = fs.existsSync(directory) ? fs.readdirSync(directory).filter((name) => name.endsWith('.mjs')) : [];
  const over = files
    .map((name) => ({ name: `tests/${name}`, bytes: fs.statSync(repository.join('tests', name)).size }))
    .filter((file) => file.bytes > TEST_FILE_CAP.bytes);
  if (over.length > 0) {
    const list = over.map((file) => `${file.name} (${file.bytes} bytes)`).join(', ');
    report.result('FAIL', 'test file size', `over the ${TEST_FILE_CAP.bytes}-byte cap: ${list}; split each file`);
    return;
  }
  report.result('PASS', 'test file size', `${files.length} test files within the ${TEST_FILE_CAP.bytes}-byte cap`);
}
