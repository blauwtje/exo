import fs from 'node:fs';
import path from 'node:path';
import { PlanError, parsePlan } from '../../lib/plan-tasks.mjs';

const NAME = 'boundary rows';
const OUT_OF_SCOPE_TITLE = /\b(?:test|it)\(\s*(['"`])(?:(?!\1).)*out-of-scope/;

function specFiles(repository) {
  const folder = repository.join('docs', 'specs');
  return repository.trackedFiles().filter((file) => path.dirname(file) === folder && file.endsWith('.md'));
}

function boundaryRows(repository) {
  return specFiles(repository).flatMap((file) => {
    const name = path.basename(file);
    try {
      const { tasks } = parsePlan(fs.readFileSync(file, 'utf8'));
      return tasks.filter((task) => task.boundary !== null).map((task) => ({ plan: name, task: task.number, test: task.boundary.test }));
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
    'every Boundary test file on disk holds a test titled out-of-scope',
    missing.map(describeMissing).join('; ')
  );
}
