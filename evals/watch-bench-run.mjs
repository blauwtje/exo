#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { projectFolder } from '../skills/learn/scripts/sessions.mjs';
import { appendRows, callsIn, dropRows, passRows, readCases, resultsDirectory, standIn, ytdlpCalls } from './watch-bench.mjs';
import { claimsOf, judgePrompt, parseLines, plantedMissed, toolOrder, transcriptLines, verdictsOf, windowOf } from './watch-bench-metrics.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const USAGE = [
  'usage: node watch-bench-run.mjs --label <label> --max-usd <n> [--dry-run]',
  '       node watch-bench-run.mjs --rejudge <label>',
  '       node watch-bench-run.mjs --record <label>',
  'Runs every case of watch-bench.cases.json as a headless claude session, judges the answers, keeps them under results/watch-bench/<label>/ and appends the rows to watch-bench.md.',
  'Exit codes: 0 done; 1 refused or an error row; 2 bad usage; 75 rate limited.'
].join('\n');

const ALLOWED_TOOLS = 'Skill,Read,Write,Agent,Bash(node *)';
const RATE_LIMIT = /rate.?limit|429|overloaded/i;
const TRANSCRIPT_FIELD = /transcript=(\S+?\/([\w-]{11})\/transcript\.txt)/g;
const CENTS = 100;

const cents = (usd) => Math.round(usd * CENTS);
const sessionUsd = (benchCase, budgets) => (benchCase.name === 'batch' ? budgets.batchUsd : benchCase.sessionUsd);

export function plan(cases, budgets) {
  const sessions = cases.flatMap((benchCase) => Array.from({ length: benchCase.runs }, () => ({ kind: 'run', cents: cents(sessionUsd(benchCase, budgets)) })));
  const judges = sessions.map(() => ({ kind: 'judge', cents: cents(budgets.judgeUsd) }));
  return [...sessions, ...judges];
}

function claude(args, { cwd, env, input }) {
  return new Promise((resolve) => {
    const child = spawn('claude', args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => resolve({ code: 1, stdout, stderr: `${stderr}${error.message}` }));
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
    child.stdin.on('error', () => {});
    child.stdin.end(input ?? '');
  });
}

function resultOf(stdout) {
  const result = parseLines(stdout).findLast((line) => line.type === 'result');
  return { answer: typeof result?.result === 'string' ? result.result.trim() : '', subtype: result?.subtype ?? 'missing', isError: result?.is_error === true };
}

function copySession(sessionId, work, directory) {
  const folder = projectFolder(work);
  const session = path.join(folder, `${sessionId}.jsonl`);
  if (!fs.existsSync(session)) return false;
  fs.copyFileSync(session, path.join(directory, 'session.jsonl'));
  const subagents = path.join(folder, sessionId, 'subagents');
  if (fs.existsSync(subagents)) fs.cpSync(subagents, path.join(directory, 'subagents'), { recursive: true });
  return true;
}

function copyTranscripts(directory) {
  const texts = [path.join(directory, 'session.jsonl')];
  const subagents = path.join(directory, 'subagents');
  if (fs.existsSync(subagents)) texts.push(...fs.readdirSync(subagents).map((name) => path.join(subagents, name)));
  const target = path.join(directory, 'transcripts');
  fs.mkdirSync(target, { recursive: true });
  for (const file of texts) {
    for (const [, source, id] of fs.readFileSync(file, 'utf8').matchAll(TRANSCRIPT_FIELD)) {
      if (fs.existsSync(source)) fs.copyFileSync(source, path.join(target, `${id}.txt`));
    }
  }
}

async function runOnce(benchCase, run, context) {
  const directory = path.join(context.base, benchCase.name, String(run));
  fs.mkdirSync(directory, { recursive: true });
  const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'exo-watch-run-')));
  const count = path.join(work, 'count.txt');
  const sessionId = crypto.randomUUID();
  const budget = sessionUsd(benchCase, context.budgets);
  const args = ['-p', benchCase.request, '--plugin-dir', ROOT, '--model', 'sonnet', '--output-format', 'stream-json', '--verbose', '--max-budget-usd', String(budget), '--session-id', sessionId, '--allowedTools', ALLOWED_TOOLS];
  const env = { ...process.env, EXO_WATCH_STORE: context.store, EXO_YTDLP: context.standIn, EXO_BENCH_COUNT: count };
  const started = await claude(args, { cwd: work, env });
  fs.writeFileSync(path.join(directory, 'stdout.jsonl'), started.stdout);
  fs.writeFileSync(path.join(directory, 'stderr.txt'), started.stderr);
  fs.writeFileSync(path.join(directory, 'count.txt'), String(callsIn(count)));
  const { answer, subtype, isError } = resultOf(started.stdout);
  const errors = [];
  if (started.code !== 0) errors.push(`exit ${started.code}`);
  if (subtype !== 'success' || isError) errors.push(`result ${subtype}`);
  if (answer === '') errors.push('no answer');
  if (RATE_LIMIT.test(`${started.stderr}${isError ? answer : ''}`)) errors.push('rate limited');
  if (run === 1 && callsIn(count) === 0) errors.push('run 1 made no yt-dlp call, so it did not start cold or the stand-in was not used');
  fs.writeFileSync(path.join(directory, 'answer.md'), `${answer}\n`);
  if (copySession(sessionId, work, directory)) {
    copyTranscripts(directory);
    fs.writeFileSync(path.join(directory, 'tool-order.txt'), `${toolOrder(parseLines(fs.readFileSync(path.join(directory, 'session.jsonl'), 'utf8'))).join('\n')}\n`);
  } else {
    errors.push('no session file');
  }
  fs.writeFileSync(path.join(directory, 'meta.json'), JSON.stringify({ sessionId, errors }));
  return { directory, errors };
}

const textOf = (line) => line.text;

function plantedPair(items, pool) {
  const own = items.find((item) => item.lines.length > 0);
  if (!own) return undefined;
  const foreign = Object.entries(pool).find(([id, text]) => id !== own.id && transcriptLines(text).length > 0);
  if (!foreign) return undefined;
  return [
    { claim: textOf(own.lines[0]), lines: own.lines, id: own.id },
    { claim: textOf(transcriptLines(foreign[1])[0]), lines: own.lines, id: own.id }
  ];
}

async function judgeRun({ directory, errors }, pool, work, budgets) {
  const read = (name) => fs.readFileSync(path.join(directory, name), 'utf8');
  const transcripts = fs.existsSync(path.join(directory, 'transcripts')) ? Object.fromEntries(fs.readdirSync(path.join(directory, 'transcripts')).map((name) => [name.replace(/\.txt$/, ''), read(path.join('transcripts', name))])) : {};
  const items = claimsOf(read('answer.md')).map((claim) => ({ claim: claim.text, id: claim.id, lines: windowOf(transcripts[claim.id] ?? '', claim.second) }));
  if (items.length === 0) {
    fs.writeFileSync(path.join(directory, 'verdicts.json'), '[]');
    return;
  }
  const planted = plantedPair(items, pool);
  if (!planted) {
    errors.push(NO_LINES_ERROR);
    return;
  }
  const asked = await claude(['-p', '--model', 'sonnet', '--max-budget-usd', String(budgets.judgeUsd), '--tools', ''], { cwd: work, env: process.env, input: judgePrompt([...items, ...planted]) });
  fs.writeFileSync(path.join(directory, 'judge.txt'), asked.stdout);
  const verdicts = verdictsOf(asked.stdout, items.length + 2);
  const [own, foreign] = verdicts.slice(items.length);
  if (asked.code !== 0 || verdicts.some((verdict) => verdict === undefined) || plantedMissed({ own, foreign })) errors.push(JUDGE_ERROR);
  fs.writeFileSync(path.join(directory, 'verdicts.json'), JSON.stringify(verdicts.slice(0, items.length).map((verdict) => verdict ?? 'fail')));
}

function poolOf(runs) {
  const pool = {};
  for (const { directory } of runs) {
    const folder = path.join(directory, 'transcripts');
    if (!fs.existsSync(folder)) continue;
    for (const name of fs.readdirSync(folder)) pool[name.replace(/\.txt$/, '')] = fs.readFileSync(path.join(folder, name), 'utf8');
  }
  return pool;
}

async function execute(label, cases, budgets) {
  const base = path.join(resultsDirectory(), label);
  const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'exo-watch-bench-')));
  const context = { base, budgets, store: path.join(work, 'store'), standIn: standIn(work) };
  const runs = [];
  for (const benchCase of cases) {
    for (let run = 1; run <= benchCase.runs && !runs.some((done) => done.errors.includes('rate limited')); run += 1) {
      const done = await runOnce(benchCase, run, context);
      console.log(`${benchCase.name} run ${run}: ${done.errors.length ? `error row (${done.errors.join('; ')})` : 'ok'}`);
      runs.push(done);
    }
  }
  const pool = poolOf(runs);
  for (const done of runs) {
    if (fs.readFileSync(path.join(done.directory, 'answer.md'), 'utf8').trim() === '') continue;
    await judgeRun(done, pool, work, budgets);
    fs.writeFileSync(path.join(done.directory, 'meta.json'), JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(done.directory, 'meta.json'), 'utf8')), errors: done.errors }));
  }
  return runs;
}

const JUDGE_ERROR = 'judge failed or missed a planted claim';
const NO_LINES_ERROR = 'no claim with transcript lines to judge';

async function rejudge(label, budgets) {
  const base = path.join(resultsDirectory(), label);
  const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'exo-watch-bench-')));
  const runs = fs.readdirSync(base).flatMap((name) => fs.readdirSync(path.join(base, name)).map((run) => {
    const directory = path.join(base, name, run);
    return { directory, errors: JSON.parse(fs.readFileSync(path.join(directory, 'meta.json'), 'utf8')).errors };
  }));
  const pool = poolOf(runs);
  for (const done of runs.filter((run) => run.errors.length > 0 && run.errors.every((error) => error === JUDGE_ERROR || error === NO_LINES_ERROR))) {
    done.errors.length = 0;
    await judgeRun(done, pool, work, budgets);
    const meta = path.join(done.directory, 'meta.json');
    fs.writeFileSync(meta, JSON.stringify({ ...JSON.parse(fs.readFileSync(meta, 'utf8')), errors: done.errors }));
    console.log(`${path.relative(base, done.directory)}: ${done.errors.length ? `error row (${done.errors.join('; ')})` : 'ok'}`);
  }
  return 0;
}

function record(label) {
  const { counts, rateLimited } = ytdlpCalls(2);
  if (rateLimited) console.error('yt-dlp is rate limited; the ytdlp-calls row is missing');
  const calls = counts.length === 0 ? [] : [{ row: 'ytdlp-calls', value: counts.at(-1), runs: counts.length, low: Math.min(...counts), high: Math.max(...counts), errors: 0 }];
  const commit = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim() || 'unknown';
  const rows = [...passRows(label), ...calls];
  appendRows(label, rows, commit);
  rows.forEach((row) => console.log(`${row.row}: ${row.value} (runs ${row.runs}, spread ${row.low} to ${row.high}, error rows ${row.errors})`));
  return rateLimited;
}

async function main(argv) {
  const flags = parseFlags(argv, { label: 'string', 'max-usd': 'string', 'dry-run': 'boolean', rejudge: 'string', record: 'string' }, { usage: USAGE });
  if (flags.record) return dropRows(flags.record) + (record(flags.record) ? 1 : 0);
  if (flags.rejudge) return rejudge(flags.rejudge, readCases().budgets);
  if (!/^[\w-]+$/.test(flags.label ?? '')) throw new UsageError('give --label <label> of letters, digits, - and _');
  const limit = Number(flags['max-usd']);
  if (!(limit > 0)) throw new UsageError('give --max-usd <n> above 0');
  const { budgets, cases } = readCases();
  const sessions = plan(cases, budgets);
  const sum = sessions.reduce((total, session) => total + session.cents, 0);
  console.log(`sessions: ${sessions.length}, budget sum: ${(sum / CENTS).toFixed(2)} USD, limit: ${limit.toFixed(2)} USD`);
  if (sum > cents(limit)) {
    console.error(`refused: the budget sum ${(sum / CENTS).toFixed(2)} USD is over --max-usd ${limit.toFixed(2)}`);
    return 1;
  }
  if (flags['dry-run']) return 0;
  if (fs.existsSync(path.join(resultsDirectory(), flags.label))) {
    console.error(`refused: ${path.join(resultsDirectory(), flags.label)} exists; a new pass needs a new label`);
    return 1;
  }
  const runs = await execute(flags.label, cases, budgets);
  const rateLimited = record(flags.label);
  const failed = runs.filter((done) => done.errors.length > 0).length;
  console.log(`error rows: ${failed} of ${runs.length}`);
  return failed > 0 || rateLimited ? 1 : 0;
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => {
    console.error(error.message);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  });
}
