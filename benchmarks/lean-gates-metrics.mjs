#!/usr/bin/env node
// benchmarks/lean-gates-metrics.mjs
// Metrics for the lean-gates benchmark (old d33adf37 vs new a8b27a45): one
// record per run dir <out>/<NN>-<old|new>/, written to <out>/metrics.json,
// plus a markdown table on stdout.
//
//   node benchmarks/lean-gates-metrics.mjs <out> [--no-recheck] [--force-recheck]
//
// Sources, named on every number in metrics.json:
// - "meta": meta.json wallMs, startedAt, endedAt (the harness clock).
// - "commit-ts": committer time (1 s resolution) of the fixture repo commits.
//   Build per task = commit time of its Plan-task commit minus the previous
//   Plan-task commit, the first minus meta.startedAt. Under parallel waves the
//   delta is the landing gap, not the build time; buildTaskAgents carries the
//   per-task build-task subagent span from the transcript instead.
// - "transcript-ts": ISO timestamps of main-transcript lines.
//   build   = meta.startedAt (else first line) -> verify start.
//   verify start = first Skill tool_use whose skill ends in "verify", else the
//            first Bash tool_use whose command holds "verify.mjs".
//   gate    = sum of (tool_use -> tool_result) of main Bash calls from verify
//            start up to the reviewer dispatch whose command holds verify.mjs
//            or a gate command (npm test|run typecheck|run lint|run check, tsc,
//            eslint, node --test, vitest); span = verify start -> dispatch.
//   review  = Agent tool_use whose subagent_type holds "review-branch" -> its
//            return: the tool_result line when synchronous (claude -p), else
//            the <task-notification> naming its tool-use id, else the last
//            line of its subagent transcript.
//   fix     = the same for the "fix-review" dispatch; regate = verify.mjs
//            Bash calls after the fix returned; fixRound = fix dispatch ->
//            the later of the last regate result and the fix commit.
//   tail    = last phase end -> meta.endedAt (ship, final report).
// - "suite-log": <run>/suite-runs.jsonl lines with full=true (primary full
//   suite count). "transcript-bash": Bash tool_use commands in the main and
//   every subagent transcript that run the whole suite (npm test / npm run
//   test with no file after "--", node --test or vitest/jest with no file
//   argument or only a glob); the gate verify.mjs and land-task.mjs run
//   internally are counted apart, since their suite runs never show as Bash.
// - "transcript-usage": per-message usage of the main transcript and each
//   subagents/*.jsonl, deduped by message id (last line wins, as in
//   cell-usage.mjs), priced per model by pricing.mjs at API list price.
//   "harness": stdout.json total_cost_usd, claude's own figure.
// - "review-report": repo/.exo/branch-review.md (both versions), else
//   repo/.git/branch-review.md (pre-0.70 path). "reviewer-return": the
//   verdict=... line the reviewer returned into the main transcript.
// - "git-diff": the expected reviewer under each version's rule. OLD: deep
//   when base..verifyRef touches over 5 files or 200 changed lines. NEW:
//   deep when a landed task has a Risk: field, a manifest or lockfile
//   changed, or an exported signature changed (Signature: trailer, a
//   non-Plan-task commit touching a script, or an export's parameter list
//   that differs between base and verifyRef). verifyRef = the last commit
//   at or before verify start; base = parent of the first Plan-task commit.
// - "recheck": npm test, npm run typecheck, npm run lint run here in the
//   repo at the end commit, cached in <run>/recheck.json by commit.

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportSignatures } from '#export-signatures';
import { sumCounts, usageCounts } from '#token-weights';
import { findTranscript } from './cell-usage.mjs';
import { countsCost } from './pricing.mjs';
import { meanAndSd } from './statistics.mjs';

const SCRIPT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx']);
const MANIFESTS = new Set(['package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb']);
const OLD_FILE_LIMIT = 5;
const OLD_LINE_LIMIT = 200;
const RECHECK_TIMEOUT_MS = 10 * 60 * 1000;
const GATE_COMMAND = /verify\.mjs|\bnpm\s+(test|t|run\s+(test|typecheck|lint|check))\b|\btsc\b|\beslint\b|node\s+--test|\bvitest\b/;

// ---------- transcripts ----------

export function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  const entries = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // a torn last line or a format change: skip it
    }
  }
  return entries;
}

export function loadSession(transcriptPath) {
  const main = { path: transcriptPath, entries: readJsonl(transcriptPath) };
  const subagents = [];
  const directory = path.join(transcriptPath.replace(/\.jsonl$/, ''), 'subagents');
  if (fs.existsSync(directory)) {
    for (const name of fs.readdirSync(directory).sort()) {
      if (!name.endsWith('.jsonl')) continue;
      const file = path.join(directory, name);
      let meta = {};
      try {
        meta = JSON.parse(fs.readFileSync(file.replace(/\.jsonl$/, '.meta.json'), 'utf8'));
      } catch {
        // no meta: agentType stays unknown
      }
      subagents.push({ path: file, meta, entries: readJsonl(file) });
    }
  }
  return { main, subagents };
}

const ms = (iso) => (iso ? Date.parse(iso) : NaN);

function timeBounds(entries) {
  let first = null;
  let last = null;
  for (const entry of entries) {
    if (!entry.timestamp) continue;
    first ??= entry.timestamp;
    last = entry.timestamp;
  }
  return { first, last };
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => (typeof part === 'string' ? part : (part?.text ?? (typeof part?.content === 'string' ? part.content : '')))).join('\n');
}

// Usage per message id (last line wins) with the model, priced per model.
export function usageOf(entries) {
  const calls = new Map();
  for (const entry of entries) {
    const message = entry?.message;
    if (entry?.type !== 'assistant' || !message?.id || !message.usage) continue;
    calls.set(message.id, { ...usageCounts(message.usage), model: message.model ?? 'unknown' });
  }
  const list = [...calls.values()];
  const counts = sumCounts(list);
  let costUsd = 0;
  let unpricedCalls = 0;
  const models = {};
  for (const call of list) {
    const cost = countsCost(call, call.model);
    if (cost === null) unpricedCalls += 1;
    else costUsd += cost;
    models[call.model] = (models[call.model] ?? 0) + 1;
  }
  return { calls: list.length, input: counts.input, cacheCreation: counts.cache5m + counts.cache1h, cacheRead: counts.cacheRead, output: counts.output, totalTokens: counts.raw, costUsd, unpricedCalls, models };
}

function addUsage(target, usage) {
  for (const key of ['calls', 'input', 'cacheCreation', 'cacheRead', 'output', 'totalTokens', 'costUsd', 'unpricedCalls']) target[key] = (target[key] ?? 0) + usage[key];
  target.models ??= {};
  for (const [model, n] of Object.entries(usage.models)) target.models[model] = (target.models[model] ?? 0) + n;
  return target;
}

// tool_use calls of one transcript, each with its result line and a
// notification time for a background dispatch.
export function toolCalls(entries) {
  const calls = new Map();
  const notified = new Map();
  for (const entry of entries) {
    const content = entry?.message?.content;
    if (entry?.type === 'assistant' && Array.isArray(content)) {
      for (const part of content) {
        if (part?.type === 'tool_use' && !calls.has(part.id)) calls.set(part.id, { id: part.id, name: part.name, input: part.input ?? {}, ts: entry.timestamp });
      }
    }
    if (entry?.type === 'user') {
      if (Array.isArray(content)) {
        for (const part of content) {
          if (part?.type !== 'tool_result') continue;
          const call = calls.get(part.tool_use_id);
          if (!call || call.resultTs) continue;
          call.resultTs = entry.timestamp;
          call.resultText = textOf(part.content);
          const result = entry.toolUseResult;
          call.async = Boolean(result && typeof result === 'object' && (result.isAsync || result.status === 'async_launched'));
        }
      }
      const text = textOf(content);
      for (const match of text.matchAll(/<tool-use-id>([^<]+)<\/tool-use-id>/g)) {
        if (!notified.has(match[1])) notified.set(match[1], { ts: entry.timestamp, text });
      }
    }
  }
  for (const [id, note] of notified) {
    const call = calls.get(id);
    if (call) {
      call.notifiedTs = note.ts;
      call.notifiedText = note.text;
    }
  }
  return [...calls.values()];
}

// Whether one shell command runs the whole test suite.
export function isFullSuiteCommand(command) {
  if (typeof command !== 'string') return false;
  for (const raw of command.split(/&&|\|\||;|\||\n/)) {
    let tokens = raw.trim().split(/\s+/).filter(Boolean).map((token) => token.replace(/^['"]|['"]$/g, ''));
    tokens = tokens.filter((token, index) => !/^\d*[<>]/.test(token) && !/^\d*[<>]+$/.test(tokens[index - 1] ?? ''));
    while (tokens.length && /^[A-Z_][A-Z0-9_]*=/.test(tokens[0])) tokens.shift();
    if (tokens[0] === 'npx' || (tokens[0] === 'pnpm' && tokens[1] === 'exec')) tokens = tokens.slice(tokens[0] === 'npx' ? 1 : 2);
    while (tokens[0]?.startsWith('-')) tokens.shift();
    const narrows = (args) => args.some((token) => !token.startsWith('-') && !token.includes('*'));
    const [tool, verb, maybe] = tokens;
    if (['npm', 'pnpm', 'yarn'].includes(tool)) {
      const isTest = verb === 'test' || verb === 't' || ((verb === 'run' || verb === 'run-script') && maybe === 'test');
      if (!isTest) continue;
      const dashes = tokens.indexOf('--');
      if (dashes === -1 || !narrows(tokens.slice(dashes + 1))) return true;
      continue;
    }
    if (tool === 'node' && tokens.includes('--test')) {
      if (!narrows(tokens.slice(1).filter((token) => token !== '--test'))) return true;
      continue;
    }
    if (tool === 'vitest' || tool === 'jest') {
      const args = tokens.slice(1).filter((token) => token !== 'run');
      if (!narrows(args)) return true;
    }
  }
  return false;
}

// ---------- review report ----------

export function parseReviewReport(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  const head = text.split('\n').slice(0, 5).join('\n');
  const verdict = head.match(/\b(CLEAN|FINDINGS|BLOCKED|FIXED)\b/)?.[1] ?? null;
  const counted = { defect: 0, hazard: 0, question: 0 };
  let listed = 0;
  for (const match of text.matchAll(/^\s*[-*]?\s*(?:\*\*)?(?:weight|severity)(?:\*\*)?\s*:\s*\**\s*(defect|hazard|question)\b/gim)) {
    counted[match[1].toLowerCase()] += 1;
    listed += 1;
  }
  const countLine = text.match(/^Count:.*$/im)?.[0] ?? null;
  const fromCount = countLine
    ? Object.fromEntries(['defect', 'hazard', 'question'].map((weight) => [weight, Number(countLine.match(new RegExp(`${weight}\\D*?(\\d+)`, 'i'))?.[1] ?? 0)]))
    : null;
  const fix = [...text.matchAll(/^\s*[-*]?\s*(?:\*\*)?(fix|report)(?:\*\*)?\b(?!\s*[:=])/gim)].map((match) => match[1].toLowerCase());
  const bySeverity = fromCount ?? counted;
  return {
    verdict,
    findings: fromCount ? fromCount.defect + fromCount.hazard + fromCount.question : listed,
    bySeverity,
    listedFindings: listed,
    countLine,
    fix: fix.filter((word) => word === 'fix').length,
    report: fix.filter((word) => word === 'report').length,
    source: 'review-report'
  };
}

export function parseReviewerReturn(text) {
  const match = typeof text === 'string' && text.match(/verdict=(CLEAN|FINDINGS|BLOCKED)(?:\s+defect=(\d+))?(?:\s+hazard=(\d+))?(?:\s+question=(\d+))?(?:\s+fix=(\d+))?/);
  if (!match) return null;
  const [defect, hazard, question, fix] = match.slice(2).map((value) => (value === undefined ? null : Number(value)));
  return { verdict: match[1], defect, hazard, question, fix, findings: (defect ?? 0) + (hazard ?? 0) + (question ?? 0), source: 'reviewer-return' };
}

// ---------- plan and repo ----------

export function parsePlanTasks(text) {
  const tasks = [];
  const sections = text.split(/^(?=###\s+Task\s+\d+)/m).slice(1);
  for (const section of sections) {
    const number = Number(section.match(/^###\s+Task\s+(\d+)/)[1]);
    const body = section.split(/^##\s/m)[0];
    const risk = body.match(/(?:^|\|)\s*Risk:\s*([^|\n]+)/m)?.[1].trim() ?? null;
    tasks.push({ number, title: section.split('\n')[0].replace(/^###\s+Task\s+\d+:\s*/, '').trim(), risk });
  }
  return tasks;
}

function git(repo, args) {
  return execFileSync('git', ['-C', repo, '-c', 'core.quotePath=false', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function tryGit(repo, args) {
  try {
    return git(repo, args);
  } catch {
    return null;
  }
}

export function readCommits(repo) {
  const format = '%H%x1f%P%x1f%ct%x1f%s%x1f%(trailers:key=Plan-task,valueonly)%x1f%(trailers:key=Signature,valueonly)%x1e';
  const log = tryGit(repo, ['log', '--all', '--topo-order', '--reverse', `--format=${format}`]) ?? '';
  return log.split('\x1e').map((chunk) => chunk.trim()).filter(Boolean).map((chunk) => {
    const [sha, parents, time, subject, planTask, signature] = chunk.split('\x1f');
    const trailer = planTask.trim().split('\n')[0];
    const taskNumber = trailer ? Number(trailer.match(/(\d+)\s*$/)?.[1]) : null;
    return { sha, parents: parents.split(' ').filter(Boolean), time: Number(time) * 1000, subject, planTask: trailer || null, taskNumber, signature: signature.trim() || null };
  });
}

function changedFiles(repo, base, ref) {
  const numstat = tryGit(repo, ['diff', '--numstat', base, ref]) ?? '';
  return numstat.split('\n').filter(Boolean).map((line) => {
    const [added, removed, file] = line.split('\t');
    return { file, lines: (Number(added) || 0) + (Number(removed) || 0) };
  });
}

function exportedSignatureChanges(repo, base, ref, files) {
  const changes = [];
  for (const { file } of files) {
    if (!SCRIPT_EXTENSIONS.has(path.extname(file))) continue;
    const before = tryGit(repo, ['show', `${base}:${file}`]);
    const after = tryGit(repo, ['show', `${ref}:${file}`]);
    if (before === null) continue;
    const old = exportSignatures(before);
    const now = after === null ? new Map() : exportSignatures(after);
    for (const [name, shape] of old) {
      const next = now.get(name);
      if (!next) changes.push(`${file}:${name}(${shape.text}) -> removed`);
      else if (next.text !== shape.text) changes.push(`${file}:${name}(${shape.text}) -> (${next.text})`);
    }
  }
  return changes;
}

export function repoFacts(repo, { verifyAtMs = NaN, planPath = null } = {}) {
  const commits = readCommits(repo);
  const taskCommits = commits.filter((commit) => commit.planTask);
  const first = taskCommits[0];
  const base = first?.parents[0] ?? commits[0]?.sha ?? null;
  const reachable = new Set((tryGit(repo, ['rev-list', 'HEAD']) ?? '').split('\n').filter(Boolean));
  const branchCommits = commits.filter((commit) => reachable.has(commit.sha));
  const head = tryGit(repo, ['rev-parse', 'HEAD'])?.trim() ?? null;
  const afterBase = base ? branchCommits.slice(branchCommits.findIndex((commit) => commit.sha === base) + 1) : branchCommits;
  const beforeVerify = Number.isFinite(verifyAtMs) ? afterBase.filter((commit) => commit.time <= verifyAtMs + 1000) : afterBase.filter((commit) => commit.planTask);
  const verifyRef = beforeVerify.at(-1)?.sha ?? taskCommits.at(-1)?.sha ?? head;
  const fixCommits = afterBase.filter((commit) => !commit.planTask && /address the branch review/i.test(commit.subject));

  let planFile = planPath;
  if (!planFile) {
    const plans = path.join(repo, 'docs', 'plans');
    const names = fs.existsSync(plans) ? fs.readdirSync(plans).filter((name) => name.endsWith('.md')).sort() : [];
    const stem = taskCommits.find((commit) => commit.planTask.includes('/'))?.planTask.split('/')[0];
    const pick = names.find((name) => stem && name === `${stem}.md`) ?? names[0];
    planFile = pick ? path.join(plans, pick) : null;
  }
  const planTasks = planFile && fs.existsSync(planFile) ? parsePlanTasks(fs.readFileSync(planFile, 'utf8')) : [];
  const landed = [...new Set(taskCommits.map((commit) => commit.taskNumber))].sort((a, b) => a - b);
  const files = base && verifyRef ? changedFiles(repo, base, verifyRef) : [];
  const riskTasks = planTasks.filter((task) => task.risk && landed.includes(task.number)).map((task) => ({ number: task.number, risk: task.risk }));
  const manifestFiles = files.map((entry) => entry.file).filter((file) => MANIFESTS.has(path.basename(file)));
  const signatureTrailers = taskCommits.filter((commit) => commit.signature).map((commit) => commit.signature);
  const verifyCommits = new Set(beforeVerify.map((commit) => commit.sha));
  const unplannedScriptCommits = afterBase.filter((commit) => verifyCommits.has(commit.sha) && !commit.planTask
    && (tryGit(repo, ['show', '--name-only', '--format=', commit.sha]) ?? '').split('\n').some((file) => SCRIPT_EXTENSIONS.has(path.extname(file.trim()))));
  const signatureChanges = base && verifyRef ? exportedSignatureChanges(repo, base, verifyRef, files) : [];
  const changedLines = files.reduce((sum, entry) => sum + entry.lines, 0);
  const signatureChanged = signatureTrailers.length > 0 || unplannedScriptCommits.length > 0 || signatureChanges.length > 0;
  return {
    head,
    base,
    verifyRef,
    planFile,
    planTasks: planTasks.map((task) => task.number),
    landedTasks: landed,
    allTasksLanded: planTasks.length > 0 && planTasks.every((task) => landed.includes(task.number)),
    taskCommits: taskCommits.map(({ sha, time, subject, planTask }) => ({ sha: sha.slice(0, 10), time: new Date(time).toISOString(), subject, planTask })),
    fixCommits: fixCommits.map(({ sha, time, subject }) => ({ sha: sha.slice(0, 10), time: new Date(time).toISOString(), subject })),
    risk: {
      source: 'git-diff',
      riskTasks,
      manifestFiles,
      signatureTrailers,
      unplannedScriptCommits: unplannedScriptCommits.map((commit) => commit.sha.slice(0, 10)),
      exportedSignatureChanges: signatureChanges,
      files: files.length,
      changedLines,
      expectedNew: riskTasks.length > 0 || manifestFiles.length > 0 || signatureChanged ? 'review-branch-deep' : 'review-branch',
      expectedOld: files.length > OLD_FILE_LIMIT || changedLines > OLD_LINE_LIMIT ? 'review-branch-deep' : 'review-branch'
    },
    _taskCommits: taskCommits,
    _fixCommits: fixCommits
  };
}

// ---------- phases ----------

const span = (from, to, source) => {
  const value = ms(to) - ms(from);
  return Number.isFinite(value) ? { ms: value, from, to, source } : { ms: null, from: from ?? null, to: to ?? null, source };
};

function agentReturn(call, subagent) {
  if (call.resultTs && !call.async) return call.resultTs;
  if (call.notifiedTs) return call.notifiedTs;
  return subagent ? timeBounds(subagent.entries).last : (call.resultTs ?? null);
}

export function phasesOf({ calls, subagents, meta, facts, mainBounds }) {
  const start = meta.startedAt ?? mainBounds.first;
  const end = meta.endedAt ?? mainBounds.last;
  const byTool = new Map(subagents.map((subagent) => [subagent.meta.toolUseId, subagent]));
  const agentCalls = calls.filter((call) => call.name === 'Agent' || call.name === 'Task');
  const typeOf = (call) => String(call.input.subagent_type ?? byTool.get(call.id)?.meta.agentType ?? '');
  const verifySkill = calls.find((call) => call.name === 'Skill' && /(^|:)verify$/.test(String(call.input.skill ?? call.input.command ?? '')));
  const verifyRuns = calls.filter((call) => call.name === 'Bash' && /verify\.mjs/.test(String(call.input.command ?? '')));
  const verifyStart = verifySkill?.ts ?? verifyRuns[0]?.ts ?? null;
  const review = agentCalls.find((call) => /review-branch/.test(typeOf(call)));
  const fix = agentCalls.find((call) => /fix-review/.test(typeOf(call)));
  const reviewEnd = review ? agentReturn(review, byTool.get(review.id)) : null;
  const fixEnd = fix ? agentReturn(fix, byTool.get(fix.id)) : null;

  const gateUntil = ms(review?.ts ?? end);
  const gateCalls = calls.filter((call) => call.name === 'Bash' && ms(call.ts) >= ms(verifyStart) && ms(call.ts) < gateUntil && GATE_COMMAND.test(String(call.input.command ?? '')));
  const gateMs = gateCalls.reduce((sum, call) => sum + Math.max(0, ms(call.resultTs) - ms(call.ts) || 0), 0);
  const regate = fixEnd ? verifyRuns.filter((call) => ms(call.ts) >= ms(fixEnd)) : [];
  const regateMs = regate.reduce((sum, call) => sum + Math.max(0, ms(call.resultTs) - ms(call.ts) || 0), 0);
  const fixCommitTs = facts?._fixCommits?.at(-1) ? new Date(facts._fixCommits.at(-1).time).toISOString() : null;
  const fixRoundEnd = [regate.at(-1)?.resultTs, fixCommitTs, fixEnd].filter(Boolean).sort((a, b) => ms(a) - ms(b)).at(-1) ?? null;

  const taskCommits = facts?._taskCommits ?? [];
  let previous = ms(start);
  const buildPerTask = taskCommits.map((commit) => {
    const value = Number.isFinite(previous) ? commit.time - previous : null;
    previous = commit.time;
    return { task: commit.taskNumber, ms: value, at: new Date(commit.time).toISOString(), source: 'commit-ts' };
  });
  const buildTaskAgents = agentCalls.filter((call) => /build-task|run-unit|solve-hard/.test(typeOf(call))).map((call) => ({
    agentType: typeOf(call),
    description: call.input.description ?? byTool.get(call.id)?.meta.description ?? null,
    ...span(call.ts, agentReturn(call, byTool.get(call.id)), 'transcript-ts')
  }));
  const lastEnd = [fixRoundEnd, reviewEnd, gateCalls.at(-1)?.resultTs].filter(Boolean).sort((a, b) => ms(a) - ms(b)).at(-1);
  return {
    build: span(start, verifyStart, 'transcript-ts'),
    buildPerTask,
    buildTaskAgents,
    gate: { ...span(verifyStart, review?.ts ?? null, 'transcript-ts'), busyMs: gateCalls.length ? gateMs : null, commands: gateCalls.length },
    review: { ...span(review?.ts, reviewEnd, 'transcript-ts'), agentType: review ? typeOf(review) : null },
    fix: fix ? span(fix.ts, fixEnd, 'transcript-ts') : null,
    regate: fix ? { ms: regate.length ? regateMs : null, runs: regate.length, source: 'transcript-ts' } : null,
    fixRound: fix ? span(fix.ts, fixRoundEnd, fixRoundEnd === fixCommitTs ? 'commit-ts' : 'transcript-ts') : null,
    tail: lastEnd ? span(lastEnd, end, 'transcript-ts') : null,
    _review: review,
    _fix: fix,
    _verifyRuns: verifyRuns
  };
}

// ---------- recheck ----------

function recheck(repo, runDirectory, head, force) {
  const cache = path.join(runDirectory, 'recheck.json');
  if (!force && fs.existsSync(cache)) {
    const cached = JSON.parse(fs.readFileSync(cache, 'utf8'));
    if (cached.commit === head) return cached;
  }
  let scripts = {};
  try {
    scripts = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).scripts ?? {};
  } catch {
    // no package.json: every check is absent
  }
  // The fixture's test script may log to suite-runs.jsonl; the recheck must not count.
  const suiteLog = path.join(runDirectory, 'suite-runs.jsonl');
  const saved = fs.existsSync(suiteLog) ? fs.readFileSync(suiteLog) : null;
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(CLAUDECODE|CLAUDE_CODE_.*|CLAUDE_EFFORT)$/.test(name)));
  env.LEAN_GATES_RECHECK = '1';
  const results = {};
  try {
    for (const [name, args] of [['test', ['test']], ['typecheck', ['run', 'typecheck']], ['lint', ['run', 'lint']]]) {
      if (!scripts[name]) {
        results[name] = { status: 'absent' };
        continue;
      }
      const started = Date.now();
      const run = spawnSync('npm', args, { cwd: repo, env, encoding: 'utf8', timeout: RECHECK_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
      const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
      results[name] = { status: run.status === 0 ? 'pass' : (run.error ? 'error' : 'fail'), exitCode: run.status, ms: Date.now() - started, tail: output.slice(-800) };
    }
  } finally {
    if (saved !== null) fs.writeFileSync(suiteLog, saved);
    else if (fs.existsSync(suiteLog)) fs.rmSync(suiteLog);
  }
  const record = { commit: head, dirty: (tryGit(repo, ['status', '--porcelain']) ?? '').trim() !== '', results, source: 'recheck' };
  fs.writeFileSync(cache, `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

// ---------- one run ----------

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// The main transcript: <meta.transcriptDir>/<sessionId>.jsonl, else the
// findTranscript lookup across every project slug; null when neither has it.
function locateTranscript(sessionId, meta) {
  if (!sessionId) return null;
  if (meta.transcriptDir) {
    const candidate = path.join(meta.transcriptDir, `${sessionId}.jsonl`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return findTranscript(sessionId);
}

// Why a run did not finish cleanly, or null when it exited 0 in time.
export function incompleteReason(meta) {
  if (meta.timedOut) return 'timed out';
  if (meta.exitCode === 0) return null;
  if (meta.signal) return `signal ${meta.signal}`;
  return meta.exitCode == null ? 'no exit code' : `exit ${meta.exitCode}`;
}

function fullSuiteFromLog(runDirectory, meta) {
  const lines = readJsonl(path.join(runDirectory, 'suite-runs.jsonl'));
  if (!fs.existsSync(path.join(runDirectory, 'suite-runs.jsonl'))) return { full: null, all: null, source: 'suite-log' };
  const from = ms(meta.startedAt);
  const to = ms(meta.endedAt);
  const inWindow = lines.filter((line) => !Number.isFinite(from) || !Number.isFinite(ms(line.ts)) || (ms(line.ts) >= from - 1000 && (!Number.isFinite(to) || ms(line.ts) <= to + 1000)));
  return { full: inWindow.filter((line) => line.full === true).length, all: inWindow.length, outsideWindow: lines.length - inWindow.length, source: 'suite-log' };
}

export function runMetrics(runDirectory, { recheck: doRecheck = true, forceRecheck = false } = {}) {
  const id = path.basename(runDirectory);
  const meta = readJson(path.join(runDirectory, 'meta.json')) ?? {};
  const stdout = readJson(path.join(runDirectory, 'stdout.json'));
  const version = meta.version ?? id.match(/(old|new)$/)?.[1] ?? 'unknown';
  const sessionId = meta.sessionId ?? stdout?.session_id ?? null;
  const transcript = locateTranscript(sessionId, meta);
  const transcriptMissing = transcript === null;
  if (transcriptMissing) process.stderr.write(`warning: ${runDirectory}: main transcript ${sessionId ?? '(no session id)'}.jsonl not found${meta.transcriptDir ? ` under ${meta.transcriptDir}` : ''} or by lookup; tokens and cost are n/a and left out of the aggregate\n`);
  const incomplete = incompleteReason(meta);
  const session = transcript ? loadSession(transcript) : { main: { entries: [] }, subagents: [] };
  const mainBounds = timeBounds(session.main.entries);
  const calls = toolCalls(session.main.entries);
  const repo = path.join(runDirectory, 'repo');
  const hasRepo = fs.existsSync(path.join(repo, '.git'));

  const verifyCall = calls.find((call) => call.name === 'Skill' && /(^|:)verify$/.test(String(call.input.skill ?? '')))
    ?? calls.find((call) => call.name === 'Bash' && /verify\.mjs/.test(String(call.input.command ?? '')));
  const facts = hasRepo ? repoFacts(repo, { verifyAtMs: ms(verifyCall?.ts) }) : null;
  const phases = phasesOf({ calls, subagents: session.subagents, meta, facts, mainBounds });

  // tokens and cost
  const main = usageOf(session.main.entries);
  const byAgentType = {};
  const subagents = session.subagents.map((subagent) => {
    const usage = usageOf(subagent.entries);
    const type = subagent.meta.agentType ?? 'unknown';
    byAgentType[type] = addUsage(byAgentType[type] ?? { instances: 0 }, usage);
    byAgentType[type].instances += 1;
    const bounds = timeBounds(subagent.entries);
    return { agentType: type, description: subagent.meta.description ?? null, toolUseId: subagent.meta.toolUseId ?? null, ...span(bounds.first, bounds.last, 'transcript-ts'), usage };
  });
  const total = addUsage(addUsage({}, main), subagents.reduce((sum, subagent) => addUsage(sum, subagent.usage), { calls: 0, input: 0, cacheCreation: 0, cacheRead: 0, output: 0, totalTokens: 0, costUsd: 0, unpricedCalls: 0, models: {} }));

  // full suite
  const allEntries = [session.main.entries, ...session.subagents.map((subagent) => subagent.entries)];
  const bashCommands = allEntries.flatMap((entries) => toolCalls(entries).filter((call) => call.name === 'Bash').map((call) => String(call.input.command ?? '')));
  const fullSuite = {
    log: fullSuiteFromLog(runDirectory, meta),
    bash: { full: bashCommands.filter(isFullSuiteCommand).length, verifyCalls: bashCommands.filter((command) => /verify\.mjs/.test(command)).length, landTaskCalls: bashCommands.filter((command) => /land-task\.mjs/.test(command)).length, source: 'transcript-bash' }
  };

  // reviewer
  const reviewerLines = [];
  for (const call of calls) {
    for (const match of (call.resultText ?? '').matchAll(/^REVIEWER:\s*(\S+)/gm)) reviewerLines.push({ ts: call.resultTs, agent: match[1], fromVerify: /verify\.mjs/.test(String(call.input.command ?? '')) });
  }
  const pickedLine = reviewerLines.find((line) => line.fromVerify) ?? reviewerLines[0] ?? null;
  const dispatched = phases.review.agentType?.replace(/^exo:/, '') ?? null;
  const expected = facts ? (version === 'old' ? facts.risk.expectedOld : facts.risk.expectedNew) : null;
  const reviewer = {
    line: pickedLine ? `REVIEWER: ${pickedLine.agent}` : null,
    lines: reviewerLines.map((line) => line.agent),
    dispatched,
    expectedByOwnRule: expected,
    fitsRule: expected && (pickedLine || dispatched) ? (pickedLine?.agent ?? dispatched).replace(/-high$/, '') === expected : null,
    risk: facts?.risk ?? null
  };

  // quality
  const reportPath = [path.join(repo, '.exo', 'branch-review.md'), path.join(repo, '.git', 'branch-review.md')].find((file) => fs.existsSync(file)) ?? null;
  const report = reportPath ? parseReviewReport(fs.readFileSync(reportPath, 'utf8')) : null;
  const reviewSubagent = session.subagents.find((subagent) => subagent.meta.toolUseId === phases._review?.id);
  const returned = parseReviewerReturn(phases._review?.resultText) ?? parseReviewerReturn(phases._review?.notifiedText)
    ?? parseReviewerReturn(textOf(reviewSubagent?.entries.filter((entry) => entry.type === 'assistant').at(-1)?.message?.content));
  const fixDispatches = calls.filter((call) => (call.name === 'Agent' || call.name === 'Task') && /fix-review/.test(String(call.input.subagent_type ?? ''))).length;
  const quality = {
    review: report ? { ...report, path: path.relative(runDirectory, reportPath) } : null,
    reviewerReturn: returned,
    findings: report?.findings ?? returned?.findings ?? null,
    finalVerdict: report?.verdict ?? returned?.verdict ?? null,
    fixRounds: fixDispatches,
    fixCommits: facts?.fixCommits.length ?? null,
    taskCommits: facts?.taskCommits.length ?? null,
    planTasks: facts?.planTasks ?? null,
    landedTasks: facts?.landedTasks ?? null,
    allTasksLanded: facts?.allTasksLanded ?? null,
    claudeResult: stdout ? { subtype: stdout.subtype ?? null, isError: stdout.is_error ?? null, numTurns: stdout.num_turns ?? null } : null,
    recheck: doRecheck && hasRepo && facts?.head ? recheck(repo, runDirectory, facts.head, forceRecheck) : null
  };

  for (const key of ['_review', '_fix', '_verifyRuns']) delete phases[key];
  if (facts) {
    delete facts._taskCommits;
    delete facts._fixCommits;
  }
  return {
    id,
    version,
    sessionId,
    transcript,
    transcriptMissing,
    incomplete: incomplete !== null,
    incompleteReason: incomplete,
    model: meta.model ?? null,
    exitCode: meta.exitCode ?? null,
    timedOut: meta.timedOut ?? null,
    wall: { ms: meta.wallMs ?? (ms(mainBounds.last) - ms(mainBounds.first) || null), source: meta.wallMs != null ? 'meta' : 'transcript-ts' },
    phases,
    fullSuite,
    tokens: { source: 'transcript-usage', main: { ...main, label: 'main session' }, byAgentType, subagents, total },
    cost: { transcriptUsd: total.costUsd, harnessUsd: stdout?.total_cost_usd ?? null, note: 'transcriptUsd: transcript tokens x prices.mjs list price, main + subagents; harnessUsd: stdout.json total_cost_usd from claude' },
    reviewer,
    quality,
    repo: facts
  };
}

// ---------- aggregate and table ----------

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function summarize(values) {
  const numbers = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  const { mean, sd, n } = meanAndSd(numbers);
  return { n, median: median(numbers), min: n ? Math.min(...numbers) : null, max: n ? Math.max(...numbers) : null, mean, sd };
}

// Incomplete runs (nonzero exit, signal or timeout) leave every metric;
// runs with no main transcript leave the transcript token and cost metrics,
// whose zeros would read as a cheap run.
export function aggregate(runs) {
  const versions = {};
  for (const version of [...new Set(runs.map((run) => run.version))].sort()) {
    const all = runs.filter((run) => run.version === version);
    const group = all.filter((run) => !run.incomplete);
    const withTranscript = group.filter((run) => !run.transcriptMissing);
    versions[version] = {
      runs: all.map((run) => run.id),
      excluded: {
        incomplete: all.filter((run) => run.incomplete).map((run) => run.id),
        transcriptMissing: all.filter((run) => run.transcriptMissing).map((run) => run.id)
      },
      wallMs: summarize(group.map((run) => run.wall.ms)),
      totalTokens: summarize(withTranscript.map((run) => run.tokens.total.totalTokens)),
      costTranscriptUsd: summarize(withTranscript.map((run) => run.cost.transcriptUsd)),
      costHarnessUsd: summarize(group.map((run) => run.cost.harnessUsd)),
      fullSuiteRunsLog: summarize(group.map((run) => run.fullSuite.log.full)),
      fullSuiteRunsBash: summarize(group.map((run) => run.fullSuite.bash.full)),
      findings: summarize(group.map((run) => run.quality.findings))
    };
  }
  return versions;
}

const minutes = (value) => (value == null ? '-' : (value / 60000).toFixed(1));
const millions = (value) => (value == null ? '-' : (value / 1e6).toFixed(2));
const dollars = (value) => (value == null ? '-' : value.toFixed(2));
const orDash = (value) => (value == null ? '-' : String(value));

export function markdownTable(metrics) {
  const rows = [
    '| run | wall min | build | gate | review | fix | suite runs log/bash | tokens M (main/sub) | $ transcript/harness | reviewer picked/expected | findings d/h/q | fix rounds | verdict | tasks landed | recheck t/tc/l |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'
  ];
  for (const run of metrics.runs) {
    const sub = run.tokens.total.totalTokens - run.tokens.main.totalTokens;
    const sev = run.quality.review?.bySeverity ?? run.quality.reviewerReturn ?? {};
    const re = run.quality.recheck?.results;
    const check = (name) => ({ pass: 'P', fail: 'F', absent: '-', error: 'E' }[re?.[name]?.status] ?? '?');
    const tokens = run.transcriptMissing ? 'n/a' : `${millions(run.tokens.total.totalTokens)} (${millions(run.tokens.main.totalTokens)}/${millions(sub)})`;
    const transcriptUsd = run.transcriptMissing ? 'n/a' : dollars(run.cost.transcriptUsd);
    const label = run.incomplete ? `${run.id} [incomplete: ${run.incompleteReason}]*` : run.id;
    rows.push(`| ${label} | ${minutes(run.wall.ms)} | ${minutes(run.phases.build.ms)} | ${minutes(run.phases.gate.ms)} | ${minutes(run.phases.review.ms)} | ${minutes(run.phases.fix?.ms)} | ${orDash(run.fullSuite.log.full)}/${run.fullSuite.bash.full} | ${tokens} | ${transcriptUsd}/${dollars(run.cost.harnessUsd)} | ${orDash(run.reviewer.line?.replace('REVIEWER: ', '') ?? run.reviewer.dispatched)}/${orDash(run.reviewer.expectedByOwnRule)} | ${orDash(run.quality.findings)} (${orDash(sev.defect)}/${orDash(sev.hazard)}/${orDash(sev.question)}) | ${run.quality.fixRounds} | ${orDash(run.quality.finalVerdict)} | ${run.quality.landedTasks ? `${run.quality.landedTasks.length}/${run.quality.planTasks.length}` : '-'} | ${re ? `${check('test')}/${check('typecheck')}/${check('lint')}` : 'skipped'} |`);
  }
  rows.push('', '| version | metric | median | min-max | mean ± sd | n |', '|---|---|---|---|---|---|');
  const format = { wallMs: minutes, totalTokens: millions, costTranscriptUsd: dollars, costHarnessUsd: dollars };
  for (const [version, stats] of Object.entries(metrics.aggregate)) {
    for (const [metric, summary] of Object.entries(stats)) {
      if (metric === 'runs' || metric === 'excluded') continue;
      const show = format[metric] ?? ((value) => (value == null ? '-' : Number(value.toFixed(2)).toString()));
      rows.push(`| ${version} | ${metric}${metric === 'wallMs' ? ' (min)' : metric === 'totalTokens' ? ' (M)' : ''} | ${show(summary.median)} | ${show(summary.min)}-${show(summary.max)} | ${show(summary.mean)} ± ${show(summary.sd)} | ${summary.n} |`);
    }
    const { incomplete = [], transcriptMissing = [] } = stats.excluded ?? {};
    rows.push(`| ${version} | excluded | incomplete ${incomplete.length} (all metrics); transcript missing ${transcriptMissing.length} (tokens, $ transcript) | ${[...new Set([...incomplete, ...transcriptMissing])].join(', ') || '-'} | | |`);
  }
  rows.push('', 'Phase minutes are transcript-ts; build per task is commit-ts in metrics.json. Suite runs: log = suite-runs.jsonl full=true, bash = full-suite Bash commands in all transcripts. $ transcript = transcript tokens x prices.mjs; $ harness = stdout.json total_cost_usd. n/a = main transcript missing. * = incomplete run (nonzero exit, signal or timeout): numbers shown, left out of the aggregate.');
  return rows.join('\n');
}

export function collectRuns(out) {
  return fs.readdirSync(out, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(out, entry.name, 'meta.json')))
    .map((entry) => path.join(out, entry.name))
    .sort();
}

function main(argv) {
  const out = argv.find((arg) => !arg.startsWith('--'));
  if (!out) {
    process.stderr.write('usage: node benchmarks/lean-gates-metrics.mjs <out> [--no-recheck] [--force-recheck]\n');
    return 2;
  }
  const runs = collectRuns(path.resolve(out)).map((directory) => runMetrics(directory, { recheck: !argv.includes('--no-recheck'), forceRecheck: argv.includes('--force-recheck') }));
  const metrics = { generatedAt: new Date().toISOString(), host: os.hostname(), runs, aggregate: aggregate(runs) };
  fs.writeFileSync(path.join(out, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`);
  process.stdout.write(`${markdownTable(metrics)}\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) process.exitCode = main(process.argv.slice(2));
