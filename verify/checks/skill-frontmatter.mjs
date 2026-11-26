import path from 'node:path';
import { readFrontmatter } from '../frontmatter.mjs';

const SKILL_NAME_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_NAME = /anthropic|claude/;
const COMPATIBILITY_LIMIT = 500;

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
  if (!/\bUse (when|for|at|only)\b/.test(description)) {
    errors.push(`${relative}: description lacks a Use clause`);
  }
  if (values.get('disable-model-invocation') !== 'true' && !description.includes('Use when ')) {
    errors.push(`${relative}: model-invocable description has no 'Use when'`);
  }
  return errors;
}

function frontmatterErrors(repository) {
  return repository.everySkillFile().flatMap((file) => {
    const relative = repository.relative(file);
    const parsed = readFrontmatter(repository.lines(file));
    if (parsed.errors.length > 0) return parsed.errors.map((message) => `${relative}: ${message}`);
    return skillErrors(file, relative, parsed.values);
  });
}

export function checkSkillFrontmatter(report, repository) {
  const errors = frontmatterErrors(repository);
  report.assert(
    errors.length === 0,
    'YAML frontmatter',
    { pass: 'every skill uses the strict portable subset', fail: errors.join('; ') }
  );
}
