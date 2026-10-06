import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DESCRIPTION_CAP,
  codexBody,
  codexHeader,
  codexMarkdown,
  codexOpenaiYaml
} from '../harnesses/codex/rules.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const KNOWN = { skills: ['build', 'spec', 'remember'], agents: ['locate-code', 'build-task'] };
const SKILL = 'skills/spec/SKILL.md';

test('a skill script command runs through the launcher with a root path', () => {
  const text = 'Run `node "${CLAUDE_SKILL_DIR}/scripts/plan-check.mjs" --plan x`.';
  assert.equal(
    codexBody(SKILL, text, KNOWN),
    'Run `node "{{EXO_ROOT}}/harnesses/codex/run.mjs" "{{EXO_ROOT}}/skills/spec/scripts/plan-check.mjs" --plan x`.'
  );
});

test('a sibling skill script and a plugin-root script resolve to their skill', () => {
  const sibling = 'node "${CLAUDE_SKILL_DIR}/../build/scripts/land-task.mjs" --check';
  const rooted = 'node "${CLAUDE_PLUGIN_ROOT}/skills/build/scripts/land-task.mjs" --check';
  const expected = 'node "{{EXO_ROOT}}/harnesses/codex/run.mjs" "{{EXO_ROOT}}/skills/build/scripts/land-task.mjs" --check';
  assert.equal(codexBody(SKILL, sibling, KNOWN), expected);
  assert.equal(codexBody('agents/build-task.md', rooted, KNOWN), expected);
});

test('a lib script keeps a plain root path, because the launcher runs only skill scripts', () => {
  const text = 'node "${CLAUDE_SKILL_DIR}/../../lib/scratch-path.mjs" debug';
  assert.equal(codexBody(SKILL, text, KNOWN), 'node "{{EXO_ROOT}}/lib/scratch-path.mjs" debug');
});

test('a script path that leaves the root throws', () => {
  const text = 'node "${CLAUDE_SKILL_DIR}/../../../x.mjs"';
  assert.throws(() => codexBody(SKILL, text, KNOWN), /leaves the exo root/);
});

test('the plain variables map to the install placeholders', () => {
  const text = 'Read ${CLAUDE_PLUGIN_ROOT}/skills/route-skills/references/ladder.md and ${CLAUDE_SKILL_DIR}/references/a.md.';
  assert.equal(
    codexBody(SKILL, text, KNOWN),
    'Read {{EXO_ROOT}}/skills/route-skills/references/ladder.md and {{SKILL_DIR}}/references/a.md.'
  );
});

test('the session flag has no Codex source and is dropped', () => {
  const text = 'Rerun `start-run.mjs --plan <path> --session "${CLAUDE_SESSION_ID}"`.';
  assert.equal(codexBody(SKILL, text, KNOWN), 'Rerun `start-run.mjs --plan <path>`.');
});

test('a variable no rule maps throws', () => {
  assert.throws(() => codexBody(SKILL, 'Use ${CLAUDE_OTHER} here', KNOWN), /left unmapped: \$\{CLAUDE_OTHER\}/);
});

test('exo names become $skill, exo-agent and a typed command, and an unknown name throws', () => {
  assert.equal(
    codexBody(SKILL, 'Load `exo:build`, dispatch exo:locate-code, type `/exo:remember <goal>`.', KNOWN),
    'Load `$build`, dispatch exo-locate-code, type `$remember <goal>`.'
  );
  assert.throws(() => codexBody(SKILL, 'Load exo:nothing', KNOWN), /exo:nothing names no skill or agent/);
});

test('tool phrases become spawning an agent and reading a SKILL.md', () => {
  assert.equal(
    codexBody(SKILL, 'Call it through the Skill tool, or use the Task tool.', KNOWN),
    "Call it by reading that skill's `SKILL.md`, or use a spawn of the custom agent."
  );
  assert.equal(codexBody(SKILL, 'Run the Agent or Task tool.', KNOWN), 'Run a spawn of the custom agent.');
});

test('emphasis words go lowercase outside code spans and fences only', () => {
  const text = [
    'You MUST read it and NEVER guess; ALWAYS, IMPORTANT, CRITICAL, REQUIRED.',
    'Keep `MUST` and ``NEVER`` as written.',
    '```',
    'ALWAYS inside a fence',
    '```',
    'Then MUSTARD and NEVERMORE stay, but ALWAYS goes.'
  ].join('\n');
  assert.equal(codexBody(SKILL, text, KNOWN), [
    'You must read it and never guess; always, important, critical, required.',
    'Keep `MUST` and ``NEVER`` as written.',
    '```',
    'ALWAYS inside a fence',
    '```',
    'Then MUSTARD and NEVERMORE stay, but always goes.'
  ].join('\n'));
});

test('frontmatter keeps only name and description', () => {
  const text = [
    '---',
    'name: spec',
    'description: "Use when you MUST plan; see exo:build."',
    'argument-hint: "[goal]"',
    'model: sonnet',
    '---',
    '',
    '# Spec'
  ].join('\n');
  assert.equal(
    codexMarkdown(SKILL, text, KNOWN),
    '---\nname: spec\ndescription: "Use when you must plan; see $build."\n---\n\n# Spec'
  );
  assert.deepEqual(codexHeader(SKILL, text, KNOWN), { name: 'spec', description: 'Use when you must plan; see $build.' });
});

test('a file without frontmatter is mapped as a body', () => {
  assert.equal(codexMarkdown('skills/spec/references/a.md', 'See exo:spec.', KNOWN), 'See $spec.');
});

test('a description over the cap throws, one at the cap passes', () => {
  const make = (length) => `---\nname: spec\ndescription: ${'a'.repeat(length)}\n---\nbody`;
  assert.equal(codexHeader(SKILL, make(DESCRIPTION_CAP), KNOWN).description.length, DESCRIPTION_CAP);
  assert.throws(() => codexMarkdown(SKILL, make(DESCRIPTION_CAP + 1), KNOWN), /description is 1025 characters/);
});

test('a skill file with no description throws', () => {
  assert.throws(() => codexHeader(SKILL, '---\nname: spec\n---\nbody', KNOWN), /needs name and description/);
});

test('disable-model-invocation becomes an explicit-only policy, nothing else gets one', () => {
  const off = '---\nname: start\ndescription: x\ndisable-model-invocation: true\n---\n';
  const on = '---\nname: spec\ndescription: x\n---\n';
  assert.equal(codexOpenaiYaml('skills/start/SKILL.md', off), 'policy:\n  allow_implicit_invocation: false\n');
  assert.equal(codexOpenaiYaml(SKILL, on), null);
});

function listMarkdown(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const location = path.join(directory, entry.name);
    if (entry.isDirectory()) return listMarkdown(location);
    return entry.name.endsWith('.md') ? [location] : [];
  });
}

test('every real skill and agent file maps with no variable left and a description under the cap', () => {
  const skills = fs.readdirSync(path.join(ROOT, 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const agents = fs.readdirSync(path.join(ROOT, 'agents')).map((name) => path.basename(name, '.md'));
  const known = { skills, agents };
  for (const file of [...listMarkdown(path.join(ROOT, 'skills')), ...listMarkdown(path.join(ROOT, 'agents'))]) {
    const relative = path.relative(ROOT, file);
    const text = fs.readFileSync(file, 'utf8');
    const output = relative.startsWith('agents') ? codexBody(relative, text, known) : codexMarkdown(relative, text, known);
    assert.ok(!output.includes('${CLAUDE_'), relative);
    if (relative.endsWith('SKILL.md')) {
      assert.ok(codexHeader(relative, text, known).description.length <= DESCRIPTION_CAP, relative);
    }
  }
});
