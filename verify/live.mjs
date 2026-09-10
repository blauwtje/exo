// Live evaluation is explicit and expensive: it calls a real model. The verifier
// only dispatches, forwards the switches, and turns the runner's exit code into one
// result. Exit 2 means the matrix could not be established, which is UNRUN unless
// the caller asked for --require-live.

import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const FORWARDED_SWITCHES = ['dry-run', 'baseline', 'require-live'];
const FORWARDED_VALUES = ['effort', 'case-id', 'output-path'];

function runnerArguments(options) {
  const forwarded = [];
  for (const name of FORWARDED_SWITCHES) {
    if (options[name]) forwarded.push(`--${name}`);
  }
  for (const name of FORWARDED_VALUES) {
    if (options[name] !== undefined) forwarded.push(`--${name}`, options[name]);
  }
  return forwarded;
}

export function runLiveEvaluation(report, repository, options) {
  const runner = path.join(repository.root, 'evals', 'run-live.mjs');
  const forwarded = runnerArguments(options);
  const run = spawnSync(process.execPath, [runner, ...forwarded], { stdio: 'inherit' });

  if (run.error) {
    report.result('FAIL', 'live evaluation', `the runner could not start: ${run.error.message}`);
    return;
  }
  if (run.status === 0) {
    report.result('PASS', 'live evaluation', `evals/run-live.mjs ${forwarded.join(' ')} reported no failing case`);
    return;
  }
  if (run.status === 2) {
    report.result('UNRUN', 'live evaluation', 'the live matrix could not be established; the runner printed the gate that refused it');
    return;
  }
  report.result('FAIL', 'live evaluation', `evals/run-live.mjs exited ${run.status}; the runner printed the failing cases`);
}
