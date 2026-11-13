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
    trackedFiles: () => [],
    join: (f) => f,
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
