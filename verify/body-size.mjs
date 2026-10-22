import path from 'node:path';
import { Buffer } from 'node:buffer';
import { markdownBody } from './markdown.mjs';
import { BYTES_PER_TOKEN, SKILL_BODY_TOKENS, STAGE_BODY_TOKENS, AGENT_BODY_TOKENS } from './budgets.mjs';

function stripFrontmatter(text) {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
}

function record({ kind, name, path: relative }, body, cap) {
  const bytes = Buffer.byteLength(body, 'utf8');
  const tokens = Math.round(bytes / BYTES_PER_TOKEN);
  return { kind, name, path: relative, bytes, tokens, cap, headroom: cap - tokens, over: bytes > cap * BYTES_PER_TOKEN };
}

export function bodySizes(repository) {
  const records = [];
  for (const file of repository.everySkillFile()) {
    const skill = path.basename(path.dirname(file));
    const cap = STAGE_BODY_TOKENS[skill] ?? SKILL_BODY_TOKENS.ceiling;
    records.push(record({ kind: 'skill', name: skill, path: repository.relative(file) }, markdownBody('SKILL.md', repository.text(file)), cap));
  }
  for (const file of repository.agentFiles()) {
    const agent = path.basename(file, '.md');
    if (AGENT_BODY_TOKENS.exempt.includes(agent)) continue;
    records.push(record({ kind: 'agent', name: agent, path: repository.relative(file) }, stripFrontmatter(repository.text(file)), AGENT_BODY_TOKENS.ceiling));
  }
  return records;
}
