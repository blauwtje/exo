import assert from 'node:assert/strict';
import test from 'node:test';
import { stallGuardInput } from '../hooks/run-stall-guard.mjs';
import { SCRIPT, sandboxSettings } from '../skills/build/scripts/run-session.mjs';

const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
const root = '/private/tmp/work';
const landLoop = `S=${SCRIPT.landTask}; R=${root}; for n in 1 2 3 4; do node $S --check --plan $R/docs/plans/p.md --task $n --root $R --report $R/.exo/implementer-$n.md 2>&1 | tail -15; done`;

// why: wrapped in the stall guard, this compound call matched no allow rule and dontAsk denied it with no hint; the session reported the task blocked.
test('a compound call of an unsandboxed exo script is refused with the bare form to run', () => {
  const output = stallGuardInput(bash(landLoop))?.hookSpecificOutput;
  assert.equal(output?.permissionDecision, 'deny');
  assert.equal(output.updatedInput, undefined);
  assert.ok(output.permissionDecisionReason.includes(`node "${SCRIPT.landTask}" `), output.permissionDecisionReason);
});

test('a compound call that names the script after another command is refused', () => {
  const command = `cd ${root} && node "${SCRIPT.runDecision}" --help; node ${SCRIPT.runDecision.replace('run-decision.mjs', '')}run-decision.mjs x`;
  assert.equal(stallGuardInput(bash(`true; ${command}`))?.hookSpecificOutput.permissionDecision, 'deny');
});

test('a bare call of an unsandboxed exo script passes unchanged', () => {
  for (const command of [`node "${SCRIPT.landTask}" --check --task 1`, `node ${SCRIPT.landTask} --check --task 2 2>&1 | head -8`]) {
    assert.equal(stallGuardInput(bash(command)), null, command);
  }
});

test('any other command is wrapped in the stall guard', () => {
  const output = stallGuardInput(bash('for t in a b; do node --test src/$t.test.js; done'))?.hookSpecificOutput;
  assert.equal(output?.permissionDecision, undefined);
  assert.match(output.updatedInput.command, /stall-guard\.mjs" -- 'for t in a b;/);
});

test('the refused scripts are the ones a task session runs outside the sandbox', () => {
  const { sandbox } = sandboxSettings({ enabled: true, allowedDomains: [] });
  const excluded = new Set(sandbox.excludedCommands.filter((entry) => entry.startsWith('node "') && !entry.endsWith(':*')).map((entry) => entry.slice(6, -1)));
  for (const file of excluded) {
    const output = stallGuardInput(bash(`X=1; node "${file}" --help`))?.hookSpecificOutput;
    assert.equal(output?.permissionDecision, 'deny', file);
  }
  assert.ok(excluded.has(SCRIPT.landTask));
});
