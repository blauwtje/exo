import fs from 'node:fs';
import path from 'node:path';
import { SKILL_MAX_LINES } from '#shared-values';

const SKILL_LINE_LIMIT = SKILL_MAX_LINES;
const NESTED = /references\/[\w-]+\.md|\(\.?\/?[\w-]+\.md\)/;

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

function skillFiles(repository, folder) {
  return repository.walk(folder, (file) => /\.(md|mjs)$/.test(file));
}

function crossPattern(name, names) {
  const others = names.filter((other) => other !== name);
  return others.length === 0 ? null : new RegExp(`(?:\\.\\./|skills/)(?:${others.join('|')})/[\\w./-]+`);
}

function crossErrors(repository, name, folder, names) {
  const pattern = crossPattern(name, names);
  if (pattern === null) return [];
  return skillFiles(repository, folder)
    .filter((file) => pattern.test(repository.text(file)))
    .map((file) => `${repository.relative(file)} names a path into another skill: '${pattern.exec(repository.text(file))[0]}'`);
}

function referenceErrors(name, folder, skillText) {
  return referenceFiles(folder).flatMap((file) => {
    const errors = [];
    if (!skillText.includes(`references/${file}`)) errors.push(`${name}: references/${file} is not named in SKILL.md`);
    if (NESTED.test(fs.readFileSync(path.join(folder, 'references', file), 'utf8'))) {
      errors.push(`${name}: references/${file} points to another reference`);
    }
    return errors;
  });
}

function skillErrors(repository, name, folder, names) {
  const skillText = fs.readFileSync(path.join(folder, 'SKILL.md'), 'utf8');
  const lines = skillText.split('\n').length - (skillText.endsWith('\n') ? 1 : 0);
  const errors = lines > SKILL_LINE_LIMIT ? [`${name}: SKILL.md has ${lines} lines, over ${SKILL_LINE_LIMIT}`] : [];
  return [...errors, ...referenceErrors(name, folder, skillText), ...crossErrors(repository, name, folder, names)];
}

export function checkReferenceSplit(report, repository) {
  const names = skillFolders(repository.skillsRoot);
  const errors = names.flatMap((name) => skillErrors(repository, name, path.join(repository.skillsRoot, name), names));
  report.assert(
    errors.length === 0,
    'skill layout',
    { pass: `every SKILL.md is under ${SKILL_MAX_LINES} lines, references sit one level deep and no skill paths into another`, fail: errors.join('; ') }
  );
}
