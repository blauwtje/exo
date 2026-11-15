import fs from 'node:fs';
import path from 'node:path';
import { createRepository } from '../verify/repository.mjs';
import { tempDir } from './harness.mjs';

export function checkOutcome(check, repository) {
  const results = [];
  const report = { assert: (ok, name, details) => results.push({ ok, detail: ok ? details.pass : details.fail }) };
  check(report, repository);
  return results[0];
}

export function recorder() {
  const results = [];
  const result = (...entry) => results.push({ status: entry[0], name: entry[1], detail: entry[2] });
  return {
    results,
    result,
    note: () => {},
    assert: (ok, name, details) => result(ok ? 'PASS' : 'FAIL', name, ok ? details.pass : details.fail)
  };
}

export function tree(files) {
  const root = tempDir('exo-check-red-');
  for (const [relativePath, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    fs.writeFileSync(path.join(root, relativePath), text);
  }
  return root;
}

export function failures(check, root, options) {
  const report = recorder();
  check(report, createRepository(root), options);
  return report.results.filter((entry) => entry.status === 'FAIL');
}
