import test from 'node:test';
import assert from 'node:assert/strict';
import { bodySizes } from '../verify/body-size.mjs';
import { BYTES_PER_TOKEN, SKILL_BODY_TOKENS, AGENT_BODY_TOKENS, STAGE_BODY_TOKENS } from '../verify/budgets.mjs';

function fake(files) {
  return {
    everySkillFile: () => Object.keys(files).filter((f) => f.endsWith('SKILL.md')),
    agentFiles: () => Object.keys(files).filter((f) => f.startsWith('agents/')),
    relative: (f) => f,
    text: (f) => files[f],
  };
}

test('bodySizes returns path, tokens, cap and headroom per capped body', () => {
  const repo = fake({
    'skills/build/SKILL.md': `---\nname: build\n---\n${'x'.repeat(400)}`,
    'skills/other/SKILL.md': `---\nname: other\n---\n${'x'.repeat(40)}`,
    'agents/a.md': `---\nname: a\n---\n${'x'.repeat(80)}`,
  });
  const byPath = Object.fromEntries(bodySizes(repo).map((r) => [r.path, r]));
  assert.equal(byPath['skills/build/SKILL.md'].tokens, 100);
  assert.equal(byPath['skills/build/SKILL.md'].cap, STAGE_BODY_TOKENS.build);
  assert.equal(byPath['skills/build/SKILL.md'].headroom, STAGE_BODY_TOKENS.build - 100);
  assert.equal(byPath['skills/other/SKILL.md'].cap, SKILL_BODY_TOKENS.ceiling);
  assert.equal(byPath['agents/a.md'].cap, AGENT_BODY_TOKENS.ceiling);
  assert.equal(byPath['agents/a.md'].headroom, AGENT_BODY_TOKENS.ceiling - 20);
});

test('a body past its cap is over with negative headroom', () => {
  const repo = fake({ 'skills/build/SKILL.md': `---\nname: build\n---\n${'x'.repeat((STAGE_BODY_TOKENS.build + 1) * BYTES_PER_TOKEN)}` });
  const [r] = bodySizes(repo);
  assert.equal(r.over, true);
  assert.ok(r.headroom < 0);
});

test('the body budget PASS line lists each capped skill with its headroom', async () => {
  const { checkBodyBudgets } = await import('../verify/checks/body-budgets.mjs');
  const repo = fake({
    'skills/build/SKILL.md': `---\nname: build\n---\n${'x'.repeat(400)}`,
    'skills/other/SKILL.md': `---\nname: other\n---\n${'x'.repeat(40)}`,
  });
  const calls = [];
  checkBodyBudgets({ assert: (...args) => calls.push(args) }, repo);
  assert.equal(calls[0][0], true);
  assert.match(calls[0][2], new RegExp(`headroom of the capped skills: build ${STAGE_BODY_TOKENS.build - 100}$`));
});

test('a locked reference that moves off its lock in either direction fails', async () => {
  const fs = await import('node:fs');
  const { checkReferenceShape } = await import('../verify/checks/reference-shape.mjs');
  const { REFERENCE_TOKEN_LOCKS, BYTES_PER_TOKEN: bytesPerToken } = await import('../verify/budgets.mjs');
  const locked = 'skills/build/references/critique.md';
  const lock = REFERENCE_TOKEN_LOCKS[locked];
  const run = (tokens) => {
    const repo = {
      everySkillFile: () => ['skills/build/SKILL.md'],
      relative: (f) => f,
      text: (f) => (f === locked ? 'x'.repeat(tokens * bytesPerToken) : fs.readFileSync(f, 'utf8')),
      lines: (f) => (f === locked ? ['x'] : fs.readFileSync(f, 'utf8').split('\n')),
    };
    const calls = [];
    checkReferenceShape({ assert: (...args) => calls.push(args) }, repo);
    return calls[0][3];
  };
  assert.match(run(lock - 10), /critique\.md is \d+ tokens, under its/);
  assert.match(run(lock + 1), /critique\.md is \d+ tokens, over its/);
});
