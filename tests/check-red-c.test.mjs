import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRepository } from '../verify/repository.mjs';
import { checkQuestionOptions } from '../verify/checks/question-options.mjs';
import { checkScriptOutput } from '../verify/checks/script-output.mjs';
import { checkSessionLoad } from '../verify/checks/session-load.mjs';

function recorder() {
  const results = [];
  const result = (...entry) => results.push({ status: entry[0], name: entry[1], detail: entry[2] });
  return {
    results,
    result,
    note: () => {},
    assert: (...entry) => result(entry[0] ? 'PASS' : 'FAIL', entry[1], entry[0] ? entry[2] : entry[3])
  };
}

function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-check-red-'));
  for (const [relativePath, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    fs.writeFileSync(path.join(root, relativePath), text);
  }
  return root;
}

function failures(check, root) {
  const report = recorder();
  check(report, createRepository(root));
  return report.results.filter((entry) => entry.status === 'FAIL');
}

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

