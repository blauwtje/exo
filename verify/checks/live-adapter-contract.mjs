// Port of Test-LiveAdapterContract (verify.ps1:1234-1297): the live runner still
// contains every fragment that makes it fail closed: sandbox denial, isolated
// config roots, observed-outcome grading, render evidence. The fragment list is
// the contract. Codex and the cross-harness comparison have no counterpart once
// the runner speaks only to Claude, so their fragments are dropped rather than
// translated. The PowerShell check reported twice, so this module still reports
// twice under the same two names and pass details.

import { spawnSync } from 'node:child_process';
import process from 'node:process';

// Each entry names a behaviour the runner cannot lose without silently grading a
// run it never isolated. Losing one is a contract change, not a refactor.
const REQUIRED_FRAGMENTS = [
  'claude OS sandbox is unavailable on native Windows',
  'CLAUDE_CONFIG_DIR: claudeConfigRoot',
  'required reference has no successful observed read result',
  'reported verification command is not a case proof command',
  'observedSuccessfulProofResults',
  'observed repository changes have no file-change event boundary',
  'requiredChangedPaths',
  'requiredAnyChangedPaths',
  'minQuestionsBeforeCode',
  'required breaker did not trigger and stop',
  'resultEventLine',
  "'baseline.json'",
  'outcomeOnly',
  'EVAL_RENDER:',
  'EVAL_RENDER_CAPABILITY',
  'EVAL_RENDER_CONTRACT',
  '.eval-render',
  'contract.json',
  'checkRenderEvidence',
  'EVAL_BROWSER',
  'renderContract',
  'motion_evidence',
  'BLOCKED',
  'initialSourceHash',
  'finalSourceHash',
  'rendererHash',
  'safeFixtureFile',
  'EVAL_BOUNDARY:'
];

// The runner is a thin entry point over evals/live/*.mjs; the fragments above live
// wherever the port put them, so the contract reads the whole adapter, not just
// its entry file.
function adapterSource(repository) {
  const runner = repository.join('evals', 'run-live.mjs');
  const liveModules = repository.walk(repository.join('evals', 'live'), (file) => file.endsWith('.mjs'));
  return [runner, ...liveModules].map((file) => repository.text(file)).join('\n');
}

export function checkLiveAdapterContract(report, repository) {
  const runner = repository.join('evals', 'run-live.mjs');
  const content = adapterSource(repository);
  const missing = REQUIRED_FRAGMENTS.filter((fragment) => !content.includes(fragment));
  report.assert(
    missing.length === 0,
    'live adapter contract',
    'fail-closed isolation, observed outcomes, and render evidence are present',
    `missing fragments: ${missing.join(', ')}`
  );

  // The adapter has no self-test harness of its own, so a dry run is the only smoke
  // check available without a real Claude call. Exit 0 alone proves nothing: a dry run
  // reports a failed preflight as UNRUN and still exits clean, so this also requires
  // the enumerated matrix and a validated invocation behind that exit code.
  const dryRun = spawnSync(process.execPath, [runner, '--dry-run'], { encoding: 'utf8' });
  const output = `${dryRun.stdout ?? ''}${dryRun.stderr ?? ''}`.split('\n').filter((line) => line !== '');
  const summary = output.find((line) => line.startsWith('LIVE SUMMARY ')) ?? '';
  const enumerated = Number(summary.match(/DRYRUN=(\d+)/)?.[1] ?? 0);
  const unvalidated = output.some((line) => line.includes('could not be validated'));
  report.assert(
    dryRun.status === 0 && enumerated > 0 && !unvalidated,
    'live adapter self-test',
    `the ported runner establishes the matrix and validates ${enumerated} invocations on a dry run`,
    output.join('; ')
  );
}
