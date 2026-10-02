// Every SKILL.md body after its frontmatter stays within SKILL_BODY_TOKENS.ceiling
// tokens, INJECTED_BODY_TOKENS.ceiling for the skill the session hook injects
// and STAGE_BODY_TOKENS for a stage-path skill capped at 750 (760 for spec), because a body is paid for on every run of its skill while a reference costs
// nothing until the step that opens it. A body over its ceiling moves its bulk
// to references/; the ceiling is never raised for one skill. Every plugin
// agent body, stripped of its own frontmatter, stays within
// AGENT_BODY_TOKENS.ceiling unless it is named in AGENT_BODY_TOKENS.exempt.

import path from 'node:path';
import { Buffer } from 'node:buffer';
import { markdownBody } from '../markdown.mjs';
import { BYTES_PER_TOKEN, SKILL_BODY_TOKENS, INJECTED_BODY_TOKENS, STAGE_BODY_TOKENS, AGENT_BODY_TOKENS } from '../budgets.mjs';

function stripFrontmatter(text) {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
}

export function checkBodyBudgets(report, repository) {
  const failures = [];
  const aboveRealistic = [];
  let largest = { tokens: 0, skill: '' };
  for (const file of repository.everySkillFile()) {
    const skill = path.basename(path.dirname(file));
    const relative = repository.relative(file);
    const text = repository.text(file);
    const bodyBytes = Buffer.byteLength(markdownBody('SKILL.md', text), 'utf8');
    const tokens = Math.round(bodyBytes / BYTES_PER_TOKEN);
    const ceiling = skill === INJECTED_BODY_TOKENS.skill
      ? INJECTED_BODY_TOKENS.ceiling
      : STAGE_BODY_TOKENS[skill] ?? SKILL_BODY_TOKENS.ceiling;
    const over = bodyBytes > ceiling * BYTES_PER_TOKEN;
    if (tokens > largest.tokens) largest = { tokens, skill };
    if (tokens > SKILL_BODY_TOKENS.realistic) aboveRealistic.push(`${skill} ${tokens}`);
    if (over) failures.push(`${relative} body is ${tokens} tokens, over its ${ceiling}-token ceiling`);
  }
  for (const file of repository.agentFiles()) {
    const agent = path.basename(file, '.md');
    if (AGENT_BODY_TOKENS.exempt.includes(agent)) continue;
    const relative = repository.relative(file);
    const bodyBytes = Buffer.byteLength(stripFrontmatter(repository.text(file)), 'utf8');
    const tokens = Math.round(bodyBytes / BYTES_PER_TOKEN);
    if (bodyBytes > AGENT_BODY_TOKENS.ceiling * BYTES_PER_TOKEN) {
      failures.push(`${relative} body is ${tokens} tokens, over its ${AGENT_BODY_TOKENS.ceiling}-token ceiling`);
    }
  }
  report.assert(
    failures.length === 0,
    'skill body budgets',
    `every skill body is within its ceiling; the largest is ${largest.skill} at ${largest.tokens} tokens; above the ${SKILL_BODY_TOKENS.realistic}-token aim: ${aboveRealistic.join(', ') || 'none'}`,
    `${failures.join('; ')}; move bulk into references/ and name in the body the step that opens it`
  );
}
