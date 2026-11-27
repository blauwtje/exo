import fs from 'node:fs';
import path from 'node:path';

export function isFile(target) {
  return fs.existsSync(target) && fs.statSync(target).isFile();
}

function readLines(file) {
  const split = fs.readFileSync(file, 'utf8').split('\n');
  if (split.length > 0 && split[split.length - 1] === '') split.pop();
  return split;
}

export function createRepository(root) {
  const absoluteRoot = path.resolve(root);
  const skillsRoot = path.join(absoluteRoot, 'skills');

  function walk(directory, predicate, enter = () => true) {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) return enter(full) ? walk(full, predicate, enter) : [];
      return entry.isFile() && predicate(full) ? [full] : [];
    }).sort();
  }

  return {
    root: absoluteRoot,
    skillsRoot,
    walk,
    relative: (target) => path.relative(absoluteRoot, path.resolve(target)).split(path.sep).join('/'),
    join: (...segments) => path.join(absoluteRoot, ...segments),
    everySkillFile: () => walk(skillsRoot, (full) => path.basename(full) === 'SKILL.md'
      && path.dirname(path.dirname(full)) === skillsRoot),
    markdownFiles: () => walk(skillsRoot, (full) => full.endsWith('.md')),
    lines: readLines,
    text: (file) => fs.readFileSync(file, 'utf8')
  };
}
