import { coveringTests } from '../../lib/covering-tests.mjs';

const KNOWN_PAIR = { changed: 'agents/task-runner.md', test: 'tests/agents.test.mjs' };

export function checkCoveringTests(report, repository) {
  const covering = coveringTests(repository.root, [KNOWN_PAIR.changed]);
  if (covering.includes(KNOWN_PAIR.test)) {
    report.result('PASS', 'covering tests', `${KNOWN_PAIR.changed} maps to ${KNOWN_PAIR.test}`);
    return;
  }
  report.result('FAIL', 'covering tests', `lib/covering-tests.mjs no longer maps ${KNOWN_PAIR.changed} to ${KNOWN_PAIR.test}; land-task would skip tests that read a changed file`);
}
