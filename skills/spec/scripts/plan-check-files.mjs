import fs from 'node:fs';
import path from 'node:path';
import { isCovered } from '#plan-landed';
import { filesUnder, lockProblems, mentions, readerProblems, testTextsOf } from './plan-check-locks.mjs';

export function checkFilesExist(task, root, byNumber) {
  if (root === undefined || root === null) return [];
  const createdEarlier = new Set(
    [...dependencyChainOf(byNumber, task.number)]
      .flatMap((number) => byNumber.get(number).files)
      .filter((entry) => entry.kind === 'Create')
      .map((entry) => entry.path)
  );
  const problems = [];
  for (const file of task.files.filter((entry) => entry.kind === 'Modify')) {
    if (createdEarlier.has(file.path)) continue;
    if (!fs.existsSync(path.join(root, file.path))) {
      problems.push(`Task ${task.number}: 'Modify: \`${file.path}\`' does not exist in the target repository`);
    }
  }
  return problems;
}

// why: `run-` also starts the names of tests of `run-session.mjs`, so a name match counts only when the test, or a helper it imports, names the source file.
function existingTestsOf(sourcePath, testFiles, root) {
  const base = path.parse(sourcePath).name;
  const fileName = path.posix.basename(sourcePath);
  return testFiles
    .filter((name) => name === `${base}.test.mjs` || (name.startsWith(`${base}-`) && name.endsWith('.test.mjs')))
    .filter((name) => testTextsOf(path.join(root, 'tests', name)).some((text) => mentions(text, fileName)))
    .map((name) => `tests/${name}`);
}

export function checkUnlistedTests(task, root, byNumber) {
  if (root === undefined || root === null) return [];
  const testsDir = path.join(root, 'tests');
  if (!fs.existsSync(testsDir)) return [];
  const testFiles = fs.readdirSync(testsDir);
  const listed = task.files.map((file) => file.path);
  const sources = task.files.filter((file) => file.kind !== 'Create' && !file.path.endsWith('/') && !file.path.endsWith('.test.mjs') && file.path !== 'CHANGELOG.md');
  const problems = [];
  for (const source of sources) {
    const tests = existingTestsOf(source.path, testFiles, root);
    if (tests.length === 0 || tests.some((testPath) => isCovered(listed, testPath))) continue;
    problems.push(`Task ${task.number}: Files: \`${source.path}\` has existing tests ${tests.map((testPath) => `\`${testPath}\``).join(', ')} and lists none of them`);
  }
  if (sources.length === 0) return problems;
  const tracked = filesUnder(root);
  const withOthers = sources.map((source) => ({
    path: source.path,
    others: new Set(tracked.filter((name) => name !== source.path).map((name) => path.posix.basename(name)))
  }));
  return [...problems, ...lockProblems(task, root, withOthers, laterChainedPaths(byNumber, task.number)),...readerProblems(task, root, withOthers)];
}

const TEST_FILE_NAME = /^(?:[\w.-]+[._](?:test|spec)|test_[\w.-]+)\.\w+$/;

// why: a test that a task in the Depends on chain lists passes for this task too, and every flag here refuses the run start.
export function checkProofTestsListed(task, root, byNumber) {
  if (task.proof === null || root === undefined || root === null) return [];
  const listed = [task.number, ...dependencyChainOf(byNumber, task.number)].flatMap((number) => byNumber.get(number).files.map((file) => file.path));
  const unlisted = (task.proof.match(/[\w./@-]+/g) ?? [])
    .map((token) => token.replace(/^\.\//, ''))
    .filter((token) => TEST_FILE_NAME.test(path.posix.basename(token)) && !isCovered(listed, token) && fs.existsSync(path.join(root, token)));
  const listedProblems = [...new Set(unlisted)].map((testPath) => `Task ${task.number}: add \`${testPath}\` to Files: (its Proof runs it)`);
  return [...listedProblems, ...proofCommandProblems(task)];
}

const SHELL_WORDS = new Set(['cd', 'export', 'test', 'true', 'false', 'source', 'set', 'echo', 'exit']);

function isOnPath(command) {
  return (process.env.PATH ?? '').split(path.delimiter).some((directory) => directory !== '' && fs.existsSync(path.join(directory, command)));
}

function proofCommandProblems(task) {
  const command = task.proof.trim().replace(/^`+/, '').split(/\s+/)[0];
  if (!/^[A-Za-z][\w.-]*$/.test(command) || SHELL_WORDS.has(command) || isOnPath(command)) return [];
  return [`Task ${task.number}: Proof starts with \`${command}\`, which is not on this host's PATH`];
}

function laterChainedPaths(byNumber, number) {
  return [...byNumber.values()]
    .filter((other) => reachesThrough(byNumber, other.number, number))
    .flatMap((other) => other.files.map((file) => file.path));
}

function dependencyChainOf(byNumber, from) {
  const stack = [...byNumber.get(from).dependsOn];
  const seen = new Set();
  while (stack.length > 0) {
    const number = stack.pop();
    if (seen.has(number)) continue;
    seen.add(number);
    stack.push(...byNumber.get(number).dependsOn);
  }
  return seen;
}

export function reachesThrough(byNumber, from, to) {
  return dependencyChainOf(byNumber, from).has(to);
}

export function checkSharedFiles(tasks) {
  const byNumber = new Map(tasks.map((task) => [task.number, task]));
  const problems = [];
  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      const first = tasks[i];
      const second = tasks[j];
      const secondPaths = new Set(second.files.map((file) => file.path));
      const shared = new Set(first.files.map((file) => file.path).filter((filePath) => secondPaths.has(filePath)));
      if (shared.size === 0) continue;
      if (reachesThrough(byNumber, first.number, second.number) || reachesThrough(byNumber, second.number, first.number)) continue;
      for (const filePath of shared) {
        problems.push(`Task ${first.number} and Task ${second.number} both list Files: \`${filePath}\` with no Depends on chain between them`);
      }
    }
  }
  return problems;
}

const DATA_PATH = /`([\w@-][\w./@-]*\/[\w./@-]*)`/g;

function listedPathsOf(task, byNumber) {
  return [task.number, ...dependencyChainOf(byNumber, task.number)].flatMap((number) => byNumber.get(number).files.map((file) => file.path));
}

function proofStartWarning(task, root, listed) {
  if (task.proof === null) return [];
  const first = task.proof.trim().split(/\s+/)[0].replace(/^\.\//, '');
  if (!/^[\w@-][\w./@-]*\/[\w./@-]+$/.test(first)) return [];
  if (isCovered(listed, first) || fs.existsSync(path.join(root, first))) return [];
  return [`warning: Task ${task.number}: Proof starts with \`${first}\`, which is not in the checkout root and not in Files:`];
}

function dataPathWarnings(task, listed) {
  const paths = [...(task.data ?? '').matchAll(DATA_PATH)].map((match) => match[1].replace(/^\.\//, ''));
  return [...new Set(paths)]
    .filter((dataPath) => !isCovered(listed, dataPath))
    .map((dataPath) => `warning: Task ${task.number}: Data: names \`${dataPath}\`, which Files: omits`);
}

export function warnProofAndData(task, root, byNumber) {
  if (root === undefined || root === null) return [];
  const listed = listedPathsOf(task, byNumber);
  return [...proofStartWarning(task, root, listed), ...dataPathWarnings(task, listed)];
}
