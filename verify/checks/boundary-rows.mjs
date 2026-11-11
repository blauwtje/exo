import fs from 'node:fs';
import path from 'node:path';
import { git, gitLine } from '../../lib/git.mjs';
import { defaultBase, landedTasks, planIdOf } from '../../lib/plan-landed.mjs';
import { PlanError, parsePlan } from '../../lib/plan-tasks.mjs';

const NAME = 'boundary rows';
const OUT_OF_SCOPE_TITLE = /\b(?:test|it)\(\s*(['"`])(?:(?!\1).)*out-of-scope/;

function specFiles(repository) {
  const folder = repository.join('docs', 'specs');
  return repository.trackedFiles().filter((file) => path.dirname(file) === folder && file.endsWith('.md'));
}

function forkPoint(root) {
  const base = defaultBase(root);
  return base === null ? null : gitLine(root, ['merge-base', base, 'HEAD']);
}

function isInProgress(root, fork, file) {
  return fork !== null && git(root, ['diff', '--quiet', fork, '--', file]).status === 1;
}

function candidateOf(root, planId) {
  const prefix = `Plan-candidate: ${planId}/`;
  const line = git(root, ['log', '-1', '--format=%B']).stdout.split('\n').find((text) => text.startsWith(prefix));
  return line === undefined ? null : Number(line.slice(prefix.length));
}

function enforcedTasks(root, fork, file, tasks) {
  if (!isInProgress(root, fork, file)) return tasks;
  const planId = planIdOf(file);
  const landed = landedTasks(tasks, root, planId);
  const candidate = candidateOf(root, planId);
  return tasks.filter((task) => landed.includes(task.number) || task.number === candidate);
}

function boundaryRows(repository) {
  const fork = forkPoint(repository.root);
  return specFiles(repository).flatMap((file) => {
    const name = path.basename(file);
    try {
      const { tasks } = parsePlan(fs.readFileSync(file, 'utf8'));
      return enforcedTasks(repository.root, fork, file, tasks).filter((task) => task.boundary !== null).map((task) => ({ plan: name, task: task.number, test: task.boundary.test }));
    } catch (error) {
      if (!(error instanceof PlanError)) throw error;
      return [{ plan: name, unreadable: error.message }];
    }
  });
}

function lacksOutOfScopeTest(root, row) {
  if (row.unreadable !== undefined) return true;
  const file = path.join(root, row.test);
  return fs.existsSync(file) && !OUT_OF_SCOPE_TITLE.test(fs.readFileSync(file, 'utf8'));
}

function describeMissing(row) {
  if (row.unreadable !== undefined) return `${row.plan} does not parse: ${row.unreadable}`;
  return `${row.plan} task ${row.task}: ${row.test} holds no test whose title contains out-of-scope`;
}

export function checkBoundaryRows(report, repository) {
  const missing = boundaryRows(repository).filter((row) => lacksOutOfScopeTest(repository.root, row));
  report.assert(
    missing.length === 0,
    NAME,
    'every landed Boundary test file on disk holds a test titled out-of-scope',
    missing.map(describeMissing).join('; ')
  );
}
