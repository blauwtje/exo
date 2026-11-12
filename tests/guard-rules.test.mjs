import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { tempDir } from './harness.mjs';

process.env.TMPDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-guard-rules-'));

const rules = await import('../lib/guard-rules.mjs');
const { GUARD_RULES, denyReason } = rules;
const denyReasons = await import('../verify/checks/deny-reasons.mjs');
const { checkDenyReasons } = denyReasons;
const { agentHook } = await import('../hooks/agent-effort.mjs');
const { refusalRound } = await import('../lib/brief-denials.mjs');
const { dispatchBash } = await import('../hooks/dispatch-bash.mjs');
const { dispatchEdit } = await import('../hooks/dispatch-edit.mjs');
const { contextHook } = await import('../hooks/context-limit.mjs');
const { readKindTable } = await import('../lib/model-kinds.mjs');
const { agentContextTarget, contextLimit } = await import('../lib/context-limits.mjs');
const { agentHardLimit } = await import('../lib/context-decisions.mjs');
const { readDispatchRules } = await import('../hooks/dispatch-rules.mjs');
const { runNoWait } = await import('../hooks/run-no-wait.mjs');
const { stallGuardInput } = await import('../hooks/run-stall-guard.mjs');

const TRAILER = ['Co-Authored-By', ': Claude <noreply@anthropic.com>'].join('');
const LONG = `echo ${'x'.repeat(5000)}`;
const cwd = tempDir('guard-rules-');
fs.writeFileSync(path.join(cwd, 'message.txt'), `fix: x\n\n${TRAILER}\n`);

const textOf = (fields) => fields?.permissionDecisionReason ?? fields?.additionalContext ?? '';

const bash = async (command, extra = {}) => {
  const output = await dispatchBash({ tool_name: 'Bash', tool_input: { command }, cwd, ...extra });
  return textOf(output?.hookSpecificOutput);
};

const edit = () => dispatchEdit({
  tool_name: 'Write',
  cwd,
  tool_input: { file_path: path.join(cwd, 'a.mjs'), content: 'function deep(items) {\n  if (items) {\n    for (const item of items) {\n      if (item) {\n        return item;\n      }\n    }\n  }\n  return null;\n}\n' }
})?.hookSpecificOutput?.additionalContext ?? '';

const bashWarning = async (command, extra = {}) => {
  const output = await dispatchBash({ tool_name: 'Bash', tool_input: { command }, cwd, ...extra });
  assert.equal(output?.hookSpecificOutput?.permissionDecision, undefined);
  return output?.hookSpecificOutput?.additionalContext ?? '';
};

const agent = { agent_id: 'a' };

const spent = tempDir('guard-rules-context-');
const grownTo = (tokens, name = 'grown') => {
  const file = path.join(spent, `${name}-${tokens}.jsonl`);
  fs.writeFileSync(file, `${JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: tokens } } })}\n`);
  return file;
};
const contextDeny = (input) => {
  const fields = contextHook({ session_id: 's', permission_mode: 'bypassPermissions', ...input }, () => false)?.hookSpecificOutput;
  return fields?.permissionDecisionReason ?? fields?.additionalContext ?? '';
};
const subagent = (tokens, tool_name, tool_input = {}) => contextDeny({
  agent_id: `guard-rules-${tokens}-${tool_name}`,
  agent_type: 'exo:build-task',
  agent_transcript_path: grownTo(tokens, 'agent'),
  tool_name,
  tool_input
});
const leadOverLimit = () => {
  const saved = process.env.EXO_RUN_HANDOFF;
  process.env.EXO_RUN_HANDOFF = path.join(spent, 'handoff.md');
  try {
    return contextDeny({ transcript_path: grownTo(contextLimit() + 1000, 'lead'), tool_name: 'Bash', tool_input: { command: 'ls' } });
  } finally {
    if (saved === undefined) delete process.env.EXO_RUN_HANDOFF;
    else process.env.EXO_RUN_HANDOFF = saved;
  }
};
const largeSearch = () => {
  const home = tempDir('guard-rules-home-');
  fs.mkdirSync(path.join(home, '.config', 'exo'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'exo', 'run.json'), JSON.stringify({ defaults: { fetchTokens: 9000 } }));
  const saved = process.env.HOME;
  process.env.HOME = home;
  try {
    return subagent(agentContextTarget() - 1000, 'WebSearch', { query: 'node test runner' });
  } finally {
    process.env.HOME = saved;
  }
};
const shellTranscript = path.join(spent, 'shells.jsonl');
fs.writeFileSync(shellTranscript, [
  { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls', run_in_background: true } }] } },
  { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'Command running in background with ID: bg1. Output is being written to: /tmp/bg1.output.' }] } }
].map((entry) => JSON.stringify(entry)).join('\n'));
const liveShells = () => textOf(dispatchEdit({
  tool_name: 'Write',
  session_id: 'guard-rules',
  agent_id: `guard-rules-live-${process.pid}-${Date.now()}`,
  agent_transcript_path: shellTranscript,
  tool_input: { file_path: '/x/.exo/r.md' }
})?.hookSpecificOutput);
const noWait = (asks) => {
  const dir = tempDir('guard-rules-run-');
  const env = { EXO_RUN: '1', EXO_RUN_DIR: dir };
  const ask = () => runNoWait({ tool_name: 'AskUserQuestion', tool_input: { question: 'which?' }, session_id: 's' }, { env, dir });
  let output = null;
  for (let call = 0; call < asks; call += 1) output = ask();
  return textOf(output?.hookSpecificOutput);
};
const stallGuard = () => textOf(stallGuardInput({
  tool_name: 'Bash',
  tool_input: { command: 'node skills/build/scripts/land-task.mjs x; echo' }
})?.hookSpecificOutput);
const dispatch = (input) => textOf(agentHook({ tool_name: 'Agent', tool_input: input }, 'on', () => false)?.hookSpecificOutput);
const refusalCap = () => {
  const session = `cap-${process.pid}-${Date.now()}`;
  const input = { session_id: session, tool_name: 'Agent', tool_input: { subagent_type: 'exo:orchestrator', prompt: 'Workers: 5' } };
  const denied = { permissionDecision: 'deny', permissionDecisionReason: 'refused' };
  const reasons = [1, 2, 3].map(() => refusalRound(input, denied).permissionDecisionReason);
  fs.rmSync(path.join(os.tmpdir(), `exo-refusal-${session}`), { recursive: true, force: true });
  return reasons[2];
};
const isolated = () => dispatch({ subagent_type: 'general-purpose', prompt: 'Reads: none\nResult: reply', isolation: 'worktree' });
const resultFile = () => textOf(agentHook({ tool_name: 'Agent', cwd: sized, tool_input: { subagent_type: 'reader', prompt: 'Reads: none\nResult: .exo/x.md' } }, 'on', () => false)?.hookSpecificOutput);
const dispatchOutput = (prompt) => agentHook({ tool_name: 'Agent', tool_input: { subagent_type: 'exo:orchestrator', prompt } }, 'on', () => false)?.hookSpecificOutput ?? {};
const orchestrator = (prompt, pair) => dispatch({ subagent_type: 'exo:orchestrator', prompt, ...pair });
const sized = tempDir('guard-rules-size-');
fs.writeFileSync(path.join(sized, 'big.txt'), 'x'.repeat(70000));
fs.mkdirSync(path.join(sized, '.claude', 'agents'), { recursive: true });
fs.writeFileSync(path.join(sized, '.claude', 'agents', 'reader.md'), '---\nname: reader\ntools: Read\n---\nReads.\n');
const refuseOutput = (prompt, subagent_type = 'general-purpose', base = sized) => agentHook({
  tool_name: 'Agent',
  agent_type: 'exo:orchestrator',
  cwd: base,
  tool_input: { subagent_type, description: 'work', prompt }
}, 'on', () => false)?.hookSpecificOutput;
const refuse = (...args) => textOf(refuseOutput(...args));
const mainResearch = (type, session) => textOf(agentHook({
  tool_name: 'Agent',
  session_id: session,
  cwd: sized,
  tool_input: { subagent_type: type, description: 'work', prompt: 'Sources: web\nFetches: 1\nResult: .exo/r.md' }
}, 'on', () => false)?.hookSpecificOutput);
function fannedOut() {
  const session = `guard-rules-fanout-${process.pid}`;
  const marker = path.join(os.tmpdir(), `exo-research-${session}`);
  fs.rmSync(marker, { force: true });
  mainResearch('exo:research-worker', session);
  const reason = mainResearch('exo:research-worker', session);
  fs.rmSync(marker, { force: true });
  return reason;
}
const lined = tempDir('guard-rules-lined-');
fs.writeFileSync(path.join(lined, 'ranged.txt'), `${'x'.repeat(69)}\n`.repeat(1000));
fs.writeFileSync(path.join(sized, 'small.md'), 'hello\n'.repeat(10));
const tracked = tempDir('guard-rules-tracked-');
for (const dir of ['a', 'b']) {
  fs.mkdirSync(path.join(tracked, dir));
  fs.writeFileSync(path.join(tracked, dir, 'dup.txt'), 'x');
}
execFileSync('git', ['init', '-q'], { cwd: tracked });
execFileSync('git', ['add', '.'], { cwd: tracked });
const holder = tempDir('guard-rules-holder-');
fs.writeFileSync(path.join(holder, 'there.md'), 'x');
const sliceSpent = () => {
  const dir = tempDir('guard-rules-slice-');
  const transcript = path.join(dir, 'agent.jsonl');
  fs.writeFileSync(transcript, `${JSON.stringify({ message: { content: [{ type: 'text', text: 'Workers: 1\nReads: none' }] } })}\n{}\n`);
  const caller = { agent_id: `guard-rules-slice-${path.basename(dir)}`, agent_type: 'exo:orchestrator', agent_transcript_path: transcript, cwd: dir };
  const call = () => textOf(agentHook({ ...caller, tool_name: 'Agent', tool_input: { subagent_type: 'general-purpose', description: 'work', prompt: 'Reads: none\nResult: .exo/r.md' } }, 'on', () => false)?.hookSpecificOutput);
  try {
    call();
    return call();
  } finally {
    fs.rmSync(path.join(os.tmpdir(), `exo-slice-${caller.agent_id}`), { force: true });
  }
};
const longLine = path.join(spent, 'long-line.log');
fs.writeFileSync(longLine, `${'x'.repeat(200_000)}\n`);
const labelledPair = () => {
  const { model, effort } = readKindTable(undefined, { budget: 'on' }).kinds['build-task'];
  return { model, effort };
};
const cases = {
  'role-no-dispatch': () => textOf(agentHook({ tool_name: 'Agent', session_id: `guard-rules-role-${process.pid}`, agent_id: 'sub1', agent_type: 'exo:research-worker', tool_input: { subagent_type: 'general-purpose', prompt: 'Reads: none\nResult: reply\nx' } }, 'on', () => false)?.hookSpecificOutput),
  stash: () => bash('git stash', agent),
  'shared-state': () => bash('git worktree remove x', agent),
  'commit-attribution': () => bash(`git commit -m "fix: x" -m "${TRAILER}"`),
  'commit-evidence': () => bashWarning('git commit -m "fix: x\n\nEvidence: ran the tests"'),
  'script-size': () => bashWarning(LONG, { ...agent, cwd: '/nonexistent/deep' }),
  sleep: () => bash('sleep 5', { ...agent, agent_type: 'exo:task-runner' }),
  watch: () => bash(['gh pr checks 1 --wat', 'ch'].join(''), { ...agent, agent_type: 'exo:task-runner' }),
  'suite-passed': () => denyReason('suite-passed', 'This tree already passed a suite'),
  'code-rules': () => edit(),
  'result-line': () => subagent(10_000, 'Read', { file_path: longLine }),
  'context-lead': () => leadOverLimit(),
  'context-hard': () => subagent(agentHardLimit(agentContextTarget()) + 1000, 'Bash', { command: 'ls' }),
  'context-target': () => subagent(agentContextTarget() + 1000, 'Read', { file_path: 'a.md' }),
  'intake-glob': () => subagent(agentContextTarget() - 6000, 'Glob', { pattern: '**/*' }),
  'intake-websearch': () => largeSearch(),
  'live-shells': () => liveShells(),
  'run-no-wait': () => noWait(1),
  'run-no-wait-final': () => noWait(2),
  'run-stall-guard': () => stallGuard(),
  'refusal-cap': () => refusalCap(),
  'agent-isolation': () => isolated(),
  'result-tools': () => resultFile(),
  'kind-mismatch': () => orchestrator('Workers: 1', { model: 'opus', effort: 'max' }),
  'kind-mismatch-label': () => orchestrator('Workers: 1', labelledPair()),
  'workers-line': () => orchestrator('Workers: 5', {}),
  'research-unnamed': () => mainResearch('general-purpose', `guard-rules-unnamed-${process.pid}`),
  'research-fanout': () => fannedOut(),
  'brief-lacks-fetches': () => refuse('Sources: web\nResult: .exo/r.md', 'exo:research-worker'),
  'brief-invalid': () => refuse('Reads: none\nFetches: many\nSources: web', 'exo:research-worker'),
  'brief-unresolved': () => refuse('Reads: gone.md\nResult: .exo/r.md'),
  'brief-ambiguous-name': () => refuse('Reads: dup.txt\nResult: .exo/r.md', undefined, tracked),
  'brief-missing-path': () => refuse('Reads: gone.md\nResult: .exo/r.md'),
  'brief-worktree': () => refuse(`Reads: there.md\nResult: .exo/r.md\nSee ${holder}`),
  'brief-reads-label': () => refuse('Read first: small.md\nResult: .exo/r.md'),
  'brief-reads-none': () => refuse('Result: .exo/r.md', undefined, null),
  'brief-reads-named': () => refuse('Fix small.md\nResult: .exo/r.md'),
  'brief-reads-any': () => refuse('Fix big.txt\nResult: .exo/r.md'),
  'brief-range': () => refuse('Reads: ranged.txt\nResult: .exo/r.md', undefined, lined),
  'brief-lacks-reads': () => refuse('Result: .exo/r.md'),
  'brief-lacks-fields': () => refuse('Reads: none'),
  'brief-over-fetches': () => refuse('Reads: none\nFetches: 19\nSources: web', 'exo:research-worker'),
  'brief-cuts-page': () => refuse('Reads: none\nSources: web\ngh api x | head -c 4000', 'exo:research-worker'),
  'brief-over-budget': () => refuse('Reads: big.txt\nResult: .exo/r.md'),
  'slice-spent': () => sliceSpent(),
  'orchestrator-reads': () => denyReason('orchestrator-reads', '', { named: 'brief.md' }),
  'orchestrator-budget': () => denyReason('orchestrator-budget', '', { limit: 5 }),
  'reddit-route': () => redditRouteDecision({ tool_name: 'WebFetch', tool_input: { url: 'https://www.reddit.com/r/a' } }).deny,
  'repeat-refusal': () => repeated(2),
  'repeat-stop': () => repeated(3)
};

const { redditRouteDecision } = await import('../lib/reddit-route.mjs');
const { refusalText } = await import('../lib/refusal-memory.mjs');

const repeated = (times) => {
  const hookInput = { session_id: `guard-rules-${process.pid}-${times}`, tool_name: 'WebSearch', tool_input: { query: 'x' } };
  fs.rmSync(path.join(os.tmpdir(), `exo-refusals-${hookInput.session_id}.json`), { force: true });
  let text = '';
  for (let hit = 0; hit < times; hit += 1) text = refusalText(hookInput, { guard: 'g', guardText: 'first Do instead: go' });
  return text;
};

const denies = (row) => Boolean(row.rule || row.allowed);

const partText = (reason, text) => {
  for (const segment of text.split(/\{\w+\}/)) assert.ok(reason.includes(segment), reason);
};

const proofs = {
  'repeat-refusal': (reason) => assert.ok(reason.includes('follow the first refusal: first Do instead: go'), reason),
  'reddit-route': (reason) => assert.ok(reason.includes('--source reddit --query <text> --run <run-dir>; for a thread run search.mjs --url <thread-url>'), reason),
  'brief-ambiguous-name': (reason) => partText(reason, rules.rulePart('brief-ambiguous-name', { matches: '{m}' })),
  'brief-missing-path': (reason) => partText(reason, GUARD_RULES.find((row) => row.id === 'brief-missing-path').rule),
  'brief-worktree': (reason) => assert.ok(reason.includes(rules.allowedPart('brief-worktree', { dir: holder })), reason),
  'brief-reads-label': (reason) => assert.equal(reason, denyReason('brief-lacks-reads', rules.rulePart('brief-reads-label', { found: 'Read first: small.md' }), { reads: rules.allowedPart('brief-reads-named', { files: 'small.md' }) })),
  'brief-reads-none': (reason) => assert.equal(reason, denyReason('brief-lacks-reads', undefined, { reads: rules.allowedPart('brief-reads-none') })),
  'brief-reads-named': (reason) => assert.equal(reason, denyReason('brief-lacks-reads', undefined, { reads: rules.allowedPart('brief-reads-named', { files: 'small.md' }) })),
  'brief-reads-any': (reason) => assert.equal(reason, denyReason('brief-lacks-reads', undefined, { reads: rules.allowedPart('brief-reads-any') })),
  'brief-range': (reason) => assert.ok(reason.includes(rules.allowedPart('brief-range', { path: 'ranged.txt', last: 858, room: 30000 })), reason)
};

test('every row that denies has a case, and only those', () => {
  const proven = Object.entries(cases).filter(([, run]) => typeof run === 'function').map(([id]) => id);
  assert.deepEqual(proven.sort(), GUARD_RULES.filter(denies).map((row) => row.id).sort());
});

for (const row of GUARD_RULES) {
  test(`row ${row.id}: the deny names the allowed form`, async () => {
    if (!denies(row)) return assert.ok(row.brief, 'a row with no deny needs a brief line');
    assert.equal(typeof cases[row.id], 'function', 'no deny-proving case');
    const reason = await cases[row.id]();
    if (proofs[row.id]) return proofs[row.id](reason);
    const allowed = row.allowed;
    const segments = allowed.split(/\{\w+\}/);
    const expected = segments.length === 1 ? [`Do instead: ${allowed}`] : ['Do instead: ', ...segments];
    for (const segment of expected) assert.ok(reason.includes(segment), reason);
  });

  test(`row ${row.id}: the brief line reaches the rendered brief`, () => {
    if (!row.brief) return;
    assert.equal(readDispatchRules().includes(row.brief), !row.without);
    assert.ok(readDispatchRules(row.tools ?? ['Read']).includes(row.brief));
    if (row.tools) assert.ok(!readDispatchRules(['Agent']).includes(row.brief));
    if (row.without) assert.ok(!readDispatchRules([...row.without]).includes(row.brief));
  });
}

test('a missing Workers line or Reads line warns and lets the dispatch run', () => {
  assert.match(dispatchOutput('do it').additionalContext, /Workers/);
  assert.notEqual(dispatchOutput('do it').permissionDecision, 'deny');
  for (const id of ['brief-lacks-reads', 'script-size']) assert.equal(rules.guardKind(id), 'warn');
});

test('only the final run-no-wait refusal offers the BLOCKED line', () => {
  assert.doesNotMatch(noWait(1), /BLOCKED/);
  assert.match(noWait(2), /end with `Task <n>: BLOCKED <question>`/);
});

test('the agent-effort denies are the rule table reasons', () => {
  assert.equal(isolated(), denyReason('agent-isolation'));
});

for (const [id, tool] of [['result-tools', 'Write']]) {
  const brief = GUARD_RULES.find((row) => row.id === id)?.brief;
  test(`the ${id} line renders only for an agent without ${tool}`, () => {
    assert.ok(brief);
    assert.ok(readDispatchRules(['Read', 'Bash']).includes(brief));
    assert.ok(!readDispatchRules(['Read', tool]).includes(brief));
    assert.ok(!readDispatchRules().includes(brief));
  });
}

test('the task-owner line renders only for an agent with TaskStop', () => {
  const { brief } = GUARD_RULES.find((row) => row.id === 'task-owner');
  assert.ok(readDispatchRules(['Read', 'TaskStop']).includes(brief));
  assert.ok(!readDispatchRules(['Read', 'Bash']).includes(brief));
});

test('the file-result refusal is the rule table reason', () => {
  assert.equal(resultFile(), denyReason('result-tools', 'reader has no Write tool'));
});

test('denyReason builds rule, detail and allowed form', () => {
  const { allowed } = GUARD_RULES.find((row) => row.id === 'sleep');
  assert.equal(denyReason('sleep', 'x'), `No sleep polling: x. Do instead: ${allowed}.`);
});

for (const [name, command] of [
  ['-F file', 'git commit -F message.txt'],
  ['--file=', 'git commit --file=message.txt'],
  ['-Ffile', 'git commit -Fmessage.txt'],
  ['-F - heredoc', `git commit -F - <<'EOF'\nfix: x\n\n${TRAILER}\nEOF`],
  ['-F unreadable file', `printf '%s' '${TRAILER}' > m.txt && git commit -F m.txt`]
]) {
  test(`attribution is denied for ${name}`, async () => {
    assert.match(await bash(command), /Do instead: write the message .* to a file in an earlier call, then run `git commit -F <file>`/);
  });
}

test('a clean -F heredoc commit is allowed', async () => {
  assert.equal(await bash("git commit -F - <<'EOF'\nfix: x\nEOF"), '');
});

function denyReasonVerdicts(files) {
  const root = tempDir('deny-reasons-');
  const paths = Object.entries(files).map(([name, text]) => {
    const full = path.join(root, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text);
    return full;
  });
  const results = [];
  const repository = { trackedFiles: () => paths, relative: (file) => path.relative(root, file) };
  checkDenyReasons({ result: (status, name, detail) => results.push({ status, name, detail }) }, repository);
  return results;
}

test('the deny reason check fails a literal deny reason outside the rule table', () => {
  const [verdict] = denyReasonVerdicts({ 'hooks/literal.mjs': "export const f = () => ({ permissionDecision: 'deny', permissionDecisionReason: 'no' });\n" });
  assert.equal(verdict.status, 'FAIL');
  assert.match(verdict.detail, /^hooks\/literal\.mjs:1 /);
});

test('the deny reason check fails a deny call, a reason constant, a reason local and a deny object with a literal', () => {
  const lines = ["deny(`no`);", "const SLEEP_REASON = 'no';", "const reason = `no ${x}`;", "return { decision: 'deny', reason: 'no' };"];
  const results = denyReasonVerdicts({ 'lib/literal.mjs': `${lines.join('\n')}\n` });
  assert.deepEqual(results.map((result) => result.status), ['FAIL', 'FAIL', 'FAIL', 'FAIL']);
});

test('the deny reason check passes a denyReason call, a non-deny reason and the named exceptions', () => {
  const [verdict] = denyReasonVerdicts({
    'hooks/rule.mjs': "export const f = () => ({ permissionDecision: 'deny', permissionDecisionReason: denyReason('stash') });\n",
    'lib/status.mjs': "export const g = () => ({ status: 'ok', reason: 'no labels' });\n",
    'lib/guard-rules.mjs': "const row = { rule: 'x' }; deny('x');\n",
    'lib/status.mjs': "export const g = () => ({ status: 'ok', reason: 'no labels' });\n"
  });
  assert.equal(verdict.status, 'PASS');
});

test('the rule table is the only exception to the deny reason check', () => {
  assert.deepEqual(denyReasons.RULE_TABLE_EXCEPTIONS, ['lib/guard-rules.mjs']);
  const [verdict] = denyReasonVerdicts({ 'lib/brief-denials.mjs': "const NO_REASON = 'x';\n" });
  assert.equal(verdict.status, 'FAIL');
});

const BRIEF_DENIAL_ROWS = [
  'brief-invalid', 'brief-unresolved', 'brief-ambiguous-name', 'brief-missing-path', 'brief-worktree', 'brief-reads-label',
  'brief-reads-none', 'brief-reads-named', 'brief-reads-any', 'brief-range', 'brief-lacks-reads', 'brief-lacks-fields',
  'brief-over-fetches', 'brief-cuts-page', 'brief-over-budget'
];

test('every worker brief denial text is a row of the rule table', () => {
  const ids = GUARD_RULES.map((row) => row.id);
  for (const id of BRIEF_DENIAL_ROWS) assert.ok(ids.includes(id), id);
});

test('denyReason and the part helpers fill the placeholders of a row', () => {
  assert.equal(denyReason('brief-invalid', undefined, { labels: 'Fetches' }), 'This worker brief has an invalid Fetches line. Do instead: give a whole number.');
  assert.equal(rules.allowedPart('brief-reads-none'), '`Reads: none`');
  assert.match(rules.rulePart('brief-reads-label', { found: 'Read first: a.md' }), /^it has `Read first: a\.md`; rename it to `Reads:`$/);
  assert.throws(() => denyReason('brief-invalid'), /no param labels/);
});

const dispatched = (subagent_type, prompt) => agentHook({ tool_name: 'Agent', cwd: sized, tool_input: { subagent_type, description: 'work', prompt } }, 'on', () => false)?.hookSpecificOutput?.updatedInput?.prompt ?? '';

test('a dispatched brief carries the brief lines of the receiving agent tools up front', () => {
  const original = 'Reads: none\nResult: reply';
  const stash = rules.briefLines(['Bash']).find((line) => line.includes('git stash'));
  const noWrite = GUARD_RULES.find((row) => row.id === 'result-tools').brief;
  const docs = dispatched('reader', original);
  assert.ok(docs.endsWith(original) && docs.indexOf(noWrite) < docs.indexOf(original), docs);
  assert.ok(docs.includes(noWrite), docs);
  assert.ok(!docs.includes(stash), docs);
  const builder = dispatched('exo:build-task', 'Reads: none\nResult: .exo/r.md');
  assert.ok(builder.includes(stash) && true, builder);
  assert.ok(!builder.includes(noWrite), builder);
});

test('the Bash brief carries the speed contract C1 to C4 and the byte budget holds', () => {
  const lines = rules.briefLines(['Bash']).join('\n');
  assert.match(lines, /Round: n\/3/);
  assert.match(lines, /whole suite/);
  assert.match(lines, /gh pr checks --watch/);
  assert.match(lines, /Files:.*Proof:.*Checks:.*Reads:.*Result:/);
  assert.ok(GUARD_RULES.some((row) => row.id === 'suite' && row.brief));
  assert.ok(GUARD_RULES.some((row) => row.id === 'watch' && row.brief));
  assert.ok(Buffer.byteLength(lines) < 4000, `prelude ${Buffer.byteLength(lines)} bytes`);
});

test('the repeat refusal row carries the first refusal text', () => {
  const reason = denyReason('repeat-refusal', '', { first: 'first text' });
  assert.match(reason, /refused once already.*follow the first refusal: first text/);
});

test('a warn-kind guard returns its reason as context and a hard guard denies', async () => {
  const { refuse, warn } = await import('../lib/lazy-steps.mjs');
  assert.equal(rules.guardKind('suite-passed'), 'warn');
  assert.equal(rules.guardKind('stash'), 'hard');
  assert.deepEqual(refuse('suite-passed', 'x'), warn('x'));
  assert.equal(refuse('suite-passed', 'x').hookSpecificOutput.permissionDecision, undefined);
  assert.deepEqual(refuse('stash', 'x').hookSpecificOutput, { permissionDecision: 'deny', permissionDecisionReason: 'x' });
});

test('the deny reason check fails a deny text returned from a template literal', () => {
  const [verdict] = denyReasonVerdicts({ 'lib/template.mjs': 'export const f = (key) => ({ deny: `ran ${key} twice` });\n' });
  assert.equal(verdict.status, 'FAIL');
  assert.match(verdict.detail, /^lib\/template\.mjs:1 /);
});

test('the script-size warning does not say the command was refused', () => {
  assert.doesNotMatch(denyReason('script-size'), /refused/);
});

test('evidence line warns: a commit with a bad Evidence line runs with one WARN line', async () => {
  const context = await bashWarning('git commit -m "fix: x\n\nEvidence: ran the tests"');
  assert.match(context, /Evidence: ran the tests/);
  assert.equal(rules.guardKind('commit-evidence'), 'warn');
  assert.equal(rules.guardKind('commit-attribution'), 'hard');
});

test('evidence line warns on every bad commit in one session', async () => {
  const session = { session_id: 'evidence-repeat' };
  const command = 'git commit -m "fix: x\n\nEvidence: ran the tests"';
  assert.match(await bashWarning(command, session), /Evidence: ran the tests/);
  assert.match(await bashWarning(command, session), /Evidence: ran the tests/);
});

const DENYING_IDS = ['commit-attribution', 'context-hard', 'context-lead', 'run-no-wait', 'run-no-wait-final', 'run-stall-guard', 'shared-state', 'stash'];

test('one deny table: only a row with harm denies, and the denying ids are pinned', () => {
  assert.deepEqual(GUARD_RULES.filter((row) => row.harm).map((row) => row.id).sort(), DENYING_IDS);
  for (const row of GUARD_RULES) assert.equal(rules.guardKind(row.id), row.harm ? 'hard' : 'warn');
});

test('refuse fails open on an unknown id and notes a rule once per session', async () => {
  const { refuse } = await import('../lib/lazy-steps.mjs');
  assert.equal(refuse('no-such-rule', 'x'), null);
  const input = { session_id: `once-${process.pid}` };
  assert.ok(refuse('sleep', 'x', input).hookSpecificOutput.additionalContext);
  assert.equal(refuse('sleep', 'x', input), null);
});

test('an Agent note and a context note show once per session', () => {
  const session = `notes-${process.pid}`;
  const dispatchNote = () => textOf(agentHook({ session_id: session, tool_name: 'Agent', tool_input: { subagent_type: 'general-purpose', prompt: 'Reads: none\nResult: reply', isolation: 'worktree' } }, 'on', () => false)?.hookSpecificOutput);
  assert.match(dispatchNote(), /isolated agent/);
  assert.doesNotMatch(dispatchNote(), /isolated agent/);
  const read = { session_id: session, agent_id: 'notes-agent', agent_type: 'exo:build-task', agent_transcript_path: grownTo(agentContextTarget() + 1000, 'notes'), tool_name: 'Read', tool_input: { file_path: 'a.md' } };
  const contextNote = () => contextHook(read, () => false)?.hookSpecificOutput?.additionalContext ?? '';
  assert.equal(contextHook({ ...read, session_id: `${session}-shape` }, () => false).hookSpecificOutput.permissionDecision, undefined);
  assert.match(contextNote(), /target/);
  assert.doesNotMatch(contextNote(), /target/);
});

test('code rules warn: a breaking Write runs with the rule in its context', () => {
  const output = dispatchEdit({
    tool_name: 'Write',
    cwd,
    tool_input: { file_path: path.join(cwd, 'a.mjs'), content: 'function deep(items) {\n  if (items) {\n    for (const item of items) {\n      if (item) {\n        return item;\n      }\n    }\n  }\n  return null;\n}\n' }
  });
  assert.equal(output?.hookSpecificOutput?.permissionDecision, undefined);
  assert.match(output?.hookSpecificOutput?.additionalContext ?? '', /max-depth/);
  assert.equal(rules.guardKind('code-rules'), 'warn');
});

test('no tool-case rule', () => {
  assert.equal(GUARD_RULES.some((row) => row.id === 'tool-case'), false);
});

test('injected text drops native lines', async () => {
  const dropped = ['sleep', 'script-size', 'code-rules', 'result-line', 'context-target', 'intake-glob'];
  for (const id of dropped) assert.equal(GUARD_RULES.find((row) => row.id === id).brief, null, id);
  const read = (name) => fs.readFileSync(new URL(`../hooks/${name}`, import.meta.url), 'utf8');
  const texts = [read('dispatch-rules.md'), read('session-rules.md'), read('session-routing.md')].join('\n');
  const phrases = ['keeps decisions and the user dialogue', 'Brief an agent with the goal', 'The lead reads no file', 'Send long command output', 'Give an unnamed worker brief', 'end the turn and wait for the notification, and never', 'Test an order, seed', 'Fix all diagnosed causes', 'Count all as each warning', 'Call work done only', 'T5 agent expected', 'Before saying an agent or task still runs', 'completion notice names', 'A round brief carries no final checks', 'Grep a large file', 'returns off-brief', 'safe default, check every option'];
  for (const phrase of phrases) assert.ok(!texts.includes(phrase), phrase);
  const { BRIEF_LINES_LOCK } = await import('../verify/budgets.mjs');
  const bytes = Buffer.byteLength(rules.briefLines().join('\n'));
  assert.ok(bytes <= BRIEF_LINES_LOCK.bytes, `${bytes} bytes against ${BRIEF_LINES_LOCK.bytes}`);
});
