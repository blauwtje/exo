import fs from 'node:fs';
import path from 'node:path';
import { briefLines } from '../../lib/guard-rules.mjs';

const TOOL_LINES = {
  codex: '- Run Read, Grep and Glob as shell reads; Read an image with `view_image`; run Edit and Write as `apply_patch`.',
  opencode: '- Run Read, Grep, Glob, Edit and Write with your own file tools.',
};

export function preambleWithBrief(root, fields, host = 'codex') {
  const template = fs.readFileSync(path.join(root, 'harnesses', 'codex', 'agent-preamble.md'), 'utf8');
  const preamble = template.replace('{tools}', TOOL_LINES[host]);
  const tools = String(fields.tools ?? '').split(',').map((tool) => tool.trim()).filter(Boolean);
  const lines = briefLines(tools);
  return `${preamble.trimEnd()}\n\n${lines.length === 0 ? '' : `${lines.join('\n')}\n\n`}`;
}
