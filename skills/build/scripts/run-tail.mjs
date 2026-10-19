import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { readKindTable } from '#model-kinds';
import { settingValue } from '#settings-store';
import { SCRATCH_FOLDER } from '#scratch-path';
import { BRANCH_REVIEW_KEY, cachedPass, recordPass, recordReview, reviewVerdict, successCriterionPasses, workingTreeKey } from '#check-cache';
import { criterionCommand } from '#plan-tasks';
import { runTreeSync, withoutRunVariables } from '#process-tree';
import { environmentMs } from '#script-flags';
import { shelveLeftover, untrackedPaths } from './run-worktree.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(HERE, '..', '..', '..');
const SCRIPT = {
  verify: path.join(PLUGIN_ROOT, 'skills', 'verify', 'scripts', 'verify.mjs'),
  mergeReviews: path.join(PLUGIN_ROOT, 'skills', 'verify', 'scripts', 'merge-reviews.mjs'),
  runProbes: path.join(PLUGIN_ROOT, 'skills', 'verify', 'scripts', 'run-probes.mjs'),
  landTask: path.join(HERE, 'land-task.mjs')
};
const REVIEW_AGENT = path.join(PLUGIN_ROOT, 'agents', 'review-branch.md');
const FIXER_PROMPT = path.join(PLUGIN_ROOT, 'skills', 'build', 'review-fixer-prompt.md');
const REVIEW_RULES = path.join(PLUGIN_ROOT, 'skills', 'verify', 'references', 'review-rules.md');
const CODE_STANDARD = path.join(PLUGIN_ROOT, 'skills', 'route-skills', 'references', 'code-standard.md');

const node = (script, args, root) => spawnSync(process.execPath, [script, ...args], {
  cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, EXO_RUN_TASK: undefined }
});
const out = (answer) => `${answer.stdout ?? ''}${answer.stderr ?? ''}`;

const agentBody = () => fs.readFileSync(REVIEW_AGENT, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '').replaceAll('${CLAUDE_PLUGIN_ROOT}', PLUGIN_ROOT).trim();

function agentModel(kind = 'review') {
  const budget = settingValue('budget');
  if (budget === 'off') return null;
  return readKindTable(undefined, { budget }).kinds[kind].model;
}

function fixerPrompt({ planPath, root, base, findings }) {
  const block = fs.readFileSync(FIXER_PROMPT, 'utf8').match(/```text\n([\s\S]*?)\n```/)[1];
  return block.replace(/<plan path>/g, planPath).replace(/<root>/g, root).replace(/<base>/g, base).replace(/<findings path>/g, findings).replace(/<plan>/g, planPath);
}

export function reviewPrompt({ planPath, root, base, branch, scope, findings, questions = [] }) {
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
    `- Implementer report directory: ${path.join(root, SCRATCH_FOLDER)}/`,
    `- Scope: ${scope}`,
    `- Findings path: ${findings}`,
    ...(questions.length > 0 ? ['- Questions:', ...questions.map((question) => `  - ${question}`)] : [])
  ].join('\n');
}

const verdictOf = (text) => text.match(/verdict=(CLEAN|FINDINGS|BLOCKED)\b/)?.[1] ?? null;
const countOf = (text, name) => Number(text.match(new RegExp(`\\b${name}=(\\d+)`))?.[1] ?? 0);

export function parseReviewLines(text) {
  let review = null;
  const overlaps = [];
  for (const line of text.split('\n')) {
    const branchLine = line.match(/^REVIEW Branch ([^:]*): (review-branch)(?: exo-kind: (\S+))?\s*$/);
    if (branchLine !== null) review = { range: branchLine[1], kind: branchLine[3] ?? 'review' };
    const overlap = line.match(/^OVERLAP (?!none)(.+?) \(Tasks [^)]*\)$/);
    if (overlap !== null) overlaps.push(overlap[1]);
  }
  return { review, overlaps };
}

export function unprovenRisks(findings) {
  if (!fs.existsSync(findings)) return [];
  return fs.readFileSync(findings, 'utf8').split('\n')
    .filter((line) => /\bconcern\b/.test(line) && /reported:\s*unproven\b/.test(line))
    .map((line) => line.replace(/;?\s*reported:.*$/, '').trim());
}

const stopOf =(line, why, next) => ({ line, why, next });

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
  const timeoutMs = environmentMs('EXO_GATE_TIMEOUT_MS', 1_800_000);
  const answer = runTreeSync(command, { cwd: root, timeoutMs, env: withoutRunVariables() });
  const output = `${answer.output}${answer.timedOut ? `timed out after ${timeoutMs} ms\n` : ''}`;
  const lines = output.split(/\r?\n/).filter((line) => line.trim() !== '');
  const failing = lines.filter((line) => CRITERION_FAIL.test(line));
  const first = failing[0] ?? lines.at(-1) ?? (answer.error?.message ?? `exit ${answer.status ?? answer.signal}`);
  const tail = (failing.length > 0 ? failing : lines).slice(0, 20).map((line) => line.slice(0, 200));
  return { ok: answer.status === 0 && !answer.timedOut && successCriterionPasses({ ok: true, output }), ms: Date.now() - started, first: first.trim(), tail };
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
  recordPass(root, command, result.ms);
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

export async function runTail({ planPath, plan, root, base, branch, runSession, logDir = path.join(root, SCRATCH_FOLDER), say = () => {}, attemptsLeft = 1 }) {
  const gateArgs = ['--plan', planPath, '--root', root, ...(base === null ? [] : ['--base', base])];
  const exo = path.join(root, SCRATCH_FOLDER);
  const baseText = base ?? 'HEAD';
  const criterionStop = await proveCriterion({ planPath, plan, root, logDir, runSession, say });
  if (criterionStop !== null) return { stop: criterionStop };
  const reviewedTree = workingTreeKey(root);
  const { review: branchReview, overlaps } = parseReviewLines(out(node(SCRIPT.verify, [...gateArgs, '--reviews-only'], root)));
  const reviewModel = agentModel();
  const dispatches = [
    ...(branchReview === null ? [] : [{ task: null, name: 'branch', key: BRANCH_REVIEW_KEY, model: agentModel(branchReview.kind), findings: path.join(exo, 'review-branch.md'), scope: `branch ${branchReview.range}`, questions: BRANCH_QUESTIONS }]),
    ...(overlaps.length === 0 ? [] : [{ task: null, name: 'overlap', key: OVERLAP_REVIEW_KEY, model: agentModel('review'), findings: path.join(exo, 'review-overlap.md'), scope: `overlap\n${overlaps.map((target) => `OVERLAP ${target}`).join('\n')}`, questions: [] }])
  ];
  const reports = dispatches.map((dispatch) => dispatch.findings);
  const review = async (dispatch) => {
    const name = dispatch.name;
    say(`review start: ${name}`);
    fs.rmSync(dispatch.findings, { force: true });
    const session = await runSession({ kind: 'review', task: dispatch.task, model: dispatch.model, prompt: reviewPrompt({ planPath, root, base: baseText, branch, ...dispatch }) });
    if (session.stop === undefined) {
      const text = session.resultText ?? '';
      const verdict = verdictOf(text);
      const found = countOf(text, 'defect') + countOf(text, 'concern') + countOf(text, 'question') + countOf(text, 'note');
      const model = session.model ?? 'unpinned';
      const outcome = session.timedOut ? `timed out (${model})` : verdict === null ? `no verdict line (${model})` : `${verdict} (${model}, ${found} findings)`;
      say(`review done: ${name}: ${outcome} (session ${session.sessionId ?? 'none'})`);
    }
    return session;
  };
  const fresh = dispatches.filter((dispatch) => !reusableReview(root, dispatch));
  for (const dispatch of dispatches) if (!fresh.includes(dispatch)) say(`review reused: ${dispatch.name}`);
  const sessions = await Promise.all(fresh.map(review));
  const stopped = sessions.find((session) => session.stop !== undefined);
  if (stopped !== undefined) {
    recordReviews(root, { fresh, sessions, tree: reviewedTree });
    return { stop: stopped.stop };
  }

  if (reports.length === 0) return finish(reviewedTree);
  const merged = out(node(SCRIPT.mergeReviews, ['--root', root, ...reports.flatMap((report) => ['--report', report])], root));
  const verdict = verdictOf(merged);
  const findings = path.join(exo, 'branch-review.md');
  recordReviews(root, { fresh, sessions, tree: reviewedTree });
  if (verdict === 'BLOCKED') return { stop: stopOf('branch review BLOCKED', 'The branch review could not finish (BLOCKED)', `read ${findings}, fix the cause, then run exo run again`) };
  if (verdict === 'FINDINGS' && countOf(merged, 'fix') + countOf(merged, 'concern') >= 1) {
    const untrackedBefore = new Set(untrackedPaths(root));
    const patchFile = path.join(logDir, 'review-fix-leftover.patch');
    const shelved = (first, recheckClean) => {
      const { patch, failed } = shelveLeftover(root, patchFile, untrackedBefore);
      const treeRestored = failed === undefined;
      const stop = recheckClean !== undefined && treeRestored ? recheckClean() : first;
      const notCleared = treeRestored ? '' : `; leftover not cleared: ${failed}`;
      if (patch !== null) return { stop: { ...stop, why: `${stop.why}; its edits are shelved in ${patch}${notCleared}`, next: `${stop.next}; the fix edits are in ${patch}` } };
      if (failed !== undefined) return { stop: { ...stop, why: `${stop.why}; shelving the edits failed: ${failed}` } };
      return { stop };
    };
    const fixReview = path.join(exo, 'fix-review.md');
    const fixAttempt = async (failedLine) => {
      say(failedLine === null ? 'fix start' : 'fix retry start');
      const note = failedLine === null ? '' : `\n\nThe previous fix failed: ${failedLine}\nThe tree holds that fix's edits; repair them so this check passes.`;
      const session = await runSession({ kind: 'fix', task: null, model: null, prompt: `${fixerPrompt({ planPath, root, base: baseText, findings })}${note}` });
      if (session.stop !== undefined) return { result: shelved(session.stop) };
      const gate = node(SCRIPT.verify, gateArgs, root);
      const failing = gateFailures(gate);
      if (failing.length > 0) return { failure: { line: failing[0], stop: fixBrokeGate(failing[0], findings), recheck: () => gateStop(failing, gateFailures(node(SCRIPT.verify, gateArgs, root)), findings) } };
      const probes = node(SCRIPT.runProbes, ['--report', findings, '--root', root], root);
      const failedProbe = out(probes).split('\n').find((line) => /^FAIL probe\b/.test(line));
      if (failedProbe !== undefined) return { failure: { line: failedProbe, stop: stopOf(`fix probe failed: ${failedProbe}`, 'A fixed finding still fails its probe', `read ${findings}, repair on the branch, then run exo run again`) } };
      const status = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
      if (status.status === 0 && status.stdout.trim() === '') {
        say('fix review skipped: fixer changed nothing');
        return { result: finish(reviewedTree) };
      }
      fs.rmSync(fixReview, { force: true });
      say('fix review start');
      const second = await runSession({ kind: 'review', task: null, model: reviewModel, prompt: reviewPrompt({ planPath, root, base: baseText, branch, scope: 'fix diff', findings: fixReview }) });
      if (second.stop !== undefined) return { result: shelved(second.stop) };
      const text = fs.existsSync(fixReview) ? fs.readFileSync(fixReview, 'utf8') : '';
      const secondVerdict = text.match(/\b(CLEAN|FINDINGS|BLOCKED)\b/)?.[1] ?? 'BLOCKED';
      say(`review done: fix diff: ${second.timedOut ? 'timed out' : secondVerdict} (session ${second.sessionId ?? 'none'})`);
      const fixLines = text.split('\n').filter((line) => /;\s*fix\s*$/.test(line));
      const reviewStop = () => stopOf(`fix review ${secondVerdict}`, `The review of the fix returned ${secondVerdict}`, `read ${fixReview}, then run exo run again`);
      if (secondVerdict === 'BLOCKED') return { result: shelved(reviewStop()) };
      if (secondVerdict === 'FINDINGS' && fixLines.length > 0) return { failure: { line: fixLines[0].trim(), stop: reviewStop() } };
      return {};
    };
    savePreFix(root, base, logDir);
    let attempt = await fixAttempt(null);
    if (attempt.failure !== undefined && attemptsLeft - 1 >= 1) attempt = await fixAttempt(attempt.failure.line);
    if (attempt.result !== undefined) return attempt.result;
    if (attempt.failure !== undefined) return shelved(attempt.failure.stop, attempt.failure.recheck);
    const scope = plan.tasks[0]?.title.match(/^\w+\(([^)]+)\)/)?.[1];
    const landed = node(SCRIPT.landTask, ['--fix', `fix${scope === undefined ? '' : `(${scope})`}: address the branch review`, '--plan', planPath, '--root', root], root);
    if (landed.status !== 0) return shelved(stopOf('fix landing failed', `Landing the review fix failed: ${out(landed).trim().split('\n').at(-1)}`, 'repair on the branch, then run exo run again'));
    say('fix landed');
    return finish(workingTreeKey(root));
  }
  return finish(reviewedTree);

  function finish(reviewPassTree) {
    if (reports.length > 0) recordPass(root, BRANCH_REVIEW_KEY, 0, reviewPassTree);
    const gate = node(SCRIPT.verify, gateArgs, root);
    const unproven = unprovenRisks(path.join(exo, 'branch-review.md'));
    if (unproven.length === 0) return { gate };
    return { gate: { status: gate.status, stdout: `${gate.stdout ?? ''}${unproven.map((line) => `WARN Unproven risk: ${line}\n`).join('')}`, stderr: gate.stderr } };
  }
}
