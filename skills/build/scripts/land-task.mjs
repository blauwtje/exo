import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { dataLiterals, literalFinder } from '#data-literals';
import { exportSignatures } from '#export-signatures';
import { runTreeSync, withoutRunVariables } from '#process-tree';
import { environmentMs, parseFlags, UsageError, isMain } from '#script-flags';
import { SCRIPT_EXTENSIONS } from '#script-extensions';
import { BLOCK_TASK_LIMIT, decisionsPathOf, defaultBase, frameOf, isCovered, isolatedCheckout, isPlanDoc, landedTasks, nextWave, parsePlan, PlanError, planIdOf, planRoute, planTaskTrailer, proofRecordPath, routeLine, waveLine } from '#plan-tasks';
import { SCRATCH_FOLDER } from '#scratch-path';
import { cachedPass, lastPassMs, recordPass, SLOW_GATE_MS, workingTreeKey } from '#check-cache';
import { mcpToolCall } from '#mcp-tool-call';
import { isTestFirst, runOnBase, testPaths } from '#red-green';
import { CODE_RULE_LIMITS, codeRuleFindings } from '#code-rules';
import { attributionProblem, subjectProblem } from '#commit-text';

export class LandingError extends Error {}

export class PlanDriftError extends LandingError {}

function shellQuote(value) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function trailersOf(planId, number, signatures) {
  return [planTaskTrailer(planId, number), ...signatures.map((signature) => `Signature: ${signature}`)].join('\n');
}

function dropsOf(task) {
  return task.section.match(/^Depends on: .*?\| Drops: ([^|\n]*?) *(?:\||$)/m)?.[1] || null;
}

function deriveCommit(task, number, planId, signatures, root) {
  if (task.files.length === 0) {
    throw new LandingError(`Task ${number} has no Commit: block and no Files: to derive one from`);
  }
  // why: git add refuses a path that matches neither the index nor the tree, so a path already staged as deleted stays out of it; with rename detection off, the old path of a git mv counts as a staged deletion.
  const removed = new Set(execFileSync('git', ['-C', root, 'diff', '--cached', '--name-only', '--no-renames', '--diff-filter=D'], { encoding: 'utf8' }).split('\n'));
  const addArgs = task.files.filter((file) => !removed.has(file.path)).map((file) => shellQuote(file.path)).join(' ');
  const addLine = addArgs === '' ? '' : `git add ${addArgs}\n`;
  const drops = dropsOf(task);
  const trailers = trailersOf(planId, number, signatures) + (drops === null ? '' : `\nDrops: ${drops}`);
  return `${addLine}git commit -m ${shellQuote(task.title)} -m ${shellQuote(trailers)}`;
}

function parsePin(value) {
  if (value === undefined) return null;
  const match = value.match(/^([^/\s]+)\/(\d+)$/);
  if (match === null) throw new LandingError(`EXO_RUN_TASK '${value}' is not <plan-id>/<task number>`);
  return { planId: match[1], number: Number(match[2]) };
}

function refuseOutsidePin(pin, planPath, number) {
  if (pin === null) return;
  if (pin.planId !== planIdOf(planPath) || pin.number !== number) {
    throw new LandingError(`EXO_RUN_TASK pins this run to ${pin.planId}/${pin.number}; Task ${number} of ${planIdOf(planPath)} is refused`);
  }
}

function refuseOtherPlan(pin, planPath, number) {
  if (pin !== null && pin.planId !== planIdOf(planPath)) {
    throw new LandingError(`EXO_RUN_TASK pins this run to ${pin.planId}/${pin.number}; Task ${number} of ${planIdOf(planPath)} is refused`);
  }
}

function refuseMcpProofUnderPin(pin, task) {
  if (pin !== null && mcpProofOf(task) !== null) {
    throw new LandingError(`EXO_RUN_TASK refuses Task ${task.number}: its Proof is an MCP call, which only an interactive session can run`);
  }
}

function refuseMismatchedToplevel(root) {
  const resolvedRoot = realpathSync(root);
  const toplevel = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const resolvedToplevel = realpathSync(toplevel);
  if (resolvedToplevel !== resolvedRoot) {
    throw new LandingError(`--root '${root}' is not the checkout toplevel: git rev-parse --show-toplevel there prints '${toplevel}'`);
  }
}

function refuseBadCommitText(subject, rest = '') {
  const problem = subjectProblem(subject) ?? attributionProblem(`${subject}\n${rest}`);
  if (problem !== null) throw new LandingError(`commit text refused: ${problem}`);
}

export function fixLand({ root, subject, plan = null, pin = null }) {
  if (pin !== null) throw new LandingError(`EXO_RUN_TASK pins this run to ${pin.planId}/${pin.number}; --fix is refused`);
  refuseMismatchedToplevel(root);
  refuseBadCommitText(subject);
  const status = execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' });
  if (status.trim() === '') {
    throw new LandingError('no changed path to commit');
  }
  if (plan !== null) runLint(frameOf(parsePlan(fs.readFileSync(plan, 'utf8')).frame).lint, changedPaths(root), root);
  execFileSync('git', ['-C', root, 'add', '-A'], { encoding: 'utf8' });
  execFileSync('git', ['-C', root, 'commit', '-m', subject], { encoding: 'utf8' });
  const sha = execFileSync('git', ['-C', root, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  return `Committed: ${sha}\n`;
}

export function commitBlockOf(plan, number, planId, signatures = [], root = '.') {
  const task = plan.tasks.find((entry) => entry.number === number);
  if (task === undefined) throw new UsageError(`no Task ${number} in the plan`);
  if (task.commitBlock !== null) {
    if (!task.commitBlock.includes(`"Plan-task: ${number}"`)) {
      throw new LandingError(`the Commit: block of Task ${number} carries no "Plan-task: ${number}" trailer`);
    }
    return task.commitBlock.replace(`"Plan-task: ${number}"`, shellQuote(trailersOf(planId, number, signatures)));
  }
  if (task.compact) return deriveCommit(task, number, planId, signatures, root);
  throw new LandingError(`Task ${number} has no Commit: block`);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ANY_OUTCOME_LINE = /^\s*(?:[-*]\s+)?(?:`([^`]+)`|(.+)):\s*(.*?)\s*$/;
const REPORT_FIELDS = new Set(['Landed', 'Proof', 'Unresolved']);
const PROOF_TIMEOUT_MS = 540_000;
const PROOF_TAIL_LINES = 20;
const RED_FIELD_LINE = /^\s*(?:[-*]\s+)?(?:Test first|Red):/;
function provedCommand(task, lines, reportPath) {
  if (task.proof !== null) return task.proof.replace(/^`(.*)`$/, '$1');
  for (const line of lines) {
    const match = line.match(ANY_OUTCOME_LINE);
    const command = match?.[1] ?? match?.[2];
    if (command !== undefined && match[3] !== '' && !REPORT_FIELDS.has(command)) return command;
  }
  throw new LandingError(`Task ${task.number}: no Proof: command, and the build report has no "<test>: pass" line${expectedLayout(task, reportPath)}`);
}

const FAILED_OUTCOME = /^fail(?:ed|s|ing)?\b/i;
const BARE_FAILED_OUTCOME = /^fail(?:ed)?(?:\s*\(.*\))?$/i;
const PROOF_FIELD_LINE = /^\s*(?:[-*]\s+)?Proof:\s*(.*)$/;
const SECTION_END_LINE = /^\s*(?:[-*]\s+)?(?:Landed|Unresolved|Report|Choice):/;

function proofSectionOf(lines) {
  const start = lines.findIndex((line) => PROOF_FIELD_LINE.test(line));
  const section = start === -1 ? lines : [lines[start].match(PROOF_FIELD_LINE)[1], ...lines.slice(start + 1)];
  const end = section.findIndex((line, index) => (start === -1 || index > 0) && SECTION_END_LINE.test(line));
  return end === -1 ? section : section.slice(0, end);
}

function refuseFailedCommand(task, lines) {
  for (const line of proofSectionOf(lines)) {
    const match = line.match(ANY_OUTCOME_LINE);
    const command = match?.[1] ?? match?.[2];
    if (command === undefined || REPORT_FIELDS.has(command)) continue;
    const failing = match[1] === undefined ? BARE_FAILED_OUTCOME : FAILED_OUTCOME;
    if (!failing.test(match[3])) continue;
    throw new LandingError(`Task ${task.number}: the build report lists "${command}: ${match[3]}" under Proof, no clear pass`);
  }
}

function expectedLayout(task, reportPath, command = null) {
  const written = command ?? (task.proof === null ? '<test command>' : task.proof.replace(/^`(.*)`$/, '$1'));
  const outcome = mcpProofOf(task) === null ? 'pass' : 'deferred';
  return `\nExpected under Proof: in ${reportPath}:\n${written}: ${outcome}`;
}

function reportLinesOf(task, reportText, reportPath) {
  if (reportText === null) {
    const wanted = task.proof === null ? 'a test for the Success criterion' : `"${task.proof}"`;
    throw new LandingError(`Task ${task.number}: no build report at '${reportPath}' to prove ${wanted}${expectedLayout(task, reportPath)}`);
  }
  const lines = reportText.replace(/\r\n/g, '\n').split('\n');
  const kept = [];
  let redIndent = null;
  for (const line of lines) {
    const indent = line.length - line.trimStart().length;
    if (redIndent !== null && line.trim() !== '' && indent > redIndent) continue;
    redIndent = RED_FIELD_LINE.test(line) ? indent : null;
    if (redIndent === null) kept.push(line);
  }
  return kept;
}

function outcomesOf(command, lines) {
  const outcomeLine = new RegExp(`^(\\s*)(?:[-*]\\s+)?(?:Proof:\\s*)?\`?${escapeRegExp(command)}\`?:\\s*(.*?)\\s*$`);
  return lines.flatMap((line, index) => {
    const match = line.match(outcomeLine);
    return match === null ? [] : [{ outcome: match[2].toLowerCase(), indent: match[1].length, index }];
  });
}

export function mcpProofOf(task) {
  if (task.proof === null) return null;
  return mcpToolCall(task.proof.replace(/^`(.*)`$/, '$1'));
}

export function deferredProofOf(task, call, reportText, reportPath) {
  const lines = reportLinesOf(task, reportText, reportPath);
  const written = provedCommand(task, lines, reportPath);
  const outcomes = [...new Set([written, call])].flatMap((command) => outcomesOf(command, lines).map((entry) => ({ ...entry, command })));
  if (outcomes.length === 0) {
    throw new LandingError(`Task ${task.number}: the build report has no "${written}: deferred" line${expectedLayout(task, reportPath, written)}`);
  }
  const undeferred = outcomes.find(({ outcome }) => !/^deferred\b/.test(outcome));
  if (undeferred !== undefined) {
    throw new LandingError(`Task ${task.number}: the build report reads "${undeferred.command}: ${undeferred.outcome}", yet only the session runs an MCP tool Proof; report it deferred`);
  }
  refuseFailedCommand(task, lines);
  return call;
}

function proofCommandOf(task, reportText, reportPath) {
  const lines = reportLinesOf(task, reportText, reportPath);
  const command = provedCommand(task, lines, reportPath);
  refuseFailedCommand(task, lines);
  return command;
}

const QUIET_LINES = 20;
const quiet = { file: null, proofOutput: '' };

function quietText(text, ok) {
  const all = text.split('\n').filter((line) => line.trim() !== '');
  const lines = ok ? all.filter((line) => !/^(?:Landed|Route|Next|Wave): /.test(line)) : all;
  const kept = lines.length < QUIET_LINES ? lines : [lines[0], ...lines.slice(-(QUIET_LINES - 2))];
  fs.mkdirSync(path.dirname(quiet.file), { recursive: true });
  fs.appendFileSync(quiet.file, `${ok ? '' : text.trimEnd()}\n--- full output ---\n${text}${quiet.proofOutput}`);
  return `${[...kept, `Full output: ${quiet.file}`].join('\n')}\n`;
}

function runProof(task, command, root, field) {
  if (cachedPass(root, command) !== null) return { command, tail: ['  passed already on this tree, not rerun'] };
  const before = workingTreeKey(root);
  const started = Date.now();
  const deadlineMs = environmentMs('EXO_PROOF_TIMEOUT_MS', PROOF_TIMEOUT_MS);
  const proofRun = runTreeSync(command, { cwd: root, timeoutMs: deadlineMs, env: withoutRunVariables() });
  if (quiet.file !== null) quiet.proofOutput += `${command}\n${proofRun.output}\n`;
  const tail = proofRun.output.split(/\r?\n/).filter((line) => line.trim() !== '').slice(-PROOF_TAIL_LINES).map((line) => `  ${line}`);
  if (proofRun.status === 0 && !proofRun.timedOut) {
    recordPass(root, command, Date.now() - started, before);
    return { command, tail };
  }
  let reason = `exit ${proofRun.status}`;
  if (proofRun.timedOut) reason = `timed out after ${deadlineMs / 1000}s`;
  else if (proofRun.error !== undefined) reason = `spawn error ${proofRun.error.message}`;
  else if (proofRun.signal !== null) reason = `signal ${proofRun.signal}`;
  throw new LandingError([`Task ${task.number}: the ${field}: command "${command}" failed (${reason}):`, ...tail].join('\n'));
}

const TEST_FILE = /^tests\/[\w.-]+\.test\.mjs$/;

function namedTestFiles(task, proofCommands, { root, planPath }) {
  const named = [...changedPaths(root, planPath), ...task.files.map((file) => file.path)];
  return [...new Set(named)].filter((file) => TEST_FILE.test(file)
    && fs.existsSync(path.join(root, file))
    && !proofCommands.some((command) => command.includes(file)));
}

function runNamedTests(task, proofCommands, options) {
  const deadlineMs = environmentMs('EXO_PROOF_TIMEOUT_MS', PROOF_TIMEOUT_MS);
  for (const file of namedTestFiles(task, proofCommands, options)) {
    const testRun = runTreeSync(`node --test ${file}`, { cwd: options.root, timeoutMs: deadlineMs, env: withoutRunVariables() });
    if (quiet.file !== null) quiet.proofOutput += `node --test ${file}\n${testRun.output}\n`;
    if (testRun.status === 0 && !testRun.timedOut) continue;
    const reason = testRun.timedOut ? `timed out after ${deadlineMs / 1000}s` : `exit ${testRun.status}`;
    const tail = testRun.output.split(/\r?\n/).filter((line) => line.trim() !== '').slice(-PROOF_TAIL_LINES).map((line) => `  ${line}`);
    throw new LandingError([`Task ${task.number}: the test file ${file} failed (${reason}):`, ...tail].join('\n'));
  }
}

const CHOICE_LINE =/^\s*(?:[-*]\s+)?Choice:\s*(.+?)\s*$/;

function appendDecisions({ planPath, reportText, taskCount, number, sha }) {
  if (planPath === undefined || reportText === null || taskCount <= BLOCK_TASK_LIMIT) return;
  const choices = reportText.replace(/\r\n/g, '\n').split('\n').flatMap((line) => {
    const match = line.match(CHOICE_LINE);
    return match === null ? [] : [`Task ${number} ${sha}: ${match[1]}\n`];
  });
  if (choices.length > 0) fs.appendFileSync(decisionsPathOf(planPath), choices.join(''));
}

function untrackedPaths(root) {
  return execFileSync('git', ['-C', root, 'ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\n');
}

function changedPaths(root, planPath) {
  const tracked = execFileSync('git', ['-C', root, 'diff', '--name-only', 'HEAD'], { encoding: 'utf8' });
  const scratchPrefix = `${SCRATCH_FOLDER}/`;
  const exempt = planPath === undefined ? [] : [planPath, decisionsPathOf(planPath)].map((file) => path.relative(path.resolve(root), path.resolve(file)));
  return [...new Set([...tracked.split('\n'), ...untrackedPaths(root)])]
    .filter((line) => line !== '' && !line.startsWith(scratchPrefix) && !exempt.includes(line));
}

function unplannedPaths(task, { root, planPath, siblingWork = () => false }) {
  const entries = task.files.map((file) => file.path);
  return changedPaths(root, planPath).filter((changed) => !isCovered(entries, changed) && !siblingWork(changed));
}

function siblingWorkOf(plan, task, { root, planPath, landing }) {
  const written = landing && (task.commitBlock !== null || !task.compact);
  const added = written ? addedPathspecs(task.commitBlock ?? '') : [];
  if (added === null) return () => false;
  const landed = landedTasks(plan.tasks, root, planIdOf(planPath));
  const entries = plan.tasks
    .filter((other) => other.number !== task.number && !landed.includes(other.number))
    .flatMap((other) => other.files.map((file) => file.path));
  const named = plan.tasks.flatMap((other) => other.files.map((file) => file.path));
  const staged = landing ? execFileSync('git', ['-C', root, 'diff', '--cached', '--name-only'], { encoding: 'utf8' }).split('\n') : [];
  const untracked = written ? new Set(untrackedPaths(root)) : null;
  const siblingFile = (changed) => isCovered(entries, changed) && (!written || (untracked.has(changed) && !isCovered(added, changed)));
  const planDoc = (changed) => isPlanDoc(changed) && !isCovered(named, changed) && !isCovered(added, changed);
  return (changed) => !staged.includes(changed) && (siblingFile(changed) || planDoc(changed));
}

const STAGES_ALL = /^(?:\.|\.\/|-A|--all|:\/|.*[*?[].*)$/;

function addedPathspecs(commitBlock) {
  const specs = [...commitBlock.matchAll(/\bgit\s+add\b([^;&|\n]*)/g)]
    .flatMap((match) => match[1].trim().split(/\s+/))
    .map((arg) => arg.replace(/^['"]|['"]$/g, ''))
    .filter((arg) => arg !== '' && arg !== '--' && !/^-(?!A$|-all$)/.test(arg));
  if (specs.some((spec) => STAGES_ALL.test(spec))) return null;
  return specs.flatMap((spec) => [spec, `${spec.replace(/\/$/, '')}/`]);
}

function sourceAtHead(root, file) {
  const shown = spawnSync('git', ['-C', root, 'show', `HEAD:${file}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return shown.status === 0 ? shown.stdout : null;
}

function outsideCallers(root, name, inFiles) {
  const pathspecs = [...SCRIPT_EXTENSIONS].map((extension) => `*${extension}`);
  const found = spawnSync('git', ['-C', root, 'grep', '-l', '-w', '-F', '-e', name, '--', ...pathspecs], { encoding: 'utf8' });
  // why: git grep exits 1 when nothing matches, so only a higher status is a failure.
  if (found.error !== undefined || found.status > 1) {
    throw new LandingError(`git grep for callers of ${name} failed: ${found.error?.message ?? found.stderr.trim()}`);
  }
  return found.stdout.split('\n').filter((file) => file !== '' && !isCovered([...inFiles], file));
}

function breaksCallers(before, after) {
  return after.required > before.required || after.total < before.total || (before.hasRest && !after.hasRest);
}

function signatureChanges(task, root) {
  const inFiles = new Set(task.files.map((file) => file.path));
  const changes = [];
  const drifts = [];
  for (const file of inFiles) {
    if (file.endsWith('/') || !SCRIPT_EXTENSIONS.has(path.extname(file))) continue;
    const before = sourceAtHead(root, file);
    const workingPath = path.join(root, file);
    if (before === null || !fs.existsSync(workingPath)) continue;
    const after = exportSignatures(fs.readFileSync(workingPath, 'utf8'));
    for (const [name, oldParameters] of exportSignatures(before)) {
      const newParameters = after.get(name);
      if (newParameters === undefined || !breaksCallers(oldParameters, newParameters)) continue;
      const change = `${file}:${name}(${oldParameters.text}) -> (${newParameters.text})`.replace(/\s+/g, ' ');
      changes.push(change);
      const callers = outsideCallers(root, name, inFiles);
      if (callers.length > 0) drifts.push(`PLAN DRIFT: Task ${task.number}: ${change}; callers outside Files: ${callers.join(', ')}`);
    }
  }
  if (drifts.length > 0) throw new PlanDriftError(drifts.join('\n'));
  return changes;
}

function runLint(lint, files, root) {
  if (lint === null || lint === 'none') return;
  const paths = files
    .filter((file) => !file.endsWith('/') && SCRIPT_EXTENSIONS.has(path.extname(file)) && fs.existsSync(path.join(root, file)));
  if (paths.length === 0) return;
  const [command, ...args] = [...lint.split(/\s+/), ...paths];
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error?.message ?? ''}`.trim();
    throw new LandingError(`Lint "${lint}" failed:\n${output}`);
  }
}

const CODE_RULE_FIXES = {
  'max-depth': 'less nesting',
  'max-params': 'one options object',
  'no-nested-ternary': 'an if or a lookup',
  'no-else-return': 'drop the else after return',
  comment: 'remove it or make the code clearer',
  suppression: 'remove it or make the code clearer',
};

function codeRuleHints(fails) {
  return Object.entries(CODE_RULE_FIXES)
    .filter(([rule]) => fails.some((fail) => fail.split(' ')[1] === rule))
    .map(([rule, fix]) => `Fix for ${rule}: ${fix}.\n`)
    .join('');
}

function runCodeRules(files, root) {
  const { fails, warns } = codeRuleFindings({ root, base: 'HEAD', paths: files.filter((file) => !file.endsWith('/')) });
  if (fails.length > 0) {
    throw new LandingError(`the added code breaks the code rules:\n${fails.join('\n')}\n${codeRuleHints(fails)}The ${CODE_RULE_LIMITS}.`);
  }
  return warns.map((warn) => `Code rule warning: ${warn}\n`).join('');
}

function runLandGate(landGate, root, drops = null) {
  if (landGate === null || landGate === 'none') return null;
  if (cachedPass(root, landGate) !== null) return `Land gate "${landGate}" skipped: it already passed on this tree.\n`;
  const last = lastPassMs(root, landGate);
  if (last !== null && last >= SLOW_GATE_MS) {
    return `Land gate "${landGate}" skipped: its last pass took ${last} ms, so verify runs it once.\n`;
  }
  const before = workingTreeKey(root);
  const started = Date.now();
  const deadlineMs = environmentMs('EXO_LAND_GATE_TIMEOUT_MS', PROOF_TIMEOUT_MS);
  const outerDrops = process.env.EXO_DROPS;
  if (drops === null) delete process.env.EXO_DROPS;
  else process.env.EXO_DROPS = drops;
  let gate;
  try {
    gate = runTreeSync(landGate, { cwd: root, timeoutMs: deadlineMs });
  } finally {
    if (outerDrops === undefined) delete process.env.EXO_DROPS;
    else process.env.EXO_DROPS = outerDrops;
  }
  if (gate.status !== 0 || gate.timedOut) {
    const timedOut = gate.timedOut ? `timed out after ${deadlineMs / 1000}s` : '';
    const output = `${gate.output}${timedOut || (gate.error?.message ?? '')}`.trim();
    throw new LandingError(`Land gate "${landGate}" failed:\n${output}`);
  }
  recordPass(root, landGate, Date.now() - started, before);
  return '';
}

const PASS_SUMMARY_LINE = /^(?:ℹ |# )?pass \d+\b|\b\d+ (?:passing|passed)\b|^Tests:/;
const TIMING_LINE = /^(?:ℹ |# )?duration_ms\b|^(?:Time|Duration|Done in)\b/;

function proofOutcomeOf(tail) {
  const lines = tail.map((line) => line.trim()).filter((line) => !TIMING_LINE.test(line));
  const outcome = lines.findLast((line) => PASS_SUMMARY_LINE.test(line)) ?? lines.at(-1) ?? 'no output';
  return `exit 0, ${outcome}`;
}

function writeProofRecord({ root, planId, number, proofs, redLine }) {
  const lines = [...proofs.map(({ command, tail }) => `Proof: \`${command}\` -> ${proofOutcomeOf(tail)}\n`), `${redLine}\n`];
  const record = proofRecordPath(root, planId, number);
  fs.mkdirSync(path.dirname(record), { recursive: true });
  fs.writeFileSync(record, lines.join(''));
}

function taskChangedPaths(root) {
  const entries = execFileSync('git', ['-C', root, 'status', '--porcelain', '-z', '-uall'], { encoding: 'utf8' }).split('\0').filter((entry) => entry !== '');
  const paths = [];
  for (let i = 0; i < entries.length; i++) {
    paths.push(entries[i].slice(3));
    if (/[RC]/.test(entries[i].slice(0, 2))) paths.push(entries[++i]);
  }
  return paths;
}

const UNTAGGED_LOOKBACK = 20;

function untaggedBaseNote(task, root) {
  const files = task.files.map((file) => file.path);
  if (files.length === 0) return '';
  const base = defaultBase(root);
  const range = base === null ? ['-n', String(UNTAGGED_LOOKBACK), 'HEAD'] : [`${base}..HEAD`];
  const log = execFileSync('git', ['-C', root, 'log', '--no-merges', '--invert-grep', '--grep=^Plan-task: ', '--format=%h %s', ...range, '--', ...files], { encoding: 'utf8' });
  const commits = log.split('\n').filter((line) => line !== '');
  if (commits.length === 0) return '';
  return `\nBase commits touching this task's files without a Plan-task trailer: ${commits.join(', ')}; the fix may already be on the base.`;
}

function redGreenLine(task, proofCommands, root, pending) {
  if (task.red !== null) return `Red: skipped: none (${task.red.reason})`;
  if (pending !== null) return 'Red: skipped: deferred MCP proof';
  if (proofCommands.length === 0) return 'Red: skipped: no passing Bash proof command';
  const overlay = testPaths(taskChangedPaths(root));
  const timeoutMs = environmentMs('EXO_PROOF_TIMEOUT_MS', PROOF_TIMEOUT_MS);
  let sha = '';
  for (const command of proofCommands) {
    const base = runOnBase({ root, base: 'HEAD', command, overlay, timeoutMs, headMs: cachedPass(root, command)?.ms });
    sha = base.sha.slice(0, 7);
    if (base.status === 'error') {
      throw new LandingError(`Task ${task.number}: the red-green check of "${command}" on ${sha || 'HEAD'} failed to finish:\n${base.output.trim().split('\n').slice(-PROOF_TAIL_LINES).join('\n')}`);
    }
    if (base.status === 'red') return 'Red: proved';
  }
  throw new LandingError(`Task ${task.number}: Proof passes on ${sha} without the production change: no red proof; tighten the test or add \`Red: none (<reason>)\` to the task${untaggedBaseNote(task, root)}`);
}

// why: verify's claims-diff check refuses the same commit, but only at the end of the run.
function refuseUntestedTestFirst(task, root) {
  if (isTestFirst(task) && testPaths(taskChangedPaths(root)).length === 0) {
    throw new LandingError(`Task ${task.number} is test-first, but its change adds or changes no test file; add the failing test the task names`);
  }
}

function refuseMissingLiterals(task, root, planPath = null) {
  if (task.literals !== null || !task.data) return;
  const literals = dataLiterals(task.data);
  if (literals.length === 0) return;
  const found = literalFinder(root, planPath);
  const missing = [...new Set(literals)].filter((literal) => !found(literal));
  if (missing.length > 0) {
    throw new LandingError(`Task ${task.number}: Data: names ${missing.map((literal) => `\`${literal}\``).join(', ')}, found in neither its change nor the tree; fix the string, or add \`Literals: none (<reason>)\` to the task if it is prose`);
  }
}

function refuseUnplannedPaths(task, options) {
  const unplanned = unplannedPaths(task, options);
  if (unplanned.length > 0) {
    throw new LandingError(`Task ${task.number} changed a path outside Files: ${unplanned.map((file) => `\`${file}\``).join(', ')}`);
  }
}

// A long-format task's proof: each distinct `Run:` command some step expects
// to pass, never one only a test-first red step or a failure demo runs, nor an
// MCP call only the session can make.
function passingRunsOf(task) {
  return [...new Set(task.runs.filter((run) => run.expectsPass && mcpToolCall(run.command) === null).map((run) => run.command))];
}

function checkReport(task, reportText, reportPath) {
  const mcpCall = task.compact ? mcpProofOf(task) : null;
  const pending = mcpCall === null ? null : deferredProofOf(task, mcpCall, reportText, reportPath);
  const proofCommand = task.compact && pending === null ? proofCommandOf(task, reportText, reportPath) : null;
  return { proofCommand, pending };
}

/**
 * The unplanned-path and report checks landTask runs first, then Lint and the Land
 * gate as landTask runs them, a failure refusing closed: nothing runs the
 * Proof or commits, so a builder can run it before it reports and fix a
 * trivial gate failure itself.
 */
export function checkTask({ planText, number, root, reportText = null, reportPath = '--report', planPath, pin = null }) {
  refuseOtherPlan(pin, planPath, number);
  refuseMismatchedToplevel(root);
  const plan = parsePlan(planText);
  const task = plan.tasks.find((entry) => entry.number === number);
  if (task === undefined) throw new UsageError(`no Task ${number} in the plan`);
  refuseMcpProofUnderPin(pin, task);
  refuseUnplannedPaths(task, { root, planPath, siblingWork: siblingWorkOf(plan, task, { root, planPath, landing: false }) });
  checkReport(task, reportText, reportPath);
  const frame = frameOf(plan.frame);
  runLint(frame.lint, task.files.map((file) => file.path), root);
  const warnLines = runCodeRules(task.files.map((file) => file.path), root);
  const gateLine = warnLines + (runLandGate(frame.landGate, root, dropsOf(task)) ?? '');
  return `${gateLine}Report OK: Task ${number}\n`;
}

export function checkCodeRules({ planText, number, root, planPath, pin = null }) {
  refuseOtherPlan(pin, planPath, number);
  const task = parsePlan(planText).tasks.find((entry) => entry.number === number);
  if (task === undefined) throw new UsageError(`no Task ${number} in the plan`);
  return `${runCodeRules(task.files.map((file) => file.path), root)}Code rules OK: Task ${number}\n`;
}

export function landTask({ planText, number, root, reportText = null, reportPath = '--report', planPath, pin = null }) {
  refuseOutsidePin(pin, planPath, number);
  refuseMismatchedToplevel(root);
  const plan = parsePlan(planText);
  const planId = planIdOf(planPath);
  const task = plan.tasks.find((entry) => entry.number === number);
  if (task === undefined) throw new UsageError(`no Task ${number} in the plan`);
  refuseMcpProofUnderPin(pin, task);
  refuseUnplannedPaths(task, { root, planPath, siblingWork: siblingWorkOf(plan, task, { root, planPath, landing: true }) });
  refuseUntestedTestFirst(task, root);
  refuseMissingLiterals(task, root, planPath);
  const block = commitBlockOf(plan, number, planId, signatureChanges(task, root), root);
  refuseBadCommitText(task.commitSubject ?? task.title, block);
  const { proofCommand, pending } = checkReport(task, reportText, reportPath);
  const proofCommands = proofCommand === null ? passingRunsOf(task) : [proofCommand];
  const proofs = proofCommands.map((command) => runProof(task, command, root, task.compact ? 'Proof' : 'Run'));
  runNamedTests(task, proofCommands, { root, planPath });
  const redLine = redGreenLine(task, proofCommands, root, pending);
  const frame = frameOf(plan.frame);
  runLint(frame.lint, task.files.map((file) => file.path), root);
  const warnLines = runCodeRules(task.files.map((file) => file.path), root);
  const gateLine = warnLines + (runLandGate(frame.landGate, root, dropsOf(task)) ?? '');
  // The block runs under bash, as the plugin's hooks do; a host without bash
  // fails those hooks before this script runs.
  const commit = spawnSync('bash', ['-e', '-c', block], { cwd: root, encoding: 'utf8' });
  if (commit.status !== 0) {
    const output = `${commit.stdout ?? ''}${commit.stderr ?? ''}${commit.error?.message ?? ''}`.trim();
    throw new LandingError(`the Commit: block of Task ${number} failed:\n${output}`);
  }
  const head = execFileSync('git', ['-C', root, 'log', '-1', '--format=%h%n%s%n%B'], { encoding: 'utf8' });
  const [sha, subject, ...body] = head.split('\n');
  const trailer = planTaskTrailer(planId, number);
  if (!body.includes(trailer)) {
    throw new LandingError(`HEAD ${sha} carries no "${trailer}" trailer`);
  }
  // bash expands the block, so a `$` or backquote in its subject can commit a
  // subject the plan does not give.
  const expectedSubject = task.commitSubject ?? task.title;
  if (subject !== expectedSubject) {
    throw new LandingError(`HEAD ${sha} carries "${trailer}", yet its subject reads "${subject}" and the plan gives "${expectedSubject}"`);
  }
  const landed = landedTasks(plan.tasks, root, planId);
  appendDecisions({ planPath, reportText, taskCount: plan.tasks.length, number, sha });
  writeProofRecord({ root, planId, number, proofs, redLine });
  const proofLines = proofs.map(({ command, tail }) => `Proof: ${[`${command}: pass (exit 0)`, ...tail].join('\n')}\n`).join('');
  const pendingLine = pending === null ? '' : `Pending: ${pending}\n`;
  const route = planRoute(plan.tasks);
  // The inline route builds in the run checkout, never in a wave's worktrees.
  const wave = nextWave(plan.tasks, landed, route.route === 'inline' || isolatedCheckout(root) ? null : frame.worktreeSetup, frame.parallel);
  return `Committed: ${sha} Task ${number}\n${proofLines}${gateLine}${pendingLine}Landed: ${landed.join(', ')}\n${routeLine(route)}\n${waveLine(wave)}\n`;
}

function main(argv) {
  const flags = parseFlags(argv, { plan: 'value', task: 'value', root: 'value', report: 'value', fix: 'value', check: 'boolean', 'code-rules': 'boolean' });
  const root = flags.root ?? process.cwd();
  const pin = parsePin(process.env.EXO_RUN_TASK);
  const codeRulesOnly = flags['code-rules'] === true;
  if (pin !== null && !codeRulesOnly && flags.check !== true) quiet.file = proofRecordPath(root, pin.planId, pin.number);
  if (flags.fix !== undefined) {
    process.stdout.write(fixLand({ root, subject: flags.fix, plan: flags.plan ?? null, pin }));
    return;
  }
  if (flags.plan === undefined) throw new UsageError("flag '--plan' names the plan file");
  if (!/^\d+$/.test(flags.task ?? '')) throw new UsageError("flag '--task' needs a task number");
  if (!fs.existsSync(flags.plan)) throw new UsageError(`no plan at '${flags.plan}'`);
  const planText = fs.readFileSync(flags.plan, 'utf8');
  if (codeRulesOnly) {
    process.stdout.write(checkCodeRules({ planText, number: Number(flags.task), root, planPath: flags.plan, pin }));
    return;
  }
  // The implementer prompt's `Report to:` path, so a wave's per-task worktree
  // finds its own report with no extra flag.
  const reportPath = flags.report ?? path.join(root, '.exo', `implementer-${flags.task}.md`);
  const reportText = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, 'utf8') : null;
  const run = flags.check === true ? checkTask : landTask;
  const output = run({ planText, number: Number(flags.task), root, reportText, reportPath, planPath: flags.plan, pin });
  process.stdout.write(quiet.file === null ? output : quietText(output, true));
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    const report = (message) => process.stderr.write(quiet.file === null ? message : quietText(message, false));
    if (error instanceof UsageError) {
      process.stderr.write(`land-task: ${error.message}\n`);
      process.exitCode = 2;
    } else if (error instanceof PlanDriftError) {
      report(`${error.message}\n`);
      process.exitCode = 1;
    } else if (error instanceof LandingError || error instanceof PlanError) {
      report(`land-task: ${error.message}\n`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}
