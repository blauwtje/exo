import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function defectProblems(root) {
  const defects = JSON.parse(fs.readFileSync(path.join(root, 'defects.json'), 'utf8'));
  return defects.flatMap((defect) => {
    const file = path.join(root, defect.file);
    if (!fs.existsSync(file)) return [`${defect.id}: ${defect.file} missing`];
    const [from, to] = defect.lines;
    const window = fs.readFileSync(file, 'utf8').split('\n').slice(from - 1, to).join('\n');
    return new RegExp(defect.matcher).test(window) ? [] : [`${defect.id}: no match in ${defect.file}:${from}-${to}`];
  });
}

export function runSuite(root) {
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...fs.readdirSync(path.join(root, 'tests')).map((name) => path.join('tests', name))], { cwd: root, encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: undefined } });
  const count = (name) => Number(new RegExp(`^# ${name} (\\d+)`, 'm').exec(run.stdout)?.[1] ?? 0);
  return { tests: count('tests'), failed: count('fail') };
}

export function checkFixture(root) {
  const problems = defectProblems(root);
  const suite = runSuite(root);
  if (suite.tests === 0) problems.push('suite ran no tests');
  if (suite.failed > 1) problems.push(`${suite.failed} failures, only the seeded flake may fail`);
  return { problems, suite };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] ?? '');
  const { problems, suite } = checkFixture(root);
  console.log(`tests=${suite.tests} failed=${suite.failed} problems=${problems.length}`);
  for (const problem of problems) console.error(problem);
  process.exit(problems.length === 0 ? 0 : 1);
}
