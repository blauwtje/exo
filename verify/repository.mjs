
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

export function createRepository(root) {
  const absoluteRoot = path.resolve(root);
  const skillsRoot = path.join(absoluteRoot, 'skills');

  function relative(target) {
    return path.relative(absoluteRoot, path.resolve(target)).split(path.sep).join('/');
  }

  function walk(directory, predicate, enter = () => true) {
    const found = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (directory === skillsRoot && !EXPECTED_SKILLS.includes(entry.name)) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (enter(full)) found.push(...walk(full, predicate, enter));
      } else if (entry.isFile() && predicate(full)) found.push(full);
    }
    return found.sort(comparePaths);
  }

  function trackedFiles() {
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

  const texts = new Map();
  function readOnce(file) {
    const stat = fs.statSync(file);
    const key = `${file}\0${stat.mtimeMs}\0${stat.size}`;
    if (!texts.has(key)) texts.set(key, fs.readFileSync(file, 'utf8'));
    return texts.get(key);
  }

  return {
    root: absoluteRoot,
    skillsRoot,
    relative,
    walk,
    trackedFiles,
    join: (...segments) => path.join(absoluteRoot, ...segments),
    skillDirectories: () => fs.readdirSync(skillsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && EXPECTED_SKILLS.includes(entry.name))
      .map((entry) => entry.name)
      .sort(),
    everySkillFile: () => fs.readdirSync(skillsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(skillsRoot, entry.name, 'SKILL.md')))
      .map((entry) => path.join(skillsRoot, entry.name, 'SKILL.md'))
      .sort(comparePaths),
    processFiles: () => walk(skillsRoot, (full) => path.basename(full) === 'SKILL.md'
      || (full.endsWith('.md') && path.basename(path.dirname(full)) === 'references')),
    promptFiles: () => walk(skillsRoot, (full) => full.endsWith('-prompt.md')
      && path.basename(path.dirname(path.dirname(full))) === 'skills'),
    agentFiles: () => {
      const agentsRoot = path.join(absoluteRoot, 'agents');
      if (!fs.existsSync(agentsRoot)) return [];
      return walk(agentsRoot, (full) => full.endsWith('.md'));
    },
    lines: (file) => {
      const text = fs.readFileSync(file, 'utf8');
      const split = text.split('\n');
      if (split.length > 0 && split[split.length - 1] === '') split.pop();
      return split;
    },
    text: readOnce
  };
}
