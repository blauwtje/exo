// Port of Test-SkillFrontmatter (verify.ps1:161-195): the eight expected skills
// exist as skills/<name>/SKILL.md, each name matches its folder, and every
// frontmatter parses under the strict reader. The check reports twice, under the
// names 'skill set' (verify.ps1:171) and 'YAML frontmatter' (verify.ps1:194):
// the result lines are the parity contract, so both names and both pass details
// are fixed text.

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
  for (const file of skillFiles) {
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
  }
  report.assert(
    errors.length === 0,
    'YAML frontmatter',
    'all the expected skills use the strict portable subset',
    errors.join('; ')
  );
}
