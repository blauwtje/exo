import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { SCRATCH_FOLDER } from '#scratch-path';
import { BRANCH_REVIEW_KEY, cachedPass, recordPass, recordReview, reviewVerdict, successCriterionPasses, workingTreeKey } from '#check-cache';
import { criterionCommand } from '#plan-frame';
import { withoutRunVariables } from '#process-tree';
import { runCheck } from '../../../lib/run-check.mjs';
import { decide, formatLine, recordRound, wallBudgetMs } from '../../../lib/loop-budget.mjs';
import { ledgerDirOf } from '../../gate/scripts/repair-round.mjs';
import { parseRepairLines, parseReviewLines, unprovenRisks } from './run-tail-parse.mjs';
import { agentModel } from './run-plan-provider.mjs';
import { shelveLeftover, untrackedPaths } from './run-worktree.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(HERE, '..', '..', '..');
const SCRIPT = {
  gate: path.join(PLUGIN_ROOT, 'skills', 'gate', 'scripts', 'gate.mjs'),
  mergeReviews: path.join(PLUGIN_ROOT, 'skills', 'gate', 'scripts', 'merge-reviews.mjs'),
  runProbes: path.join(PLUGIN_ROOT, 'skills', 'gate', 'scripts', 'run-probes.mjs'),
  landTask: path.join(HERE, 'land-task.mjs')
};
const REVIEW_AGENT = path.join(PLUGIN_ROOT, 'agents', 'review-branch.md');
const FIXER_PROMPT = path.join(PLUGIN_ROOT, 'skills', 'build', 'review-fixer-prompt.md');
const REVIEW_RULES = path.join(PLUGIN_ROOT, 'skills', 'gate', 'references', 'review-rules.md');
const CODE_STANDARD = path.join(PLUGIN_ROOT, 'lib', 'references', 'code-standard.md');

const node = (script, args, root) => spawnSync(process.execPath, [script, ...args], {
  cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, EXO_RUN_TASK: undefined }
});
const out = (answer) => `${answer.stdout ?? ''}${answer.stderr ?? ''}`;

const agentBody = () => fs.readFileSync(REVIEW_AGENT, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '').replaceAll('${CLAUDE_PLUGIN_ROOT}', PLUGIN_ROOT).trim();

function fixerPrompt({ planPath, root, base, findings }) {
  const block = fs.readFileSync(FIXER_PROMPT, 'utf8').match(/```text\n([\s\S]*?)\n```/)[1];
  return block.replace(/<plan path>/g, planPath).replace(/<root>/g, root).replace(/<base>/g, base).replace(/<findings path>/g, findings).replace(/<plan>/g, planPath);
}

export function reviewPrompt({ planPath, root, base, branch, scope, findings, input, questions = [] }) {
  return [
    agentBody(),
    '',
    '## Inputs',
    `- Code standard: ${CODE_STANDARD}`,
    `- Review rules: ${REVIEW_RULES}`,
    `- Plan: ${planPath}`,
    `- Branch: ${branch}`,
    `- Checkout: ${root}`,
    `- Base: ${base}`,
    `- Scope: ${scope}`,
    ...(input === undefined ? [] : [`- Input: ${input}`]),
    `- Findings path: ${findings}`,
    ...(questions.length > 0 ? ['- Questions:', ...questions.map((question) => `  - ${question}`)] : [])
  ].join('\n');
}

const verdictOf = (text) => text.match(/verdict=(CLEAN|FINDINGS|BLOCKED)\b/)?.[1] ?? null;
const countOf = (text, name) => Number(text.match(new RegExp(`\\b${name}=(\\d+)`))?.[1] ?? 0);

export const mergeArgs = ({ root, base, reports }) => ['--root', root, ...(base === null ? [] : ['--base', base]), ...reports.flatMap((report) => ['--report', report])];

export const fixReviewScope = (preFixSha) => `fix diff ${preFixSha}..HEAD`;

const findingsShaOf = (text) => text.match(/^FINDINGS-SHA (\S+)/m)?.[1] ?? null;

const headOf = (root) => spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();

const stopOf =(line, why, next) => ({ line, why, next });

const crashed = (answer, verdictLine) => answer.status !== 0 && !verdictLine.test(out(answer));

function crashStop(command, answer) {
  const last = out(answer).trim().split('\n').at(-1) || `no output`;
  return stopOf(`${command} failed: exit ${answer.status ?? 'none'}, ${last}`, `${command} exited ${answer.status ?? 'without a status'} and printed no verdict line: ${last}`, 'fix the cause, then run exo run again');
}

const REVIEW_LINES = /^(REVIEW|DISPATCH|OVERLAP)\b/m;
const GATE_LINES = /^(FAIL|UNPLANNED|REPORT)\b/m;
const REPAIR_LINES = /^(FAIL|STOP)\b/m;
const PROBE_LINES = /^FAIL probe\b/m;

const gateFailures = (gate) => out(gate).split('\n').filter((line) => /^(FAIL|UNPLANNED)\b/.test(line));

const fixBrokeGate = (line, findings) => stopOf(`fix broke the gate: ${line}`, 'The review fix failed the gate', `read ${findings}, repair on the branch, then run exo run again`);

function gateStop(afterFix, withoutFix, findings) {
  const broken = afterFix.find((line) => !withoutFix.includes(line));
  if (broken !== undefined) return fixBrokeGate(broken, findings);
  return stopOf(`gate already failed before the review fix: ${afterFix[0]}`, 'The branch fails the gate without the review fix', 'repair the gate on the branch, then run exo run again');
}

const CRITERION_FAIL = /^\s*(?:fail\b|not ok\b|✖|✗|×)/i;

function runCriterion(command, root) {
  const started = Date.now();
  const timeoutMs = wallBudgetMs();
  const answer = runCheck(root, command, { timeoutMs, env: withoutRunVariables(), fresh: true, record: false });
  const output = `${answer.output}${answer.timedOut ? `timed out after ${timeoutMs} ms\n` : ''}`;
  const lines = output.split(/\r?\n/).filter((line) => line.trim() !== '');
  const failing = lines.filter((line) => CRITERION_FAIL.test(line));
  const first = failing[0] ?? lines.at(-1) ?? (answer.error?.message ?? `exit ${answer.code ?? answer.signal}`);
  const tail = (failing.length > 0 ? failing : lines).slice(0, 20).map((line) => line.slice(0, 200));
  return { ok: successCriterionPasses({ ok: answer.code === 0 && !answer.timedOut, output }), output, ms: Date.now() - started, first: first.trim(), tail };
}

function landRepair({ planPath, plan, root }) {
  const status = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
  if (status.status !== 0 || status.stdout.trim() === '') return null;
  const scope = plan.tasks[0]?.title.match(/^\w+\(([^)]+)\)/)?.[1];
  const landed = node(SCRIPT.landTask, ['--fix', `fix${scope === undefined ? '' : `(${scope})`}: repair the Success criterion`, '--plan', planPath, '--root', root], root);
  if (landed.status === 0) return null;
  return stopOf('success repair landing failed', `Landing the Success criterion repair failed: ${out(landed).trim().split('\n').at(-1)}`, 'repair on the branch, then run exo run again');
}

async function repairCriterion({ command, result, planPath, plan, root, logDir, runSession, say }) {
  say(`success criterion red: ${result.first}, repair session`);
  const untrackedBefore = new Set(untrackedPaths(root));
  const session = await runSession({ kind: 'fix', task: null, model: null, prompt: `The Success criterion \`${command}\` fails on the head tree of this run. The check found:\n${result.tail.join('\n')}\n\nChange the tests or the product so the command passes; do not commit, the run lands your edits; end on one line.` });
  const stop = session.stop ?? landRepair({ planPath, plan, root });
  if (stop === null) say('success repair landed');
  if (stop === null) return null;
  const { patch } = shelveLeftover(root, path.join(logDir, 'success-repair-leftover.patch'), untrackedBefore);
  if (patch === null) return stop;
  return { ...stop, why: `${stop.why}; its edits are shelved in ${patch}`, next: `${stop.next}; the repair edits are in ${patch}` };
}

async function proveCriterion({ planPath, plan, root, logDir, runSession, say }) {
  const command = criterionCommand(plan.frame['Success criterion'] ?? '');
  if (command === null || command.startsWith('mcp:') || cachedPass(root, command) !== null) return null;
  let result = runCriterion(command, root);
  if (!result.ok) {
    const stop = await repairCriterion({ command, result, planPath, plan, root, logDir, runSession, say });
    if (stop !== null) return stop;
    result = runCriterion(command, root);
  }
  if (!result.ok) return stopOf(`success criterion failed: ${result.first}`, `The Success criterion is still red before the review: ${result.first}`, 'repair the Success criterion on the branch, then run exo run again');
  recordPass(root, command, result.ms, undefined, result.output);
  return null;
}

const OVERLAP_REVIEW_KEY = 'review-overlap';

function reusableReview(root, dispatch) {
  const stored = reviewVerdict(root, dispatch.key);
  return (stored?.verdict === 'CLEAN' || stored?.verdict === 'FINDINGS') && fs.existsSync(dispatch.findings);
}

function recordReviews(root, { fresh, sessions, tree }) {
  fresh.forEach((dispatch, index) => {
    const session = sessions[index];
    const verdict = session.stop === undefined ? verdictOf(session.resultText ?? '') : null;
    if (verdict === 'CLEAN' || verdict === 'FINDINGS') recordReview(root, dispatch.key, { verdict, before: tree });
  });
}

export function savePreFix(root, base, logDir) {
  const git = (...args) => spawnSync('git', args, { cwd: root, maxBuffer: 1 << 30 });
  const head = git('rev-parse', 'HEAD');
  const from = git('merge-base', base ?? 'HEAD', 'HEAD');
  if (head.status !== 0 || from.status !== 0) return;
  const headSha = head.stdout.toString('utf8').trim();
  const fromSha = from.stdout.toString('utf8').trim();
  const diff = git('diff', '--binary', fromSha, headSha);
  if (diff.status !== 0) return;
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(path.join(logDir, 'pre-fix.patch'), diff.stdout);
  fs.writeFileSync(path.join(logDir, 'pre-fix-head'), `head ${headSha}\nbase ${fromSha}\n`);
}

const BRANCH_QUESTIONS = [
  'Does the branch, taken as a whole, do what the plan Goal says?',
  'Is any requirement of the plan missing or only half done?',
  'Is any changed behavior wrong, whatever task it came from?'
];

function tailContext({ planPath, plan, root, base, branch, runSession, exec = node, logDir = path.join(root, SCRATCH_FOLDER), say = () => {}, attemptsLeft = 1, spentUsd = () => 0 }) {
  const gateArgs = ['--plan', planPath, '--root', root, ...(base === null ? [] : ['--base', base])];
  return { planPath, plan, root, base, branch, runSession, exec, logDir, say, attemptsLeft, spentUsd, gateArgs, exo: path.join(root, SCRATCH_FOLDER), baseText: base ?? 'HEAD', reviewModel: agentModel(), reports: [] };
}

function reviewDispatches(t, { review, branches, overlaps }) {
  const shardKey = (shard) => (shard.number === undefined ? BRANCH_REVIEW_KEY : `${BRANCH_REVIEW_KEY}-${shard.number}`);
  const shardName = (shard) => (shard.number === undefined ? 'branch' : `branch ${shard.number}`);
  const shardDispatch = (shard) => ({ task: null, name: shardName(shard), key: shardKey(shard), model: agentModel(review.kind), findings: shard.findings, input: shard.input, scope: `branch ${shard.range}`, questions: BRANCH_QUESTIONS });
  const overlap = { task: null, name: 'overlap', key: OVERLAP_REVIEW_KEY, model: agentModel(), findings: path.join(t.exo, 'review-overlap.md'), scope: `overlap\n${overlaps.map((target) => `OVERLAP ${target}`).join('\n')}`, questions: [] };
  return [...(review === null ? [] : branches.map(shardDispatch)), ...(overlaps.length === 0 ? [] : [overlap])];
}

function reviewOutcome(session, text) {
  const verdict = verdictOf(text);
  const model = session.model ?? 'unpinned';
  if (session.timedOut) return `timed out (${model})`;
  if (verdict === null) return `no verdict line (${model})`;
  const found = ['defect', 'concern', 'question', 'note'].reduce((total, kind) => total + countOf(text, kind), 0);
  return `${verdict} (${model}, ${found} findings)`;
}

async function runReview(t, dispatch) {
  t.say(`review start: ${dispatch.name}`);
  fs.rmSync(dispatch.findings, { force: true });
  const session = await t.runSession({ kind: 'review', task: dispatch.task, model: dispatch.model, prompt: reviewPrompt({ planPath: t.planPath, root: t.root, base: t.baseText, branch: t.branch, ...dispatch }) });
  if (session.stop === undefined) t.say(`review done: ${dispatch.name}: ${reviewOutcome(session, session.resultText ?? '')} (session ${session.sessionId ?? 'none'})`);
  return session;
}

export async function runTail(options) {
  const t = tailContext(options);
  const criterionStop = await proveCriterion({ planPath: t.planPath, plan: t.plan, root: t.root, logDir: t.logDir, runSession: t.runSession, say: t.say });
  if (criterionStop !== null) return { stop: criterionStop };
  const tree = workingTreeKey(t.root);
  const dispatched = t.exec(SCRIPT.gate, [...t.gateArgs, '--reviews-only'], t.root);
  if (crashed(dispatched, REVIEW_LINES)) return { stop: crashStop('gate --reviews-only', dispatched) };
  const dispatches = reviewDispatches(t, parseReviewLines(out(dispatched)));
  t.reports = dispatches.map((dispatch) => dispatch.findings);
  const fresh = dispatches.filter((dispatch) => !reusableReview(t.root, dispatch));
  for (const dispatch of dispatches) if (!fresh.includes(dispatch)) t.say(`review reused: ${dispatch.name}`);
  const sessions = await Promise.all(fresh.map((dispatch) => runReview(t, dispatch)));
  return afterReviews(t, { fresh, sessions, tree });
}

async function afterReviews(t, { fresh, sessions, tree }) {
  const stopped = sessions.find((session) => session.stop !== undefined);
  if (stopped !== undefined) {
    recordReviews(t.root, { fresh, sessions, tree });
    return { stop: stopped.stop };
  }
  if (t.reports.length === 0) return finish(t, tree);
  const mergeAnswer = t.exec(SCRIPT.mergeReviews, mergeArgs({ root: t.root, base: t.base, reports: t.reports }), t.root);
  const merged = out(mergeAnswer);
  const verdict = verdictOf(merged);
  const findings = path.join(t.exo, 'branch-review.md');
  recordReviews(t.root, { fresh, sessions, tree });
  if (verdict === null) return { stop: crashStop('merge-reviews', mergeAnswer) };
  if (verdict === 'BLOCKED') return { stop: stopOf('branch review BLOCKED', 'The branch review could not finish (BLOCKED)', `read ${findings}, fix the cause, then run exo run again`) };
  if (verdict === 'FINDINGS' && countOf(merged, 'fix') + countOf(merged, 'concern') >= 1) return fixLoop(t, { merged, findings, tree });
  return finish(t, tree);
}

function shelved(f, first, recheckClean) {
  const { patch, failed } = shelveLeftover(f.root, f.patchFile, f.untrackedBefore);
  const treeRestored = failed === undefined;
  const stop = recheckClean !== undefined && treeRestored ? recheckClean() : first;
  const notCleared = treeRestored ? '' : `; leftover not cleared: ${failed}`;
  if (patch !== null) return { stop: { ...stop, why: `${stop.why}; its edits are shelved in ${patch}${notCleared}`, next: `${stop.next}; the fix edits are in ${patch}` } };
  if (failed !== undefined) return { stop: { ...stop, why: `${stop.why}; shelving the edits failed: ${failed}` } };
  return { stop };
}

function repairStep(f, preFixSha) {
  const repaired = f.exec(SCRIPT.gate, [...f.gateArgs, '--repair', '--pre-fix-sha', preFixSha, '--findings', f.findings, '--findings-sha256', f.findingsSha], f.root);
  if (crashed(repaired, REPAIR_LINES)) return { result: shelved(f, crashStop('gate --repair', repaired)) };
  const { stopLine, failLine } = parseRepairLines(out(repaired));
  const next = `read ${f.findings}, repair on the branch, then run exo run again`;
  if (stopLine !== undefined) return { result: shelved(f, stopOf(`fix repair stopped: ${stopLine}`, 'gate --repair stopped the review fix', next)) };
  if (failLine === undefined) return null;
  return { failure: { line: failLine, open: 1, stop: stopOf(`fix repair failed: ${failLine}`, 'gate --repair refused the review fix', next) } };
}

function gateStep(f) {
  const gate = f.exec(SCRIPT.gate, f.gateArgs, f.root);
  if (crashed(gate, GATE_LINES)) return { result: shelved(f, crashStop('gate', gate)) };
  const failing = gateFailures(gate);
  if (failing.length === 0) return null;
  const recheck = () => {
    const without = f.exec(SCRIPT.gate, f.gateArgs, f.root);
    if (crashed(without, GATE_LINES)) return crashStop('gate', without);
    return gateStop(failing, gateFailures(without), f.findings);
  };
  return { failure: { line: failing[0], open: failing.length, stop: fixBrokeGate(failing[0], f.findings), recheck } };
}

function probeStep(f) {
  const probes = f.exec(SCRIPT.runProbes, ['--report', f.findings, '--root', f.root], f.root);
  if (crashed(probes, PROBE_LINES)) return { result: shelved(f, crashStop('run-probes', probes)) };
  const failed = out(probes).split('\n').filter((line) => /^FAIL probe\b/.test(line));
  if (failed.length === 0) return null;
  return { failure: { line: failed[0], open: failed.length, stop: stopOf(`fix probe failed: ${failed[0]}`, 'A fixed finding still fails its probe', `read ${f.findings}, repair on the branch, then run exo run again`) } };
}

async function reviewFix(f, preFixSha) {
  fs.rmSync(f.fixReview, { force: true });
  f.say('fix review start');
  const second = await f.runSession({ kind: 'review', task: null, model: f.reviewModel, prompt: reviewPrompt({ planPath: f.planPath, root: f.root, base: f.baseText, branch: f.branch, scope: fixReviewScope(preFixSha), findings: f.fixReview }) });
  if (second.stop !== undefined) return { result: shelved(f, second.stop) };
  const text = fs.existsSync(f.fixReview) ? fs.readFileSync(f.fixReview, 'utf8') : '';
  const verdict = text.match(/\b(CLEAN|FINDINGS|BLOCKED)\b/)?.[1] ?? 'BLOCKED';
  f.say(`review done: fix diff: ${second.timedOut ? 'timed out' : verdict} (session ${second.sessionId ?? 'none'})`);
  const fixLines = text.split('\n').filter((line) => /;\s*fix\s*$/.test(line));
  const stop = stopOf(`fix review ${verdict}`, `The review of the fix returned ${verdict}`, `read ${f.fixReview}, then run exo run again`);
  if (verdict === 'BLOCKED') return { result: shelved(f, stop) };
  if (verdict === 'FINDINGS' && fixLines.length > 0) return { failure: { line: fixLines[0].trim(), open: fixLines.length, stop } };
  return {};
}

async function fixAttempt(f, failedLine) {
  f.say(failedLine === null ? 'fix start' : 'fix retry start');
  const note = failedLine === null ? '' : `\n\nThe previous fix failed: ${failedLine}\nThe previous fix's commits are on the branch; repair them with new commits so this check passes.`;
  const preFixSha = headOf(f.root);
  const session = await f.runSession({ kind: 'fix', task: null, model: null, prompt: `${fixerPrompt({ planPath: f.planPath, root: f.root, base: f.baseText, findings: f.findings })}${note}` });
  if (session.stop !== undefined) return { result: shelved(f, session.stop) };
  const checked = repairStep(f, preFixSha) ?? gateStep(f) ?? probeStep(f);
  if (checked !== null) return checked;
  if (headOf(f.root) !== preFixSha) return reviewFix(f, preFixSha);
  f.say('fix review skipped: fixer changed nothing');
  return { result: finish(f, f.tree) };
}

async function settledFix(f, failedLine) {
  const startedAt = Date.now();
  const settled = await fixAttempt(f, failedLine);
  const costUsd = f.spentUsd() - f.ledgeredUsd;
  f.ledgeredUsd += costUsd;
  const openAfter = settled.failure === undefined ? 0 : Math.max(1, settled.failure.open);
  recordRound(f.ledger, { kind: 'review-fix', openBefore: f.open, openAfter, wallMs: Date.now() - startedAt, costUsd });
  f.open = openAfter;
  return settled;
}

async function fixLoop(t, { merged, findings, tree }) {
  const f = { ...t, findings, tree, untrackedBefore: new Set(untrackedPaths(t.root)), patchFile: path.join(t.logDir, 'review-fix-leftover.patch'), fixReview: path.join(t.exo, 'fix-review.md'), findingsSha: findingsShaOf(merged), ledger: ledgerDirOf(t.root, t.planPath), ledgeredUsd: t.spentUsd(), open: countOf(merged, 'fix') + countOf(merged, 'concern') };
  savePreFix(t.root, t.base, t.logDir);
  let attempt = await settledFix(f, null);
  const retryDecision = decide(f.ledger, 'review-fix');
  t.say(formatLine('review-fix', retryDecision));
  if (attempt.failure !== undefined && t.attemptsLeft - 1 >= 1 && retryDecision.verdict === 'CONTINUE') attempt = await settledFix(f, attempt.failure.line);
  if (attempt.result !== undefined) return attempt.result;
  if (attempt.failure !== undefined) return shelved(f, attempt.failure.stop, attempt.failure.recheck);
  t.say('fix committed');
  return finish(t, workingTreeKey(t.root));
}

function finish(t, reviewPassTree) {
  if (t.reports.length > 0) recordPass(t.root, BRANCH_REVIEW_KEY, 0, reviewPassTree);
  const gate = t.exec(SCRIPT.gate, t.gateArgs, t.root);
  const unproven = unprovenRisks(path.join(t.exo, 'branch-review.md'));
  if (unproven.length === 0) return { gate };
  return { gate: { status: gate.status, stdout: `${gate.stdout ?? ''}${unproven.map((line) => `WARN Unproven risk: ${line}\n`).join('')}`, stderr: gate.stderr } };
}
