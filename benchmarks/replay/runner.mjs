#!/usr/bin/env node
// replay/runner.mjs
// Runs replay cells: claude-opus-5-5, read-only tools, one temp copy of the case's input/ per cell.
//   node benchmarks/replay/runner.mjs --cases a,b [--runs k] --out benchmarks/replay/runs/<name> [--effort medium] [--concurrency 2]
//                   [--cases-dir cases] [--max-budget-usd 2] [--max-total-usd n] [--cell-timeout-min 30]
//                   [--arm baseline|cue|audit] [--audit-script path] [--full] [--dry-run]
// --arm: cells go to <out>/<id>/<arm>/<k>/; cue and audit append the arm paragraph (arm1/arms.json) to prompt.md after a blank line;
//   audit first runs `node <audit-script> <cell>/input` into <cell>/input/audit.md (default arm1/audit.mjs; failure stops the cell).
// --dry-run: build the cell dir and prompt.final.md, stop before the model; no grade, no spend.
// Leak guard: `claude --restricted --tools Read,Grep,Glob` confines the file tools to the
// cell's temp dir and asks no permission headless (checked on 2.1.302: a read outside is denied, not prompted).
// Prints per cell: case, run, grade, cost, wall time, tokens, stop reason; per case: fails out of k, fail rate with SE and the 10-90% band.

import { spawn, spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { withoutParentSession, ISOLATION_ENV } from '../lean-gates.mjs';
import { writeCellUsage } from '../cell-usage.mjs';
import crypto from 'node:crypto';
import { plannedPowerLine } from '../power-plan.mjs';
import { gradeCell } from './grade.mjs';
import { cellRecord, readCellRecord, stoppedRecord, summaryLines } from './cell-stats.mjs';
import { readJson } from '../basics.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODEL = 'claude-opus-5-5';
const TOOLS = 'Read,Grep,Glob';
const ARMS = readJson(path.join(HERE, 'arm1', 'arms.json'));
const ARM_NAMES = ['baseline', 'cue', 'audit'];
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
export const QUICK_RUNS = 1;
export const FULL_RUNS = 5;

export function parseFlags(argv) {
  const flags = { effort: 'medium', concurrency: 2, runs: null, full: false, casesDir: path.join(HERE, 'cases'), maxBudget: 2, maxTotal: Infinity, timeoutMin: 30, cases: null, out: null, arm: 'baseline', auditScript: path.join(HERE, 'arm1', 'audit.mjs'), dryRun: false };
  const names = { '--cases': 'cases', '--runs': 'runs', '--out': 'out', '--effort': 'effort', '--concurrency': 'concurrency', '--cases-dir': 'casesDir', '--max-budget-usd': 'maxBudget', '--max-total-usd': 'maxTotal', '--cell-timeout-min': 'timeoutMin', '--arm': 'arm', '--audit-script': 'auditScript' };
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i] === '--dry-run') { flags.dryRun = true; i -= 1; continue; }
    if (argv[i] === '--full') { flags.full = true; i -= 1; continue; }
    const key = names[argv[i]];
    if (key === undefined || argv[i + 1] === undefined) throw new Error(`bad flag ${argv[i]}`);
    flags[key] = argv[i + 1];
  }
  if (flags.cases === null || flags.out === null) throw new Error('usage: node benchmarks/replay/runner.mjs --cases a,b [--runs k] [--full] --out benchmarks/replay/runs/<name> [--effort e] [--concurrency n]');
  if (flags.runs !== null && flags.full) throw new Error('--full and --runs exclude each other');
  flags.tier = flags.runs !== null ? 'custom' : flags.full ? 'full' : 'quick';
  flags.runs = flags.runs !== null ? flags.runs : flags.full ? FULL_RUNS : QUICK_RUNS;
  for (const key of ['concurrency', 'runs', 'maxBudget', 'maxTotal', 'timeoutMin']) flags[key] = Number(flags[key]);
  if (!ARM_NAMES.includes(flags.arm)) throw new Error(`bad --arm ${flags.arm} (baseline|cue|audit)`);
  flags.auditScript = path.resolve(flags.auditScript);
  flags.cases = flags.cases.split(',');
  flags.casesDir = path.resolve(flags.casesDir);
  flags.out = path.resolve(flags.out);
  return flags;
}

function runClaude(args, cwd, timeoutMs) {
  const command = process.platform === 'darwin' ? ['caffeinate', '-i', 'claude', ...args] : ['claude', ...args];
  const env = { ...withoutParentSession(process.env), ...ISOLATION_ENV };
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeoutMs);
    child.on('close', (code) => { clearTimeout(timer); resolve({ stdout, stderr, code, timedOut }); });
  });
}

async function runCell(flags, caseId, run, claudeVersion) {
  const caseDirectory = path.join(flags.casesDir, caseId);
  const caseDef = readJson(path.join(caseDirectory, 'case.json'));
  const basePrompt = fs.readFileSync(path.join(caseDirectory, 'prompt.md'), 'utf8').trim();
  const prompt = flags.arm === 'baseline' ? basePrompt : `${basePrompt}\n\n${ARMS[flags.arm]}`;
  const cell = path.join(flags.out, caseId, flags.arm, String(run));
  fs.mkdirSync(cell, { recursive: true });
  fs.copyFileSync(path.join(caseDirectory, 'case.json'), path.join(cell, 'case.json'));
  const facts = { arm: flags.arm, promptSha256: sha256(prompt) };
  const input = path.join(caseDirectory, 'input');
  if (flags.arm === 'audit' || flags.dryRun) {
    if (fs.existsSync(input)) fs.cpSync(input, path.join(cell, 'input'), { recursive: true });
    fs.mkdirSync(path.join(cell, 'input'), { recursive: true });
  }
  if (flags.arm === 'audit') {
    if (!fs.existsSync(flags.auditScript)) throw new Error(`${caseId}/${run}: audit script missing: ${flags.auditScript}; cell stopped, no baseline fallback`);
    const audit = spawnSync('node', [flags.auditScript, path.join(cell, 'input')], { encoding: 'utf8' });
    if (audit.status !== 0) throw new Error(`${caseId}/${run}: audit script exited ${audit.status ?? audit.signal}: ${(audit.stderr || '').slice(0, 500)}; cell stopped, no baseline fallback`);
    fs.writeFileSync(path.join(cell, 'input', 'audit.md'), audit.stdout);
    facts.auditScriptSha256 = sha256(fs.readFileSync(flags.auditScript));
  }
  if (flags.dryRun) {
    fs.writeFileSync(path.join(cell, 'prompt.final.md'), prompt);
    fs.writeFileSync(path.join(cell, 'facts.json'), `${JSON.stringify(facts, null, 2)}\n`);
    console.log(`dry-run ${caseId}/${flags.arm}/${run}\t${cell}`);
    return null;
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), `replay-${caseId}-`));
  if (flags.arm === 'audit') fs.cpSync(path.join(cell, 'input'), path.join(work, 'input'), { recursive: true });
  else if (fs.existsSync(input)) fs.cpSync(input, path.join(work, 'input'), { recursive: true });
  const args = ['-p', prompt, '--model', MODEL, '--effort', flags.effort, '--output-format', 'json', '--restricted', '--tools', TOOLS,
    '--strict-mcp-config', '--max-budget-usd', String(flags.maxBudget)];
  const started = Date.now();
  const run1 = await runClaude(args, work, flags.timeoutMin * 60000);
  const wallMs = Date.now() - started;
  fs.rmSync(work, { recursive: true, force: true });
  fs.writeFileSync(path.join(cell, 'stdout.json'), run1.stdout);
  let result = {};
  try { result = JSON.parse(run1.stdout); } catch { result = { is_error: true, subtype: run1.timedOut ? 'timeout' : 'unparsable', stderr: run1.stderr.slice(0, 2000) }; }
  result = { ...result, ...facts, wallMs, claudeVersion, effort: flags.effort, model: MODEL, exitCode: run1.code, timedOut: run1.timedOut };
  fs.writeFileSync(path.join(cell, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  const usage = result.session_id ? writeCellUsage(cell, result.session_id) : null;
  const graded = gradeCell(cell);
  fs.writeFileSync(path.join(cell, 'checks.json'), `${JSON.stringify({ tier: 'replay', case: caseId, grade: graded.grade }, null, 2)}\n`);
  const stop = [result.subtype, result.stop_reason, result.terminal_reason].filter(Boolean).join('/');
  const record = cellRecord({ caseId, kind: caseDef.kind, grade: graded.grade, result });
  const cost = record.costUsd === null ? 'cost n/a' : `$${record.costUsd.toFixed(3)}`;
  const line = [caseId, `run${run}`, graded.grade, cost, `${(wallMs / 1000).toFixed(1)}s`, tokenText(usage, result), `stop=${stop}`, record.aborted ? 'ABORTED counted as failure' : null].filter(Boolean).join('\t');
  console.log(line);
  return record;
}

function tokenText(usage, result) {
  if (usage?.counts) return `${Math.round(usage.counts.weightedInput + usage.counts.output)}tok`;
  if (result.usage) return `${Math.round((result.usage.input_tokens ?? 0) + (result.usage.output_tokens ?? 0))}tok`;
  return 'tokens n/a';
}

// Summed total_cost_usd of finished cells (those holding grade.json) under out, earlier calls included.
function spentUsd(out) {
  let sum = 0;
  let unpriced = 0;
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'grade.json' && fs.existsSync(path.join(directory, 'result.json'))) {
        try {
          const cost = readJson(path.join(directory, 'result.json')).total_cost_usd;
          if (typeof cost === 'number') sum += cost; else unpriced += 1;
        } catch { unpriced += 1; }
      }
    }
  };
  walk(out);
  return { usd: sum, unpriced };
}

function otherArmCells(flags) {
  const others = {};
  for (const name of ARM_NAMES.filter((arm) => arm !== flags.arm)) {
    const cells = flags.cases.flatMap((caseId) => armCellDirectories(flags, caseId, name)
      .map((directory) => readCellRecord(directory, caseId, caseKind(flags, caseId))).filter((record) => record !== null));
    if (cells.length > 0) others[name] = cells;
  }
  return others;
}

function armCellDirectories(flags, caseId, arm) {
  const armDirectory = path.join(flags.out, caseId, arm);
  if (!fs.existsSync(armDirectory)) return [];
  return fs.readdirSync(armDirectory).sort().map((run) => path.join(armDirectory, run));
}

function caseKind(flags, caseId) {
  return readJson(path.join(flags.casesDir, caseId, 'case.json')).kind;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const claudeVersion = flags.dryRun ? null : execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim();
  fs.mkdirSync(flags.out, { recursive: true });
  const metaText = `${JSON.stringify({
    arms: [flags.arm], model: MODEL, effort: flags.effort, claudeVersion, fixture: { name: 'replay', commit: null },
    tier: flags.tier, runs: flags.runs, cases: flags.cases, leakGuard: 'claude --restricted --tools Read,Grep,Glob', date: new Date().toISOString(), maxBudgetUsd: flags.maxBudget, maxTotalUsd: Number.isFinite(flags.maxTotal) ? flags.maxTotal : null
  }, null, 2)}\n`;
  const metaFile = path.join(flags.out, 'meta.json');
  const metaPath = fs.existsSync(metaFile) ? path.join(flags.out, `meta-${new Date().toISOString().replace(/[:.]/g, '-')}.json`) : metaFile;
  if (!flags.dryRun) fs.writeFileSync(metaPath, metaText);
  const queue = flags.cases.flatMap((caseId) => Array.from({ length: flags.runs }, (_, i) => [caseId, i + 1]));
  if (flags.dryRun) console.log(`${flags.tier} tier, ${queue.length} cells (${flags.cases.length} cases x ${flags.runs} runs), arm ${flags.arm}; dry run, no claude call made`);
  if (flags.dryRun) console.log(plannedPowerLine({ tasks: flags.cases.length, samples: flags.runs }));
  const results = [];
  const notStarted = [];
  const stopped = [];
  const worker = async () => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      const cell = path.join(flags.out, next[0], flags.arm, String(next[1]));
      const gradeFile = path.join(cell, 'grade.json');
      if (fs.existsSync(gradeFile)) {
        console.log(`skip ${next[0]}/${next[1]}`);
        results.push(readCellRecord(cell, next[0], caseKind(flags, next[0])));
        continue;
      }
      if (spentUsd(flags.out).usd >= flags.maxTotal) { notStarted.push(`${next[0]}/${next[1]}`); continue; }
      try {
        const cellResult = await runCell(flags, next[0], next[1], claudeVersion);
        if (cellResult) results.push(cellResult);
      } catch (error) {
        console.error(`CELL STOPPED ${error.message}`);
        stopped.push(`${next[0]}/${next[1]}`);
        results.push(stoppedRecord({ caseId: next[0], kind: caseKind(flags, next[0]) }));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, flags.concurrency) }, worker));
  const spent = spentUsd(flags.out);
  console.log(`spent $${spent.usd.toFixed(3)} under out (cap ${flags.maxTotal})${spent.unpriced > 0 ? `; ${spent.unpriced} cells without a cost left out of that sum` : ''}`);
  if (stopped.length > 0) { console.log(`stopped cells (counted as failures): ${stopped.join(' ')}`); process.exitCode = 1; }
  if (notStarted.length > 0) console.log(`not started (total cap reached): ${notStarted.join(' ')}`);
  for (const line of summaryLines({ cells: results, others: otherArmCells(flags) })) console.log(line);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
