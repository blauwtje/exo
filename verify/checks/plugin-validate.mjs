import fs from 'node:fs';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { onPath } from '#on-path';

const NAME = 'plugin validate';
const PLUGIN_FILE = '.claude-plugin/plugin.json';
const SHOWN_LINES = 3;

// why: claude plugin validate prints each finding as a `❯` line under a `✘` (error), `⚠` (warning) or `Validating` heading.
export function errorLines(output) {
  const errors = [];
  let heading = '';
  for (const line of output.split('\n').map((entry) => entry.trim())) {
    if (line === '') continue;
    if (!line.startsWith('❯')) heading = line;
    else if (heading.startsWith('✘')) errors.push(line.slice(1).trim());
  }
  return errors;
}

function failureDetail(run) {
  if (run.error) return `claude plugin validate did not run: ${run.error.message}`;
  const output = `${run.stdout}\n${run.stderr}`;
  const errors = errorLines(output);
  const shown = errors.length > 0 ? errors : output.split('\n').map((line) => line.trim()).filter((line) => line !== '');
  const more = shown.length > SHOWN_LINES ? `; ${shown.length - SHOWN_LINES} more` : '';
  return `claude plugin validate exits ${run.status}: ${shown.slice(0, SHOWN_LINES).join('; ')}${more}`;
}

export function checkPluginValidate(report, repository, { env = process.env } = {}) {
  if (!fs.existsSync(repository.join(PLUGIN_FILE))) {
    report.result('UNRUN', NAME, `the repository root carries no ${PLUGIN_FILE}`);
    return;
  }
  // why: CI installs no Claude Code; an INFO line outside the tally keeps its run at UNRUN=0.
  if (!onPath('claude', env)) {
    report.note(NAME, 'skipped: claude is not on PATH');
    return;
  }
  const run = spawnSync('claude', ['plugin', 'validate', repository.root], { encoding: 'utf8', env });
  if (run.status !== 0) {
    report.result('FAIL', NAME, failureDetail(run));
    return;
  }
  report.result('PASS', NAME, 'claude plugin validate finds no error the engine refuses at load');
}
