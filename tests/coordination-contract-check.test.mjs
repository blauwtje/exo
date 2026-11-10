import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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

test('the tree passes the coordination check', () => {
  assert.deepEqual(findCoordinationProblems(gatherCoordinationState(ROOT)), []);
});

test('the pointer prose is smaller than the 26994 byte baseline', () => {
  const files = [
    ...['session-rules.md', 'dispatch-rules.md', 'session-routing.md'].map((name) => `hooks/${name}`),
    ...fs.readdirSync(path.join(ROOT, 'agents')).map((name) => `agents/${name}`),
    ...fs
      .readdirSync(path.join(ROOT, 'skills/build/references'))
      .filter((name) => name.startsWith('run-loop'))
      .map((name) => `skills/build/references/${name}`)
  ];
  const bytes = files.reduce((total, file) => total + fs.statSync(path.join(ROOT, file)).size, 0);
  assert.ok(bytes < 26994, `${bytes} bytes, baseline 26994`);
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

test('runLateChecks runs the coordination check right after the harness capabilities check', () => {
  const body = fs.readFileSync(path.join(ROOT, 'verify/late-checks.mjs'), 'utf8').split('export function runLateChecks')[1];
  const calls = [...body.matchAll(/^\s*(?:if \([^)]*\) )?(check\w+)\(report/gm)].map((match) => match[1]);
  const at = calls.indexOf('checkHarnessCapabilities');
  assert.equal(calls[at + 1], 'checkCoordinationContract');
});

test('a fork-coordinator wait that disagrees with the orchestrator prose fails', () => {
  const orchestrator = { name: 'orchestrator', tools: [], text: 'dispatch with `run_in_background: false`' };
  const contract = { claude: { 'fork-coordinator': { wait: 'notification', return: { maxLines: 8 }, contextBudget: 1 } } };
  const problems = findCoordinationProblems(state({ agents: [orchestrator], contract }));
  assert.match(problems.join('\n'), /fork-coordinator wait is notification/);
  contract.claude['fork-coordinator'].wait = 'foreground';
  assert.deepEqual(findCoordinationProblems(state({ agents: [orchestrator], contract })), []);
});
