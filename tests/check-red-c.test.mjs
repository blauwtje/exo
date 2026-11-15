import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRepository } from '../verify/repository.mjs';
import { checkQuestionOptions } from '../verify/checks/question-options.mjs';
import { checkScriptOutput } from '../verify/checks/script-output.mjs';
import { checkSessionLoad } from '../verify/checks/hook-budgets.mjs';
import { failures, recorder, tree } from './check-outcome.mjs';

test('question options fails on an option list that skips a letter', () => {
  const root = tree({ 'skills/x/SKILL.md': '---\nname: x\n---\n- **(A)** one\n- **(C)** two\n' });
  const [failure] = failures(checkQuestionOptions, root);
  assert.match(failure.detail, /skills\/x\/SKILL\.md:5/);
});

test('script output fails on a runner script that skips the script-output import', () => {
  const root = tree({
    'agents/task-runner.md': 'Run land-task.mjs.\n',
    'skills/build/references/rolling-window.md': 'Run land-task.mjs.\n',
    'skills/build/scripts/land-task.mjs': 'console.log(1);\n'
  });
  const [failure] = failures(checkScriptOutput, root);
  assert.match(failure.detail, /land-task\.mjs/);
});

test('session load fails when the session-start hook cannot run', () => {
  const report = recorder();
  checkSessionLoad(report, createRepository(tree({ 'hooks/session-start.mjs': 'process.exit(3);\n' })));
  assert.equal(report.results[0].status, 'UNRUN');
  assert.match(report.results[0].detail, /exited 3/);
});

