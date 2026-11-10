// Every SKILL.md body after its frontmatter stays within SKILL_BODY_TOKENS.ceiling
// tokens, and STAGE_BODY_TOKENS for a stage-path skill capped at 750 (790 for spec), because a body is paid for on every run of its skill while a reference costs
// nothing until the step that opens it. A body over its ceiling moves its bulk
// to references/; the ceiling is never raised for one skill. Every plugin
// agent body, stripped of its own frontmatter, stays within
// AGENT_BODY_TOKENS.ceiling unless it is named in AGENT_BODY_TOKENS.exempt.

import { SKILL_BODY_TOKENS, LOADED_PROSE_LOCK, LOADED_PROSE_ROOTS } from '../budgets.mjs';
import { bodySizes } from '../body-size.mjs';

export function checkBodyBudgets(report, repository) {
  const records = bodySizes(repository);
  const failures = records.filter((r) => r.over).map((r) => `${r.path} body is ${r.tokens} tokens, over its ${r.cap}-token ceiling`);
  const skills = records.filter((r) => r.kind === 'skill');
  let largest = { tokens: 0, skill: '' };
  for (const r of skills) if (r.tokens > largest.tokens) largest = { tokens: r.tokens, skill: r.name };
  const aboveRealistic = skills.filter((r) => r.tokens > SKILL_BODY_TOKENS.realistic).map((r) => `${r.name} ${r.tokens}`);
  const headroom = skills.filter((r) => r.cap < SKILL_BODY_TOKENS.ceiling).map((r) => `${r.name} ${r.headroom}`);
  report.assert(
    failures.length === 0,
    'skill body budgets',
    `every skill body is within its ceiling; the largest is ${largest.skill} at ${largest.tokens} tokens; above the ${SKILL_BODY_TOKENS.realistic}-token aim: ${aboveRealistic.join(', ') || 'none'}; headroom of the capped skills: ${headroom.join(', ') || 'none'}`,
    `${failures.join('; ')}; move bulk into references/ and name in the body the step that opens it`
  );
  checkLoadedProse(report, repository);
}

export function loadedProseBytes(repository) {
  return repository.trackedFiles()
    .map((file) => repository.relative(file))
    .filter((file) => file.endsWith('.md'))
    .filter((file) => LOADED_PROSE_ROOTS.some((root) => file.startsWith(`${root}/`)))
    .reduce((sum, file) => sum + Buffer.byteLength(repository.text(repository.join(file))), 0);
}

export function checkLoadedProse(report, repository) {
  const bytes = loadedProseBytes(repository);
  report.assert(
    bytes <= LOADED_PROSE_LOCK.bytes,
    'loaded prose bytes',
    `loaded prose is ${bytes} bytes, within the ${LOADED_PROSE_LOCK.bytes}-byte lock`,
    `loaded prose is ${bytes} bytes, over the ${LOADED_PROSE_LOCK.bytes}-byte lock; remove a line for each line added`
  );
}
