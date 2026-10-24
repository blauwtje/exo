#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { runTreeSync } from '../../../lib/process-tree.mjs';
import { environmentMs, isMain, parseFlags, UsageError } from '../../../lib/script-flags.mjs';
import { gate, outOfScope } from './gate.mjs';

const USAGE = 'usage: node round.mjs --root <dir> --tag <tag> (--commit <hash> --idea <path> [--adopt] | --wait)';
const WAIT_MS = environmentMs('EXO_IMPROVE_WAIT_MS', 540_000);
const FINAL = /^(ROW|STOP|REFUSED) /;

const keyText = (key) => `${key.area}/${key.lever}/${key.target}`;
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function git(cwd, ...args) {
  const run = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { ok: run.status === 0, out: (run.stdout ?? '').trim() };
}

function readRows(file) {
  return fs.readFileSync(file, 'utf8').split('\n').slice(1).filter(Boolean).map((line) => {
    const [commit, score, status] = line.split('\t');
    return { commit, score: Number(score), status };
  });
}

function changedHash(cfg, cwd) {
  return Object.entries(cfg.hashes ?? {}).find(([file, hash]) => !fs.existsSync(path.join(cwd, file)) || sha256(path.join(cwd, file)) !== hash)?.[0];
}

function readScore(output, cfg) {
  const matches = [...output.matchAll(new RegExp(cfg.regex, 'g'))];
  const last = matches.at(-1);
  const value = last === undefined ? NaN : Number(last[1] ?? last[0]);
  return Number.isFinite(value) ? value : null;
}

function scoreOnce(cfg, cwd, log) {
  const run = runTreeSync(cfg.command, { cwd, timeoutMs: cfg.limit * 1000 });
  fs.writeFileSync(log, run.output);
  const score = readScore(run.output, cfg);
  return { score, failed: run.status !== 0, infra: run.timedOut || (run.status === 0 && score === null) };
}

// why: a timeout or a zero exit with no score is the harness failing, so it gets one more run; a nonzero exit is the idea failing.
function runScore(cfg, cwd, log) {
  let result = scoreOnce(cfg, cwd, log);
  if (result.infra) {
    const changed = changedHash(cfg, cwd);
    if (changed) return { stop: changed };
    result = scoreOnce(cfg, cwd, log);
  }
  return result.failed || result.score === null ? { crash: true } : { score: result.score };
}

function linesAdded(cwd, from, to) {
  const rows = git(cwd, 'diff', '--numstat', from, to).out.split('\n').filter(Boolean);
  return rows.reduce((sum, row) => { const [add, del] = row.split('\t'); return sum + (Number(add) || 0) - (Number(del) || 0); }, 0);
}

const gain = (cfg, score, base) => (cfg.direction === 'higher' ? score - base : base - score);
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const margin = (cfg) => (cfg.keepMargin ?? 0) * (cfg.sd ?? 0);

// why: "simpler on equal" widens with the margin: a commit that leaves less code is kept on any gain from 0 up to the margin, never on a loss.
function keepOrDiscard({ cfg, cwd, kept, commit, score, base }) {
  const up = gain(cfg, score, base);
  if (up > margin(cfg)) return 'keep';
  return up >= 0 && linesAdded(cwd, kept.commit, commit) < 0 ? 'keep' : 'discard';
}

function readIdeas(dir, tag) {
  const file = path.join(dir, `${tag}.ideas.jsonl`);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : [];
}

// why: every score the kept commit ever got is pooled, so its estimate tightens each confirm round instead of staying at the one score that selected it.
function keptPool(ideas, kept) {
  const own = ideas.find((line) => line.commit === kept.commit && line.status === 'keep' && Array.isArray(line.scores))?.scores ?? [kept.score];
  return [...own, ...ideas.flatMap((line) => (line.kept === kept.commit && Array.isArray(line.keptScores) ? line.keptScores : []))];
}

function scoreAt(cfg, cwd, commit, log) {
  const head = git(cwd, 'rev-parse', 'HEAD').out;
  const branch = git(cwd, 'symbolic-ref', '-q', '--short', 'HEAD').out;
  if (!git(cwd, 'checkout', '-q', '--detach', commit).ok) return { stop: `checkout-failed ${commit}` };
  const result = runScore(cfg, cwd, log);
  const back = branch ? git(cwd, 'checkout', '-q', branch) : git(cwd, 'checkout', '-q', '--detach', head);
  if (!back.ok) return { stop: `checkout-failed ${head}` };
  return result.stop ? { stop: `scorer-changed ${result.stop}` } : result;
}

// why: the keep is never decided on the score that selected the candidate alone; one more candidate score and one fresh kept score, same round, same scorer state.
function confirm({ cfg, cwd, kept, commit, screen, pool, log }) {
  const again = runScore(cfg, cwd, log);
  if (again.stop) return { stop: `scorer-changed ${again.stop}` };
  if (again.crash) return { status: 'crash', score: 0, crash: true, note: 'confirm crash candidate', kept, scores: [screen] };
  const fresh = scoreAt(cfg, cwd, kept.commit, log);
  if (fresh.stop) return { stop: fresh.stop };
  if (fresh.crash) return { status: 'crash', score: 0, crash: true, note: 'confirm crash kept', kept, scores: [screen, again.score] };
  const scores = [screen, again.score];
  const keptScores = [...pool, fresh.score];
  const score = mean(scores);
  const base = mean(keptScores);
  const status = keepOrDiscard({ cfg, cwd, kept, commit, score, base });
  const note = `confirm: candidate ${scores.join(',')}, kept fresh ${fresh.score} pool mean ${base}`;
  return { status, score, delta: score - base, flat: Math.abs(score - base) <= 2 * (cfg.sd ?? 0), kept, note, scores, keptScores: [fresh.score] };
}

function adopt({ cwd, commit, idea, cfg, root, tag }) {
  const verdict = gate({ root, tag, idea });
  if (!verdict.ok) return { refused: verdict.reason };
  const files = git(cwd, 'diff', '--name-only', `${commit}^`, commit).out.split('\n').filter(Boolean);
  const scope = outOfScope(files, cfg);
  if (scope) return { refused: scope };
  if (!git(cwd, 'cherry-pick', commit).ok) {
    git(cwd, 'cherry-pick', '--abort');
    return { refused: 'cherry-pick conflict' };
  }
  return { commit: git(cwd, 'rev-parse', '--short', 'HEAD').out };
}

function decide({ cfg, cwd, root, dir, tag, commit, idea, rows, log }) {
  const kept = rows.filter((r) => r.status === 'keep').at(-1);
  const verdict = gate({ root, tag, idea });
  const scope = outOfScope(git(cwd, 'diff', '--name-only', kept.commit, commit).out.split('\n').filter(Boolean), cfg);
  const refusal = (verdict.ok ? null : `gate: ${verdict.reason}`) ?? scope;
  if (refusal) return { status: 'discard', score: kept.score, crash: true, note: refusal, kept };
  const result = runScore(cfg, cwd, log);
  if (result.stop) return { stop: `scorer-changed ${result.stop}` };
  if (result.crash) return { status: 'crash', score: 0, crash: true, note: 'crash', kept };
  const pool = keptPool(readIdeas(dir, tag), kept);
  const base = mean(pool);
  if (cfg.confirm && gain(cfg, result.score, base) > margin(cfg)) return confirm({ cfg, cwd, kept, commit, screen: result.score, pool, log });
  const status = keepOrDiscard({ cfg, cwd, kept, commit, score: result.score, base });
  return { status, score: result.score, delta: result.score - base, flat: Math.abs(result.score - base) <= 2 * (cfg.sd ?? 0), kept, scores: [result.score] };
}

function record({ dir, tag, rows, commit, idea, outcome, started, cwd }) {
  const { status, score } = outcome;
  const note = outcome.note ? `${outcome.note}; ` : '';
  fs.appendFileSync(path.join(dir, `${tag}.tsv`), `${commit}\t${score}\t${status}\t${note}${git(cwd, 'log', '-1', '--format=%s', commit).out || keyText(idea.key)}\n`);
  const line = {
    round: rows.length, key: keyText(idea.key), parts: (idea.parts ?? [idea.key]).map(keyText), commit, score, status,
    delta: outcome.delta ?? 0, flat: outcome.flat ?? false, crash: outcome.crash ?? false, started, at: new Date().toISOString(),
    ...(outcome.scores ? { scores: outcome.scores } : {}), ...(outcome.keptScores ? { kept: outcome.kept.commit, keptScores: outcome.keptScores } : {}),
  };
  fs.appendFileSync(path.join(dir, `${tag}.ideas.jsonl`), `${JSON.stringify(line)}\n`);
}

const noKeepStreak = (rows) => rows.length - 1 - rows.findLastIndex((row) => row.status === 'keep');

function runRound(flags) {
  const root = path.resolve(flags.root);
  const dir = path.join(root, '.exo', 'improve');
  const statusFile = path.join(dir, `${flags.tag}.status`);
  const idea = JSON.parse(fs.readFileSync(flags.idea, 'utf8'));
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, `${flags.tag}.json`), 'utf8'));
  const cwd = cfg.worktree ? path.resolve(root, cfg.worktree) : root;
  const started = new Date().toISOString();
  const finish = (line, code = 0) => { fs.writeFileSync(statusFile, `${line}\n`); process.stdout.write(`${line}\n`); process.exit(code); };
  fs.writeFileSync(statusFile, 'RUNNING\n');
  const changed = changedHash(cfg, cwd);
  if (changed) finish(`STOP scorer-changed ${changed}`, 1);
  let commit = flags.commit;
  if (flags.adopt) {
    const adopted = adopt({ cwd, commit, idea, cfg, root, tag: flags.tag });
    if (adopted.refused) finish(`REFUSED ${adopted.refused}`);
    commit = adopted.commit;
  }
  const rows = readRows(path.join(dir, `${flags.tag}.tsv`));
  const outcome = decide({ cfg, cwd, root, dir, tag: flags.tag, commit, idea, rows, log: path.join(dir, 'run.log') });
  if (outcome.stop) finish(`STOP ${outcome.stop}`, 1);
  if (outcome.status === 'keep') outcome.best = outcome.score;
  else if (!git(cwd, 'reset', '--hard', outcome.kept.commit).ok) finish(`STOP reset-failed ${outcome.kept.commit}`, 1);
  record({ dir, tag: flags.tag, rows, commit, idea, outcome, started, cwd });
  const row = `ROW ${commit} ${outcome.score} ${outcome.status} best=${outcome.best ?? outcome.kept.score}`;
  const dry = noKeepStreak([...rows, outcome]);
  if (cfg.stopAfter > 0 && dry >= cfg.stopAfter) {
    process.stdout.write(`${row}\n`);
    finish(`STOP no-keep ${cfg.stopAfter}`);
  }
  finish(row);
}

function wait(flags) {
  const statusFile = path.join(path.resolve(flags.root), '.exo', 'improve', `${flags.tag}.status`);
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  for (let waited = 0; waited <= WAIT_MS; waited += 1000) {
    const text = fs.existsSync(statusFile) ? fs.readFileSync(statusFile, 'utf8').trim() : '';
    if (FINAL.test(text)) return process.stdout.write(`${text}\n`);
    Atomics.wait(sleeper, 0, 0, 1000);
  }
  process.stdout.write('WAIT\n');
}

function main() {
  let flags;
  try {
    flags = parseFlags(process.argv.slice(2), { root: 'string', tag: 'string', commit: 'string', idea: 'string', adopt: 'boolean', wait: 'boolean' }, { usage: USAGE });
    const need = flags.wait ? ['root', 'tag'] : ['root', 'tag', 'commit', 'idea'];
    for (const name of need) if (!flags[name]) throw new UsageError(`--${name} is required`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }
  if (flags.wait) wait(flags);
  else runRound(flags);
}

if (isMain(import.meta.url)) main();
