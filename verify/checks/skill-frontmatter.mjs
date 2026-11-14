
import path from 'node:path';
import { EXPECTED_SKILLS, EXPECTED_SKILL_PATHS } from '../budgets.mjs';
import { readFrontmatter } from '../frontmatter.mjs';

const SKILL_NAME_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_NAME = /anthropic|claude/;
const COMPATIBILITY_LIMIT = 500;
const MODEL_FACING_ROOTS = ['skills/', 'agents/', 'hooks/', 'lib/'];

function userOnlyReferences(repository, userOnlySkills) {
  if (userOnlySkills.length === 0) return [];
  const barePattern = new RegExp(`(?<![/\\w-])exo:(${userOnlySkills.join('|')})(?![\\w-])`, 'g');
  const references = [];
  const files = repository.trackedFiles()
    .filter((file) => MODEL_FACING_ROOTS.some((root) => repository.relative(file).startsWith(root)));
  for (const file of files) {
    repository.lines(file).forEach((line, index) => {
      for (const match of line.matchAll(barePattern)) {
        references.push(`${repository.relative(file)}:${index + 1} → ${match[1]}`);
      }
    });
  }
  return references;
}

function skillErrors(file, relative, values) {
  const errors = [];
  const name = values.get('name') ?? '';
  const description = values.get('description') ?? '';
  if (!SKILL_NAME_SHAPE.test(name) || name.length > 64) errors.push(`${relative}: invalid skill name '${name}'`);
  if (RESERVED_NAME.test(name)) errors.push(`${relative}: skill name '${name}' holds a reserved word`);
  if ((values.get('compatibility') ?? '').length > COMPATIBILITY_LIMIT) {
    errors.push(`${relative}: compatibility exceeds ${COMPATIBILITY_LIMIT} characters`);
  }
  if (name !== path.basename(path.dirname(file))) errors.push(`${relative}: name does not match directory`);
  if (description.trim() === '' || description.length > 1024 || /[<>]/.test(description)) {
    errors.push(`${relative}: invalid description`);
  }
  if (!/\bUse (when|for|at|only)\b/.test(description) || !/\bNot (for|when)\b/.test(description)) {
    errors.push(`${relative}: description lacks a Use clause or a Not clause`);
  }
  if (values.get('disable-model-invocation') !== 'true' && !description.startsWith('Use when ')) {
    errors.push(`${relative}: model-invocable description does not open with 'Use when'`);
  }
  return errors;
}

function frontmatterErrors(repository) {
  const errors = [];
  const userOnlySkills = [];
  for (const file of repository.everySkillFile()) {
    const relative = repository.relative(file);
    const parsed = readFrontmatter(repository.lines(file));
    errors.push(...parsed.errors.map((message) => `${relative}: ${message}`));
    if (parsed.errors.length > 0) continue;
    errors.push(...skillErrors(file, relative, parsed.values));
    if (parsed.values.get('disable-model-invocation') === 'true') userOnlySkills.push(parsed.values.get('name') ?? '');
  }
  return { errors, userOnlySkills };
}

function assertSkillSet(report, repository) {
  const skillFiles = repository.walk(repository.skillsRoot, (file) => path.basename(file) === 'SKILL.md');
  const actualNames = repository.skillDirectories();
  const actualPaths = skillFiles.map((file) => repository.relative(file)).sort();
  const namesMatch = actualNames.join(', ') === [...EXPECTED_SKILLS].sort().join(', ');
  const pathsMatch = actualPaths.join(', ') === [...EXPECTED_SKILL_PATHS].sort().join(', ');
  report.assert(
    namesMatch && pathsMatch,
    'skill set',
    { pass: 'exactly the expected canonical skill paths exist', fail: `unexpected skill directories or paths: names=${actualNames.join(', ')}, paths=${actualPaths.join(', ')}` }
  );
}

export function checkSkillFrontmatter(report, repository) {
  assertSkillSet(report, repository);
  const { errors, userOnlySkills } = frontmatterErrors(repository);
  report.assert(
    errors.length === 0,
    'YAML frontmatter',
    { pass: 'every skill uses the strict portable subset', fail: errors.join('; ') }
  );

  const references = userOnlyReferences(repository, userOnlySkills);
  report.assert(
    references.length === 0,
    'user-only skill names',
    { pass: 'model-facing text names no user-only skill as bare exo:<name>', fail: references.join('; ') }
  );
}
