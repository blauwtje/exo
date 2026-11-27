import fs from 'node:fs';
import path from 'node:path';

const MAXIMUM_LINES = 500;
const SCRIPT_NAME = /[A-Za-z0-9_-]+\.(?:mjs|cjs|js|ts|py|sh|bash|rb|go|ps1)\b/g;

export const SCRIPT_EXCEPTIONS = [];

const isException = (skill, file) => SCRIPT_EXCEPTIONS.some((entry) => entry.skill === skill && entry.file === file);

function problemsOf(repository, skill) {
  const files = repository.walk(path.join(repository.skillsRoot, skill), () => true);
  const markdown = files.filter((file) => file.endsWith('.md'));
  const problems = [];
  const skillFile = path.join(repository.skillsRoot, skill, 'SKILL.md');
  if (fs.existsSync(skillFile)) {
    const count = repository.lines(skillFile).length;
    if (count > MAXIMUM_LINES) problems.push(`${repository.relative(skillFile)} holds ${count} lines, over ${MAXIMUM_LINES}`);
  }
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
    { pass: `every SKILL.md holds at most ${MAXIMUM_LINES} lines, every skill folder only .md files and names no script`, fail: problems.join('; ') }
  );
}
