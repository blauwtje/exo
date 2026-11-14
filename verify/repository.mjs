
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EXPECTED_SKILLS } from './budgets.mjs';

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
      .filter((full) => fs.existsSync(full) && fs.statSync(full).isFile())
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

  return {
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
    lines: readLines,
    text: createTextCache()
  };
}
