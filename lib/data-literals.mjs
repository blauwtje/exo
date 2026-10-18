import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';

const LINE_SUFFIX = /:\d+(?:-\d+)?$/;
const FRAGMENT_MIN = 3;

function gitLines(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n').filter((line) => line !== '');
}

export function dataLiterals(data) {
  return [...data.matchAll(/`([^`\n]+)`/g)].map((match) => match[1]);
}

export function literalFragments(literal) {
  return literal.replace(/<[^>]*>|\.\.\./g, ' ').split(/[^\w./-]+/).filter((fragment) => fragment.length >= FRAGMENT_MIN);
}

export function textPresence(root, planPath) {
  const diff = execFileSync('git', ['-C', root, 'diff', 'HEAD'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const planRelative = planPath === null ? '..' : path.relative(root, planPath);
  const excluded = planRelative.startsWith('..') ? [] : [`:(exclude)${planRelative}`];
  const inTree = (text) => spawnSync('git', ['-C', root, 'grep', '--untracked', '-F', '-q', '-e', text, '--', '.', ...excluded], { encoding: 'utf8' }).status === 0;
  return (text) => diff.includes(text) || inTree(text);
}

function pathRuns(file) {
  const segments = file.split('/');
  return segments.flatMap((_, start) => segments.slice(start).map((__, length) => segments.slice(start, start + length + 1).join('/')));
}

function segmentRuns(paths) {
  return new Set(paths.flatMap(pathRuns));
}

export function literalFinder(root, planPath) {
  const paths = gitLines(root, ['ls-files', '--cached', '--others', '--exclude-standard']);
  const names = new Set([...paths, ...paths.map((file) => path.basename(file))]);
  const runs = segmentRuns(paths);
  const present = textPresence(root, planPath);
  const isPart = (text) => runs.has(text.replace(/^\//, '').replace(/\/$/, ''));
  return (literal) => {
    const bare = literal.replace(LINE_SUFFIX, '');
    if (names.has(bare) || isPart(bare) || present(literal)) return true;
    return literalFragments(literal).every((fragment) => isPart(fragment) || present(fragment));
  };
}
