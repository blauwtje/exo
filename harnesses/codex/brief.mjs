import fs from 'node:fs';
import path from 'node:path';
import { briefLines } from '../../lib/guard-rules.mjs';

export function preambleWithBrief(root, fields) {
  const preamble = fs.readFileSync(path.join(root, 'harnesses', 'codex', 'agent-preamble.md'), 'utf8');
  const tools = String(fields.tools ?? '').split(',').map((tool) => tool.trim()).filter(Boolean);
  const lines = briefLines(tools);
  return `${preamble.trimEnd()}\n\n${lines.length === 0 ? '' : `${lines.join('\n')}\n\n`}`;
}
