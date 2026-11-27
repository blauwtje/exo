import fs from 'node:fs';
import path from 'node:path';

const MAXIMUM_WORDS = 500;
const SCRIPT_NAME = /[A-Za-z0-9_-]+\.(?:mjs|cjs|js|ts|py|sh|bash|rb|go|ps1)\b/g;

export const SCRIPT_EXCEPTIONS = [];

const isException = (skill, file) => SCRIPT_EXCEPTIONS.some((entry) => entry.skill === skill && entry.file === file);

function problemsOf(repository, skill) {
  const files = repository.walk(path.join(repository.skillsRoot, skill), () => true);
  const markdown = files.filter((file) => file.endsWith('.md'));
  const words = markdown.reduce((sum, file) => sum + repository.text(file).split(/\s+/).filter(Boolean).length, 0);
  const problems = [];
  if (words > MAXIMUM_WORDS) problems.push(`${skill} holds ${words} words, over ${MAXIMUM_WORDS}`);
  for (const file of files.filter((entry) => !entry.endsWith('.md'))) {
    problems.push(`${repository.relative(file)} is not a .md file`);
  }
  for (const file of markdown) {
    const names = new Set(repository.text(file).match(SCRIPT_NAME) ?? []);
    for (const name of names) {
      if (!isException(skill, name)) problems.push(`${repository.relative(file)} names the script ${name}`);
    }
  }
  return problems;
}

export function checkSkillSize(report, repository) {
  const skills = fs.existsSync(repository.skillsRoot)
    ? fs.readdirSync(repository.skillsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
    : [];
  const problems = skills.flatMap((skill) => problemsOf(repository, skill));
  report.assert(
    problems.length === 0,
    'skill size',
    { pass: `every skill folder holds at most ${MAXIMUM_WORDS} words, only .md files and names no script`, fail: problems.join('; ') }
  );
}
