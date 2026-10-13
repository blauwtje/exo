// Shared by the verify-gate tests: the fixture repository, the script path,
// the task landing, the REVIEW line and the plan and check texts.

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePlan } from '#plan-tasks';
import { git, gitRepository as seedRepository } from './harness.mjs';

// A fixture repository ignores `.exo/`, as a real checkout does, so the check cache verify writes is no path in the diff.
export const gitRepository = (files) => seedRepository({ '.gitignore': '.exo/\n', ...files });

export const SCRIPT = fileURLToPath(new URL('../skills/verify/scripts/verify.mjs', import.meta.url));

// The commit touches every path the task's `Files:` names, as a real landing does; `line` is what it appends to each.
export function landTask(root, number, line = `// task ${number}`) {
  const task = parsePlan(readFileSync(path.join(root, 'plan.md'), 'utf8')).tasks.find((entry) => entry.number === number);
  for (const { path: file } of task.files) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    appendFileSync(path.join(root, file), `${line}\n`);
  }
  git(root, 'add', '-A');
  git(root, 'commit', '--allow-empty', '-m', `chore: land task ${number}`, '-m', `Plan-task: plan/${number}`);
}

// The one branch-wide REVIEW line, for a run with no --base unless `base` names one.
export const reviewLine = (reviewer, base = 'main') => `REVIEW Branch ${base}..HEAD: ${reviewer}`;

export const CLEAN_CHECK = "console.log('SUMMARY FAIL=0 WARN=0 UNRUN=0');\n";

export const INLINE_PLAN = ['### Task 1: feat(app): greet', 'Depends on: none', '', 'Files:', '- Modify: `src/app.js`', '',
  '```js', 'export const greet = () => "hi";', '```', '', 'Commit:', '```bash', 'git commit -am "feat(app): greet" -m "Plan-task: plan/1"', '```', ''].join('\n');
