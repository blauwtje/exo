import fs from 'node:fs';
import path from 'node:path';
import { behaviourDrift } from '../../skills/spec/scripts/behaviour.mjs';

const NAME = 'behaviour files';

export function checkBehaviourCurrent(report, repository) {
  if (!fs.existsSync(path.join(repository.root, '.git'))) {
    report.result('UNRUN', NAME, 'the repository root holds no .git, so no brief is tracked');
    return;
  }
  const { stale } = behaviourDrift(repository.root);
  report.assert(
    stale.length === 0,
    NAME,
    'docs/behaviour matches the acceptance lines of the tracked briefs',
    `run node skills/spec/scripts/behaviour.mjs; stale: ${stale.join(', ')}`
  );
}
