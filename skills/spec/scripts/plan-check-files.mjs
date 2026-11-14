import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { readJsonOrNull } from '#basics';
import { dataLiterals, literalFinder, literalFragments } from '#data-literals';
import { realPath } from './plan-check-loop.mjs';

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

const SHELL_WORDS = new Set(['cd', 'export', 'test', 'true', 'false', 'source', 'set', 'echo', 'exit']);

function isOnPath(command) {
  return (process.env.PATH ?? '').split(path.delimiter).some((directory) => directory !== '' && fs.existsSync(path.join(directory, command)));
}

export function checkProofOnPath(task, root) {
  if (task.proof === null || root === undefined || root === null) return [];
  const command = task.proof.trim().replace(/^`+/, '').split(/\s+/)[0];
  if (!/^[A-Za-z][\w.-]*$/.test(command) || SHELL_WORDS.has(command) || isOnPath(command)) return [];
  return [`Task ${task.number}: Proof starts with \`${command}\`, which is not on this host's PATH`];
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
  return unchainedPairs(tasks).flatMap(([first, second]) => sharedFileProblems(first, second));
}

export function unchainedPairs(tasks) {
  const byNumber = new Map(tasks.map((task) => [task.number, task]));
  const pairs = tasks.flatMap((first, i) => tasks.slice(i + 1).map((second) => [first, second]));
  return pairs.filter(([first, second]) => !reachesThrough(byNumber, first.number, second.number) && !reachesThrough(byNumber, second.number, first.number));
}

function sharedFileProblems(first, second) {
  const secondPaths = new Set(second.files.map((file) => file.path));
  const shared = new Set(first.files.map((file) => file.path).filter((filePath) => secondPaths.has(filePath)));
  return [...shared].map((filePath) => `Task ${first.number} and Task ${second.number} both list Files: \`${filePath}\` with no Depends on chain between them`);
}

function hasHead(root) {
  return spawnSync('git', ['-C', root, 'rev-parse', '--verify', '-q', 'HEAD'], { stdio: 'ignore' }).status === 0;
}

function namesUnsearchablePath(fragment, root) {
  const target = path.resolve(root, fragment);
  if (!fs.existsSync(target)) return false;
  const relative = path.relative(root, fs.realpathSync(target));
  if (path.isAbsolute(fragment) || relative.startsWith('..') || path.isAbsolute(relative)) return true;
  return spawnSync('git', ['-C', root, 'check-ignore', '-q', '--', relative], { stdio: 'ignore' }).status === 0;
}

const PLACEHOLDER = /<[^>]*>/;

const quoted = (literals) => literals.map((literal) => `\`${literal}\``).join(', ');

function unsearchablePaths(task, literals, { found, root }) {
  const flagged = literals.filter((literal) => !found(literal) && literalFragments(literal).some((fragment) => namesUnsearchablePath(fragment, root) && !found(fragment)));
  if (flagged.length === 0) return [];
  return [`Task ${task.number}: Data: names ${quoted(flagged)}, a path the land check cannot search (absolute, outside the repository or git-ignored); name it relative to the repository, or add \`Literals: none (<reason>)\``];
}

function unmatchedPlaceholders(task, literals, found) {
  const flagged = literals.filter((literal) => !found(literal));
  if (flagged.length === 0) return [];
  return [`Task ${task.number}: Data: names ${quoted(flagged)}, a <placeholder> literal no file holds verbatim, and its text around the placeholder is not in the tree, so the land check refuses it as missing; name a literal the change holds verbatim, or add \`Literals: none (<reason>)\``];
}

function checkDataLiterals(task, root, planPath) {
  if (task.literals !== null || !task.data || !hasHead(root)) return [];
  const literals = [...new Set(dataLiterals(task.data))];
  const paths = literals.filter((literal) => literalFragments(literal).some((fragment) => namesUnsearchablePath(fragment, root)));
  const placeholders = literals.filter((literal) => PLACEHOLDER.test(literal));
  if (paths.length === 0 && placeholders.length === 0) return [];
  const found = literalFinder(root, planPath);
  return [...unsearchablePaths(task, paths, { found, root }), ...unmatchedPlaceholders(task, placeholders, found)];
}

export function dataLiteralsCheck(context) {
  if (!context.hasRoot || !fs.existsSync(context.root)) return [];
  const planFile = context.planPath === undefined ? null : realPath(context.planPath);
  return context.unlanded.flatMap((task) => checkDataLiterals(task, realPath(context.root), planFile));
}

const readManifest = (directory) => readJsonOrNull(path.join(directory, 'package.json'));

export function packageEntryPoints(directory) {
  const manifest = readManifest(directory);
  if (manifest === null) return null;
  const bin = manifest?.bin;
  const bins = bin && typeof bin === 'object' ? Object.keys(bin) : bin ? [String(bin)] : [];
  return typeof manifest?.scripts?.start === 'string' ? [...bins, 'npm start'] : bins;
}

const START_FORMS = ['npm start', 'npm run start', 'pnpm start', 'pnpm run start', 'yarn start', 'yarn run start'];

export function packageRunTerms(directory) {
  const manifest = readManifest(directory);
  const bin = manifest?.bin;
  const bins = bin && typeof bin === 'object' ? Object.entries(bin).flat() : bin ? [String(bin)] : [];
  const terms = bins.map((term) => String(term).replace(/^\.\//, ''));
  return typeof manifest?.scripts?.start === 'string' ? [...terms, ...START_FORMS] : terms;
}
