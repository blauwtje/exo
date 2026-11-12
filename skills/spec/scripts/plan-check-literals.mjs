import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { realPath } from './plan-check-loop.mjs';
import { dataLiterals, literalFinder, literalFragments } from '#data-literals';

function hasHead(root) {
  return spawnSync('git', ['-C', root, 'rev-parse', '--verify', '-q', 'HEAD'], { stdio: 'ignore' }).status === 0;
}

// why: land searches names relative to the run worktree, so an absolute, outside or ignored path is one it can never find.
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
