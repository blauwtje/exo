import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { onPath } from '#on-path';
import { PLUGIN_FILE } from './plugin-version.mjs';

const NAME = 'plugin validate';

function findings(result, root) {
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

function validateRun(env, root) {
  const run = spawnSync('claude', ['plugin', 'validate', '--strict', '--json', root], { encoding: 'utf8', env });
  if (run.error || ![0, 1].includes(run.status)) {
    return { unrun: `claude plugin validate did not run: ${run.error?.message ?? `exit ${run.status}`}` };
  }
  try {
    return { status: run.status, result: JSON.parse(run.stdout) };
  } catch {
    return { unrun: `claude plugin validate printed no JSON (exit ${run.status})` };
  }
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
  const run = validateRun(env, repository.root);
  if (run.unrun) {
    report.result('UNRUN', NAME, run.unrun);
    return;
  }
  if (run.status === 0) {
    report.result('PASS', NAME, 'claude plugin validate --strict finds no error or warning');
    return;
  }
  const found = findings(run.result, repository.root);
  for (const detail of found.length > 0 ? found : ['claude plugin validate exits 1 without a listed finding']) {
    report.result('FAIL', NAME, detail);
  }
}
