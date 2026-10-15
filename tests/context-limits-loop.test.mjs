// A run-plan session sets EXO_RUN_HANDOFF: the hook there asks for a hand-off
// file inside the session's root and a HANDOFF last line, never a subagent.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { contextDecision } from '../lib/context-limits.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-loop-'));
const entry = (tokens) => JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: tokens } } });
function at(tokens, extra = {}) {
  const file = path.join(dir, `t${tokens}-${Math.random()}.jsonl`);
  fs.writeFileSync(file, `${entry(tokens)}\n`);
  return contextDecision({ transcript_path: file, cwd: dir, tool_name: 'Read', ...extra });
}

function inLoop(body) {
  const saved = { handoff: process.env.EXO_RUN_HANDOFF, task: process.env.EXO_RUN_TASK };
  process.env.EXO_RUN_HANDOFF = path.join(dir, '.exo', 'handoff-task-3.md');
  process.env.EXO_RUN_TASK = 'plan/3';
  try {
    body();
  } finally {
    for (const [name, value] of [['EXO_RUN_HANDOFF', saved.handoff], ['EXO_RUN_TASK', saved.task]]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test('loop session over the hard limit: write the hand-off under the root and end on a HANDOFF line', () => {
  inLoop(() => {
    const { deny } = at(100000);
    assert.ok(deny.includes(path.join(dir, '.exo', 'handoff-task-3.md')), deny);
    assert.match(deny, /Write/);
    assert.match(deny, /Task 3: HANDOFF/);
    assert.doesNotMatch(deny, /subagent|general-purpose|save-session|BLOCKED/i);
    assert.equal(at(100000, { tool_name: 'Write' }), null);
  });
});

test('loop session over the soft limit: no subagent advice', () => {
  inLoop(() => {
    const { additionalContext } = at(65000);
    assert.match(additionalContext, /Finish your current step/);
    assert.doesNotMatch(additionalContext, /subagent/i);
  });
});

test('outside a loop session the main session gets no decision', () => {
  const saved = process.env.EXO_RUN_HANDOFF;
  delete process.env.EXO_RUN_HANDOFF;
  try {
    assert.equal(at(65000), null);
    assert.equal(at(100000), null);
  } finally {
    if (saved !== undefined) process.env.EXO_RUN_HANDOFF = saved;
  }
});
