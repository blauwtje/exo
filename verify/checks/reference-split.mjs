// A skill that splits a branch into references/ keeps one selector line: every
// `read references/<file>` pointer resolves, every references/*.md file is
// named in its SKILL.md, and no long line lives in both places.

import fs from 'node:fs';
import path from 'node:path';

const POINTER = /read `?(?<target>references\/[\w.-]+\.md)`?/gi;
const MIN_REPEAT_LENGTH = 40;

function skillFolders(skillsRoot) {
  return fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(skillsRoot, entry.name, 'SKILL.md')))
    .map((entry) => entry.name);
}

function referenceFiles(folder) {
  const directory = path.join(folder, 'references');
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter((name) => name.endsWith('.md'));
}

function longLines(text) {
  return text.split('\n').map((line) => line.trim()).filter((line) => line.length >= MIN_REPEAT_LENGTH);
}

function namedElsewhere(repository, name, file) {
  const full = `skills/${name}/references/${file}`;
  return repository.trackedFiles()
    .filter((tracked) => /\.(md|mjs)$/.test(tracked) && !tracked.includes('/skills/'))
    .some((tracked) => repository.text(tracked).includes(full));
}

function skillErrors(repository, name, folder) {
  const errors = [];
  const skillText = fs.readFileSync(path.join(folder, 'SKILL.md'), 'utf8');
  for (const match of skillText.matchAll(POINTER)) {
    const { target } = match.groups;
    if (!fs.existsSync(path.join(folder, target))) errors.push(`${name}: '${target}' does not exist`);
  }
  const skillLines = new Set(longLines(skillText));
  for (const file of referenceFiles(folder)) {
    const named = skillText.includes(`references/${file}`) || namedElsewhere(repository, name, file);
    if (!named) errors.push(`${name}: references/${file} is not named in SKILL.md`);
    const referenceText = fs.readFileSync(path.join(folder, 'references', file), 'utf8');
    if (longLines(referenceText).some((line) => skillLines.has(line))) {
      errors.push(`${name}: references/${file} repeats a SKILL.md line`);
    }
  }
  return errors;
}

export function checkReferenceSplit(report, repository) {
  const skillsRoot = repository.join('skills');
  const errors = skillFolders(skillsRoot).flatMap((name) => skillErrors(repository, name, path.join(skillsRoot, name)));
  report.assert(
    errors.length === 0,
    'Reference split',
    'every selector pointer resolves, every reference is named and no moved line is repeated',
    errors.join('; ')
  );
}
