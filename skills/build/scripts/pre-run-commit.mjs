import { realpathSync } from 'node:fs';
import path from 'node:path';
import { decisionsPathOf } from '#plan-landed';
import { gitText } from '../../../lib/git.mjs';

const PRE_RUN_COMMIT = 'fix(run): keep work present before the run';

function excludedFromPreRunCommit(checkout, planPath) {
  const top = realpathSync(checkout);
  const listed = gitText(checkout, ['worktree', 'list', '--porcelain']).split('\n')
    .filter((line) => line.startsWith('worktree ')).map((line) => line.slice('worktree '.length));
  const real = (file) => path.join(realpathSync(path.dirname(path.resolve(file))), path.basename(file));
  return [real(planPath), real(decisionsPathOf(planPath)), ...listed]
    .map((file) => path.relative(top, path.resolve(file)))
    .filter((rel) => rel !== '' && !rel.startsWith('..'));
}

export function commitPreexistingWork(checkout, planPath) {
  gitText(checkout, ['add', '-A', '--', '.']);
  const excluded = excludedFromPreRunCommit(checkout, planPath);
  if (excluded.length > 0) gitText(checkout, ['reset', '-q', '--', ...excluded]);
  if (gitText(checkout, ['diff', '--cached', '--name-only']) === '') return;
  gitText(checkout, ['commit', '-q', '-m', PRE_RUN_COMMIT]);
  process.stdout.write(`start-run: committed pre-existing work as ${gitText(checkout, ['rev-parse', '--short', 'HEAD'])} (${PRE_RUN_COMMIT}).\n`);
}
