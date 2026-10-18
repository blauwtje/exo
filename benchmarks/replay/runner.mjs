#!/usr/bin/env node
// replay/runner.mjs
// Runs replay cells: claude-opus-5-5, read-only tools, one temp copy of the case's input/ per cell.
//   node runner.mjs --cases a,b [--runs k] --out runs/<name> [--effort medium] [--concurrency 2]
//                   [--cases-dir cases] [--max-budget-usd 2] [--max-total-usd n] [--cell-timeout-min 30]
//                   [--arm baseline|cue|audit] [--audit-script path] [--dry-run]
// --arm: cells go to <out>/<id>/<arm>/<k>/; cue and audit append the arm paragraph (arm1/arms.json) to prompt.md after a blank line;
//   audit first runs `node <audit-script> <cell>/input` into <cell>/input/audit.md (default arm1/audit.mjs; failure stops the cell).
// --dry-run: build the cell dir and prompt.final.md, stop before the model; no grade, no spend.
// Leak guard: `claude --restricted --tools Read,Grep,Glob` confines the file tools to the
// cell's temp dir and asks no permission headless (checked on 2.1.302: a read outside is denied, not prompted).
// Prints per cell: case, run, grade, cost, wall time, tokens, stop reason; per case: fails out of k and the 10-90% band.

import { spawn, spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withoutParentSession, ISOLATION_ENV } from '../lean-gates.mjs';
import { writeCellUsage } from '../cell-usage.mjs';
import crypto from 'node:crypto';
import { gradeCell } from './grade.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODEL = 'claude-opus-5-5';
const TOOLS = 'Read,Grep,Glob';
const ARMS = JSON.parse(fs.readFileSync(path.join(HERE, 'arm1', 'arms.json'), 'utf8'));
const ARM_NAMES = ['baseline', 'cue', 'audit'];
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const BAND = { low: 0.1, high: 0.9 };

function parseFlags(argv) {
  const flags = { effort: 'medium', concurrency: 2, runs: 1, casesDir: path.join(HERE, 'cases'), maxBudget: 2, maxTotal: Infinity, timeoutMin: 30, cases: null, out: null, arm: 'baseline', auditScript: path.join(HERE, 'arm1', 'audit.mjs'), dryRun: false };
  const names = { '--cases': 'cases', '--runs': 'runs', '--out': 'out', '--effort': 'effort', '--concurrency': 'concurrency', '--cases-dir': 'casesDir', '--max-budget-usd': 'maxBudget', '--max-total-usd': 'maxTotal', '--cell-timeout-min': 'timeoutMin', '--arm': 'arm', '--audit-script': 'auditScript' };
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i] === '--dry-run') { flags.dryRun = true; i -= 1; continue; }
    const key = names[argv[i]];
    if (key === undefined || argv[i + 1] === undefined) throw new Error(`bad flag ${argv[i]}`);
    flags[key] = argv[i + 1];
  }
  for (const key of ['concurrency', 'runs', 'maxBudget', 'maxTotal', 'timeoutMin']) flags[key] = Number(flags[key]);
  if (flags.cases === null || flags.out === null) throw new Error('usage: node runner.mjs --cases a,b [--runs k] --out runs/<name> [--effort e] [--concurrency n]');
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
  const caseDef = JSON.parse(fs.readFileSync(path.join(caseDirectory, 'case.json'), 'utf8'));
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
  const tokens = usage?.counts ? usage.counts.weightedInput + usage.counts.output
    : (result.usage ? (result.usage.input_tokens ?? 0) + (result.usage.output_tokens ?? 0) : 0);
  const stop = [result.subtype, result.stop_reason, result.terminal_reason].filter(Boolean).join('/');
  const line = [caseId, `run${run}`, graded.grade, `$${(result.total_cost_usd ?? 0).toFixed(3)}`, `${(wallMs / 1000).toFixed(1)}s`, `${Math.round(tokens)}tok`, `stop=${stop}`].join('\t');
  console.log(line);
  return { caseId, kind: caseDef.kind, grade: graded.grade };
}

// Summed total_cost_usd of finished cells (those holding grade.json) under out, earlier calls included.
function spentUsd(out) {
  let sum = 0;
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'grade.json' && fs.existsSync(path.join(directory, 'result.json'))) {
        try { sum += JSON.parse(fs.readFileSync(path.join(directory, 'result.json'), 'utf8')).total_cost_usd ?? 0; } catch { /* unreadable result counts as 0 */ }
      }
    }
  };
  walk(out);
  return sum;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const claudeVersion = flags.dryRun ? null : execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim();
  fs.mkdirSync(flags.out, { recursive: true });
  const metaText = `${JSON.stringify({
    arms: [flags.arm], model: MODEL, effort: flags.effort, claudeVersion, fixture: { name: 'replay', commit: null },
    runs: flags.runs, cases: flags.cases, leakGuard: 'claude --restricted --tools Read,Grep,Glob', date: new Date().toISOString(), maxBudgetUsd: flags.maxBudget, maxTotalUsd: Number.isFinite(flags.maxTotal) ? flags.maxTotal : null
  }, null, 2)}\n`;
  const metaFile = path.join(flags.out, 'meta.json');
  const metaPath = fs.existsSync(metaFile) ? path.join(flags.out, `meta-${new Date().toISOString().replace(/[:.]/g, '-')}.json`) : metaFile;
  if (!flags.dryRun) fs.writeFileSync(metaPath, metaText);
  const queue = flags.cases.flatMap((caseId) => Array.from({ length: flags.runs }, (_, i) => [caseId, i + 1]));
  const results = [];
  const notStarted = [];
  const stopped = [];
  const worker = async () => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      const cell = path.join(flags.out, next[0], flags.arm, String(next[1]));
      const gradeFile = path.join(cell, 'grade.json');
      if (fs.existsSync(gradeFile)) {
        console.log(`skip ${next[0]}/${next[1]}`);
        results.push({ caseId: next[0], kind: JSON.parse(fs.readFileSync(path.join(flags.casesDir, next[0], 'case.json'), 'utf8')).kind, grade: JSON.parse(fs.readFileSync(gradeFile, 'utf8')).grade });
        continue;
      }
      if (spentUsd(flags.out) >= flags.maxTotal) { notStarted.push(`${next[0]}/${next[1]}`); continue; }
      try {
        const cellResult = await runCell(flags, next[0], next[1], claudeVersion);
        if (cellResult) results.push(cellResult);
      } catch (error) {
        console.error(`CELL STOPPED ${error.message}`);
        stopped.push(`${next[0]}/${next[1]}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, flags.concurrency) }, worker));
  console.log(`spent $${spentUsd(flags.out).toFixed(3)} under out (cap ${flags.maxTotal})`);
  if (stopped.length > 0) { console.log(`stopped cells: ${stopped.join(' ')}`); process.exitCode = 1; }
  if (notStarted.length > 0) console.log(`not started (total cap reached): ${notStarted.join(' ')}`);
  for (const caseId of flags.cases) {
    const cells = results.filter((r) => r.caseId === caseId);
    if (cells.length === 0) continue;
    const fails = cells.filter((r) => r.grade === 'fail').length;
    const unknown = cells.filter((r) => r.grade === 'unknown' || r.grade === 'leak').length;
    const rate = fails / flags.runs;
    const band = rate >= BAND.low && rate <= BAND.high;
    console.log(`${caseId}\t${cells[0]?.kind ?? '?'}\t${fails}/${flags.runs} fail${unknown ? ` (${unknown} unknown/leak)` : ''}\t${band ? 'IN' : 'outside'} 10-90% band`);
  }
}

main().catch((error) => { console.error(error.message); process.exit(1); });
