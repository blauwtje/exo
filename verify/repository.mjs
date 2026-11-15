
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EXPECTED_SKILLS } from './budgets.mjs';

export const SHIPPED_ROOTS = ['skills', 'lib', 'hooks', 'agents'];

export function isFile(target) {
  return fs.existsSync(target) && fs.statSync(target).isFile();
}

export function matchingLines(text, pattern) {
  return text.split('\n')
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => pattern.test(line))
    .map(({ number }) => number);
}

function comparePaths(left, right) {
  const loweredLeft = left.toLowerCase();
  const loweredRight = right.toLowerCase();
  if (loweredLeft !== loweredRight) return loweredLeft < loweredRight ? -1 : 1;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function listTrackedFiles(absoluteRoot) {
  const listing = spawnSync('git', ['-C', absoluteRoot, 'ls-files', '-z'], { encoding: 'utf8' });
  if (listing.status === 0) {
    return listing.stdout.split('\0')
      .filter((entry) => entry !== '')
      .map((entry) => path.join(absoluteRoot, entry))
      .filter(isFile)
      .sort(comparePaths);
  }
  return fs.readdirSync(absoluteRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort(comparePaths);
}

function listSkillDirectories(skillsRoot) {
  return fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && EXPECTED_SKILLS.includes(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function listEverySkillFile(skillsRoot) {
  return fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(skillsRoot, entry.name, 'SKILL.md')))
    .map((entry) => path.join(skillsRoot, entry.name, 'SKILL.md'))
    .sort(comparePaths);
}

function listSkillScriptFiles(skillsRoot, skillDirectories) {
  return skillDirectories
    .map((name) => path.join(skillsRoot, name, 'scripts'))
    .filter((folder) => fs.existsSync(folder) && fs.statSync(folder).isDirectory())
    .flatMap((folder) => fs.readdirSync(folder).sort()
      .filter((name) => !name.startsWith('.'))
      .map((name) => path.join(folder, name))
      .filter(isFile));
}

function readLines(file) {
  const split = fs.readFileSync(file, 'utf8').split('\n');
  if (split.length > 0 && split[split.length - 1] === '') split.pop();
  return split;
}

function createTextCache() {
  const texts = new Map();
  return (file) => {
    const stat = fs.statSync(file);
    const key = `${file}\0${stat.mtimeMs}\0${stat.size}`;
    if (!texts.has(key)) texts.set(key, fs.readFileSync(file, 'utf8'));
    return texts.get(key);
  };
}

export function createRepository(root) {
  const absoluteRoot = path.resolve(root);
  const skillsRoot = path.join(absoluteRoot, 'skills');

  function relative(target) {
    return path.relative(absoluteRoot, path.resolve(target)).split(path.sep).join('/');
  }

  function walk(directory, predicate, enter = () => true) {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => directory !== skillsRoot || EXPECTED_SKILLS.includes(entry.name));
    const found = entries.flatMap((entry) => {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) return enter(full) ? walk(full, predicate, enter) : [];
      return entry.isFile() && predicate(full) ? [full] : [];
    });
    return found.sort(comparePaths);
  }

  const repository = {
    root: absoluteRoot,
    skillsRoot,
    relative,
    walk,
    trackedFiles: () => listTrackedFiles(absoluteRoot),
    join: (...segments) => path.join(absoluteRoot, ...segments),
    skillDirectories: () => listSkillDirectories(skillsRoot),
    everySkillFile: () => listEverySkillFile(skillsRoot),
    processFiles: () => walk(skillsRoot, (full) => path.basename(full) === 'SKILL.md'
      || (full.endsWith('.md') && path.basename(path.dirname(full)) === 'references')),
    promptFiles: () => walk(skillsRoot, (full) => full.endsWith('-prompt.md')
      && path.basename(path.dirname(path.dirname(full))) === 'skills'),
    agentFiles: () => {
      const agentsRoot = path.join(absoluteRoot, 'agents');
      if (!fs.existsSync(agentsRoot)) return [];
      return walk(agentsRoot, (full) => full.endsWith('.md'));
    },
    skillScriptFiles: () => listSkillScriptFiles(skillsRoot, listSkillDirectories(skillsRoot)),
    shippedTextFiles: () => [...new Set([
      ...repository.processFiles(),
      ...repository.promptFiles(),
      ...repository.agentFiles(),
      ...repository.everySkillFile()
    ])],
    lines: readLines,
    text: createTextCache()
  };
  return repository;
}
