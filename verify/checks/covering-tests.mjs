import fs from 'node:fs';
import { coveringTests } from '../../lib/covering-tests.mjs';

const KNOWN_PAIR = { changed: 'agents/build-task.md', test: 'tests/agents.test.mjs' };

function unnamedCheckModules(repository) {
  const testTexts = fs.readdirSync(repository.join('tests'))
    .filter((name) => name.endsWith('.test.mjs'))
    .map((name) => repository.text(repository.join('tests', name)));
  return fs.readdirSync(repository.join('verify', 'checks'))
    .filter((name) => name.endsWith('.mjs'))
    .filter((name) => !testTexts.some((text) => text.includes(name)));
}

export function checkCoveringTests(report, repository) {
  const covering = coveringTests(repository.root, [KNOWN_PAIR.changed]);
  if (!covering.includes(KNOWN_PAIR.test)) {
    report.result('FAIL', 'covering tests', `lib/covering-tests.mjs no longer maps ${KNOWN_PAIR.changed} to ${KNOWN_PAIR.test}; land-task would skip tests that read a changed file`);
    return;
  }
  const unnamed = unnamedCheckModules(repository);
  if (unnamed.length > 0) {
    report.result('FAIL', 'covering tests', `no tests/*.test.mjs names verify/checks/${unnamed.join(', verify/checks/')}; add a test that shows each fail once`);
    return;
  }
  report.result('PASS', 'covering tests', `${KNOWN_PAIR.changed} maps to ${KNOWN_PAIR.test}; every verify/checks module is named by a test`);
}
