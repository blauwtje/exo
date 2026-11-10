import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { findCoordinationProblems, gatherCoordinationState } from '../verify/checks/coordination-contract.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function agent(name, tools, text = '') {
  return { name, tools, text };
}

function state(overrides) {
  return { agents: [], skills: [], prose: [], contract: {}, ...overrides };
}

test('today the problem list names task-runner', () => {
  const problems = findCoordinationProblems(gatherCoordinationState(ROOT));
  assert.match(problems.join('\n'), /task-runner/);
});

test('a chain of two layers passes', () => {
  const problems = findCoordinationProblems(
    state({
      agents: [agent('boss', ['Agent', 'SendMessage'], 'exo:worker'), agent('worker', ['Read'])],
      skills: [{ agent: 'boss', text: '' }]
    })
  );
  assert.deepEqual(problems, []);
});

test('a chain of three layers fails', () => {
  const problems = findCoordinationProblems(
    state({
      agents: [
        agent('boss', ['Agent', 'SendMessage'], 'exo:middle'),
        agent('middle', ['Agent', 'SendMessage'], 'exo:worker'),
        agent('worker', ['Read'])
      ],
      skills: [{ agent: 'boss', text: '' }]
    })
  );
  assert.match(problems.join('\n'), /boss -> middle -> worker/);
});

test('a contract value restated in two prose files fails', () => {
  const row = { wait: 'wait-report', return: { maxLines: 8 }, contextBudget: 45000 };
  const problems = findCoordinationProblems(
    state({
      contract: { claude: { main: row } },
      prose: [
        { file: 'a.md', text: 'run wait-report.mjs' },
        { file: 'b.md', text: 'then wait-report.mjs again' }
      ]
    })
  );
  assert.match(problems.join('\n'), /wait command wait-report is restated in 2 prose files/);
});

test('a chain of three layers rooted at a subagent with no fork skill fails', () => {
  const problems = findCoordinationProblems(
    state({
      agents: [
        agent('boss', ['Agent', 'SendMessage'], 'exo:middle'),
        agent('middle', ['Agent', 'SendMessage'], 'exo:worker'),
        agent('worker', ['Read'])
      ]
    })
  );
  assert.match(problems.join('\n'), /boss -> middle -> worker/);
});
