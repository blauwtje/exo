import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { tempDir } from './harness.mjs';

const { dispatchBash } = await import('../hooks/dispatch-bash.mjs');

const TRAILER = ['Co-Authored-By', ': Claude <noreply@anthropic.com>'].join('');
const GENERATED = ['Generated', ' with Claude Code'].join('');

async function decide(command, extra = {}) {
  const input = { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, ...extra };
  const output = await dispatchBash(input, undefined, () => false);
  return output?.hookSpecificOutput;
}

const denies = async (command, extra) => (await decide(command, extra))?.permissionDecision === 'deny';

test('a plain commit whose message carries a co-author trailer is denied with the allowed form', async () => {
  const output = await decide(`git commit -m "fix: x\n\n${TRAILER}"`);
  assert.equal(output.permissionDecision, 'deny');
  assert.match(output.permissionDecisionReason, /same git commit/);
  assert.match(output.permissionDecisionReason, /removed/);
});

test('a generated-with line is denied in every message form', async () => {
  const forms = [
    `git commit -m "fix: x\n\n${GENERATED}"`,
    `git commit -m "fix: x" -m "${GENERATED}"`,
    `git commit --message="fix: x ${GENERATED}"`,
    `git commit --message "fix: x ${GENERATED}"`,
    `git commit -am '${GENERATED}'`,
    `git -C sub commit -m "$(cat <<'EOF'\nfix: x\n\n${GENERATED}\nEOF\n)"`,
    `cd sub && git commit -m "${TRAILER}"`
  ];
  for (const command of forms) assert.ok(await denies(command), command);
});

test('a clean commit message is allowed', async () => {
  const forms = [
    'git commit -m "fix(hooks): name the allowed form"',
    'git commit -am "docs: x" --amend',
    `git commit -m "$(cat <<'EOF'\nfix: x\n\nEvidence: none (docs only)\nEOF\n)"`
  ];
  for (const command of forms) assert.equal(await denies(command), false, command);
});

test('only a git commit message is checked, not other text that mentions attribution', async () => {
  const forms = [`grep -n "${TRAILER}" notes.md`, `git log --grep="${TRAILER}"`, `echo "${GENERATED}"`, 'git commit'];
  for (const command of forms) assert.equal(await denies(command), false, command);
});

test('a message file is read and checked when it is readable', async () => {
  const cwd = tempDir('exo-commit-');
  fs.writeFileSync(path.join(cwd, 'bad.txt'), `fix: x\n\n${TRAILER}\n`);
  fs.writeFileSync(path.join(cwd, 'good.txt'), 'fix: x\n');
  assert.ok(await denies('git commit -F bad.txt', { cwd }));
  assert.ok(await denies('git commit --file=bad.txt', { cwd }));
  assert.equal(await denies('git commit -F good.txt', { cwd }), false);
  assert.equal(await denies('git commit -F missing.txt', { cwd }), false);
  assert.equal(await denies('git commit -F -', { cwd }), false);
});

test('the check applies to a subagent and to the lead alike', async () => {
  const command = `git commit -m "${TRAILER}"`;
  assert.ok(await denies(command, { agent_id: 'agent-1' }));
  assert.ok(await denies(command, { agent_id: undefined }));
});

test('a commit whose Evidence line is invalid is denied with the correct form, a valid one is allowed', async () => {
  const bad = await decide(`git commit -m "fix: x\n\nEvidence: ran the tests"`);
  assert.equal(bad.permissionDecision, 'deny');
  assert.match(bad.permissionDecisionReason, /Evidence: benchmarks\/results\/<file>/);
  assert.match(bad.permissionDecisionReason, /Evidence: none \(<reason>\)/);
  assert.equal(await denies('git commit -m "fix: x\n\nEvidence: benchmarks/results/a.json"'), false);
  assert.equal(await denies('git commit -m "fix: x\n\nEvidence: none (covered by unit test)"'), false);
});
