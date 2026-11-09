import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { generateTree } from '../harnesses/codex/generate.mjs';
import { splitFrontmatter } from '../harnesses/codex/rules.mjs';
import { briefLines } from '../lib/guard-rules.mjs';

const ROOT = new URL('../', import.meta.url).pathname;

function toolsOf(name) {
  const { fields } = splitFrontmatter(fs.readFileSync(`${ROOT}agents/${name}.md`, 'utf8'));
  return String(fields.tools ?? '').split(',').map((tool) => tool.trim()).filter(Boolean);
}

test('every generated Codex agent with Bash carries the brief rules for its tools', () => {
  const tree = generateTree(ROOT);
  let checked = 0;
  for (const [file, text] of tree) {
    const match = /agents\/exo-(.+)\.toml$/.exec(file);
    if (!match) continue;
    const tools = toolsOf(match[1]);
    if (!tools.includes('Bash')) continue;
    checked += 1;
    for (const line of briefLines(tools)) assert.ok(text.includes(line), `${file} lacks: ${line}`);
  }
  assert.ok(checked > 0);
});

test('the shared preamble opens every Codex and OpenCode agent with the done-check rules and no absolutes', async () => {
  const { generateOpenCodeTree } = await import('../harnesses/opencode/generate.mjs');
  const preamble = fs.readFileSync(`${ROOT}harnesses/codex/agent-preamble.md`, 'utf8').trimEnd();
  assert.doesNotMatch(preamble, /\b(always|never|exactly)\b/i);
  const codex = [...generateTree(ROOT)].filter(([file]) => /agents\/exo-.+\.toml$/.test(file));
  const opencode = [...generateOpenCodeTree(ROOT, { config: {} })].filter(([file]) => file.startsWith('agents/'));
  assert.ok(codex.length > 0 && opencode.length > 0);
  for (const [file, text] of [...codex, ...opencode]) assert.ok(text.includes(preamble.split('\n')[2]), file);
});
