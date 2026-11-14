import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { onPath } from '#on-path';

const NAME = 'plugin validate';
const PLUGIN_FILE = '.claude-plugin/plugin.json';

export function findings(result, root) {
  const found = [];
  for (const entry of [result.manifest, ...(result.contents ?? [])]) {
    if (!entry) continue;
    const file = path.relative(root, entry.file ?? root) || '.';
    for (const item of [...(entry.errors ?? []), ...(entry.warnings ?? [])]) {
      found.push(`${file}: ${typeof item === 'string' ? item : (item.message ?? JSON.stringify(item))}`);
    }
  }
  return found;
}

export function checkPluginValidate(report, repository, { env = process.env } = {}) {
  if (!fs.existsSync(repository.join(PLUGIN_FILE))) {
    report.result('UNRUN', NAME, `the repository root carries no ${PLUGIN_FILE}`);
    return;
  }
  if (!onPath('claude', env)) {
    report.note(NAME, 'skipped: claude is not on PATH');
    return;
  }
  const run = spawnSync('claude', ['plugin', 'validate', '--strict', '--json', repository.root], { encoding: 'utf8', env });
  if (run.error || ![0, 1].includes(run.status)) {
    report.result('UNRUN', NAME, `claude plugin validate did not run: ${run.error?.message ?? `exit ${run.status}`}`);
    return;
  }
  let result;
  try {
    result = JSON.parse(run.stdout);
  } catch {
    report.result('UNRUN', NAME, `claude plugin validate printed no JSON (exit ${run.status})`);
    return;
  }
  const found = findings(result, repository.root);
  if (run.status === 0) {
    report.result('PASS', NAME, 'claude plugin validate --strict finds no error or warning');
    return;
  }
  for (const detail of found.length > 0 ? found : ['claude plugin validate exits 1 without a listed finding']) {
    report.result('FAIL', NAME, detail);
  }
}
