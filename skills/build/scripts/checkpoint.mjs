import { execFileSync, spawnSync } from 'node:child_process';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { parsePin } from './land-pin.mjs';

const USAGE = 'usage: checkpoint.mjs [--root <dir>]\nCommits the worktree changes with a Plan-checkpoint trailer so a context stop keeps them; land-task folds it into the task commit.';

const run = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();

const absolute = (root, flag) => run(root, 'rev-parse', '--path-format=absolute', flag);

const onMainCheckout = (root) => absolute(root, '--git-dir') === absolute(root, '--git-common-dir');

function trailerOf(root) {
  const pin = parsePin(process.env.EXO_RUN_TASK);
  if (pin !== null) return `Plan-checkpoint: ${pin.planId}/${pin.number}`;
  return `Checkpoint: ${run(root, 'rev-parse', '--abbrev-ref', 'HEAD').replace(/[^\w.-]+/g, '-')}`;
}

function checkpoint(root) {
  if (onMainCheckout(root)) throw new UsageError('checkpoint refuses the main checkout; work in a worktree');
  run(root, 'add', '-A');
  if (spawnSync('git', ['-C', root, 'diff', '--cached', '--quiet']).status === 0) return 'nothing to checkpoint';
  const trailer = trailerOf(root);
  run(root, 'commit', '--no-verify', '-m', `checkpoint: ${trailer.split(': ')[1]}`, '-m', trailer);
  return `checkpoint ${run(root, 'rev-parse', '--short', 'HEAD')}`;
}

function main(argv) {
  const flags = parseFlags(argv, { root: 'value' }, { usage: USAGE });
  process.stdout.write(`${checkpoint(flags.root ?? process.cwd())}\n`);
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`checkpoint: ${error.stderr?.toString().trim() || error.message}\n`);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}
