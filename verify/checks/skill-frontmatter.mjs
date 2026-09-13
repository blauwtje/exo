// Two results. 'skill set': exactly the skills budgets.mjs lists exist as
// skills/<name>/SKILL.md. 'YAML frontmatter': every skill directory's SKILL.md,
// listed or not, parses under the strict reader, its name matches its folder,
// its description carries a Use clause and a Not clause, and a model-invocable
// description opens with "Use when".

import path from 'node:path';
import { EXPECTED_SKILLS, EXPECTED_SKILL_PATHS } from '../budgets.mjs';
import { readFrontmatter } from '../frontmatter.mjs';

const SKILL_NAME_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function checkSkillFrontmatter(report, repository) {
  const skillFiles = repository.walk(repository.skillsRoot, (file) => path.basename(file) === 'SKILL.md');
  const actualNames = repository.skillDirectories();
  const actualPaths = skillFiles.map((file) => repository.relative(file)).sort();
  const namesMatch = actualNames.join(', ') === [...EXPECTED_SKILLS].sort().join(', ');
  const pathsMatch = actualPaths.join(', ') === [...EXPECTED_SKILL_PATHS].sort().join(', ');
  report.assert(
    namesMatch && pathsMatch,
    'skill set',
    'exactly the expected canonical skill paths exist',
    `unexpected skill directories or paths: names=${actualNames.join(', ')}, paths=${actualPaths.join(', ')}`
  );

  const errors = [];
  for (const file of repository.everySkillFile()) {
    const relative = repository.relative(file);
    const parsed = readFrontmatter(repository.lines(file));
    for (const message of parsed.errors) errors.push(`${relative}: ${message}`);
    // A file whose frontmatter did not parse has no values to judge.
    if (parsed.errors.length > 0) continue;
    const name = parsed.values.get('name') ?? '';
    const description = parsed.values.get('description') ?? '';
    if (!SKILL_NAME_SHAPE.test(name) || name.length > 64) {
      errors.push(`${relative}: invalid skill name '${name}'`);
    }
    if (name !== path.basename(path.dirname(file))) {
      errors.push(`${relative}: name does not match directory`);
    }
    if (description.trim() === '' || description.length > 1024 || /[<>]/.test(description)) {
      errors.push(`${relative}: invalid description`);
    }
    // A description is the trigger: without both clauses the skill fires on the wrong turns.
    if (!/\bUse (when|for|at|only)\b/.test(description) || !/\bNot (for|when)\b/.test(description)) {
      errors.push(`${relative}: description lacks a Use clause or a Not clause`);
    }
    // The model matches its listing on the opening words, so a trigger it may act on opens on the trigger.
    if (parsed.values.get('disable-model-invocation') !== 'true' && !description.startsWith('Use when ')) {
      errors.push(`${relative}: model-invocable description does not open with 'Use when'`);
    }
  }
  report.assert(
    errors.length === 0,
    'YAML frontmatter',
    'every skill uses the strict portable subset',
    errors.join('; ')
  );
}
