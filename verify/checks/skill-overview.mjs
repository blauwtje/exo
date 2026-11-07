import { Buffer } from 'node:buffer';
import { buildOverview, OVERVIEW_PATH, readSkills, userOnlyClaimProblems } from '../../lib/skill-overview.mjs';
import { BYTES_PER_TOKEN } from '../budgets.mjs';

const OVERVIEW_TOKEN_CEILING = 750;

export function checkSkillOverview(report, repository) {
  const skills = readSkills(repository.skillsRoot);
  const expected = buildOverview(skills);
  report.assert(
    repository.text(repository.join(OVERVIEW_PATH)) === expected,
    'cheat sheet matches the skill frontmatter',
    `${OVERVIEW_PATH} is generated`,
    `${OVERVIEW_PATH} differs from its generated form; run node skills/start/scripts/overview.mjs --write`,
  );
  const tokens = Math.round(Buffer.byteLength(expected) / BYTES_PER_TOKEN);
  report.assert(tokens <= OVERVIEW_TOKEN_CEILING, 'generated cheat sheet fits the reference token ceiling', `${tokens} of ${OVERVIEW_TOKEN_CEILING} tokens`, `${tokens} tokens exceeds ${OVERVIEW_TOKEN_CEILING}; group or shorten the rows`);
  const problems = userOnlyClaimProblems(repository.text(repository.join('CONTRIBUTING.md')), skills);
  report.assert(problems.length === 0, 'CONTRIBUTING user-only count and names match the frontmatter', 'count and names match', problems.join('; '));
}
