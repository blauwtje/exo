#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { gitLine } from '#git';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { runTreeSync } from '../../../lib/process-tree.mjs';
import { isMain, parseFlags, UsageError } from '../../../lib/script-flags.mjs';
import { decideKeep, mean, pooledSd } from '../../../lib/eval-stats.mjs';
import { clearlyWorse, heldOutDiff, itemsMean, splitItems } from '../../../lib/holdout.mjs';
import { loadRunConfig } from '../../build/scripts/run-config.mjs';
import { matchScope, outOfScope, ScopeError } from './scope.mjs';

const USAGE = 'usage: node round.mjs --root <dir> --tag <tag> --commit <hash>\n       node round.mjs --root <dir> --tag <tag> --report\n--report prints HOLDOUT baseline=<mean> best=<mean> diff= lo= hi= cases=<n> for the held-out cases of the best kept commit against the baseline, or HOLDOUT none.\nWith held-out cases in <tag>.json, the score, keep rule, logs, OUT and CASES lines use the tuning ITEM lines only; a keep whose held-out paired diff has its keepZ upper bound below 0 becomes discard-holdout.\nOutput: ROW <hash> <score> keep|discard|discard-holdout|crash|timeout|not-one-commit best=<score>, not-one-commit when <hash> is not exactly one commit on the kept commit; the description of each row carries lines=+<added>/-<removed> against the kept commit; score - when none was measured; a run past the limit in <tag>.json is killed and ends the round as timeout, never a keep; or STOP <reason> <detail> with exit 1 (scorer-changed, reset-failed, no-keep). When the score prints ITEM lines, stderr first carries CASES <id> <kept>-><candidate>, ... with the defaults.improve.caseMovers largest per-case moves against the kept commit, on every row. After any row but a keep, stderr carries the score command\'s last output lines as OUT <line>, stack frames left out. Both go to the brief\'s Last round section too. The score command runs up to defaults.improve.maxRuns times, until the keep rule decides, each run with env EXO_SEED=<seed in <tag>.json>; each run\'s output goes to .exo/improve/<tag>.logs/<commit>-<n>.log and run.log, its samples to <tag>.samples.jsonl.';
const NO_KEEP_STOP = 10;
const BRIEF_ROWS = 15;
const TEMPLATE = new URL('../references/worker.md', import.meta.url);
const SKILL_DIR = path.dirname(path.dirname(new URL(import.meta.url).pathname));

export function filesUnder(cwd, entry) {
  const full = path.join(cwd, entry);
  if (!fs.existsSync(full)) return [];
  if (!fs.statSync(full).isDirectory()) return [entry];
  return fs.readdirSync(full, { recursive: true, withFileTypes: true })
    .filter((item) => item.isFile())
    .map((item) => path.relative(cwd, path.join(item.parentPath, item.name)));
}

export function scorerHash(cwd, entries) {
  const hash = crypto.createHash('sha256');
  const files = [...new Set(entries.flatMap((entry) => filesUnder(cwd, entry)))].sort();
  for (const file of files) hash.update(`${file}\0`).update(fs.readFileSync(path.join(cwd, file))).update('\0');
  return hash.digest('hex');
}

export function readScore(output, regex) {
  const last = [...output.matchAll(new RegExp(regex, 'g'))].at(-1);
  const value = last === undefined ? NaN : Number(last[1] ?? last[0]);
  return Number.isFinite(value) ? value : null;
}

export const readRows = (file) => fs.readFileSync(file, 'utf8').split('\n').slice(1).filter(Boolean).map((line) => {
  const [commit, score, status, ...description] = line.split('\t');
  return { commit, score: Number(score), status, description: description.join('\t') };
});

const scoreText = (score) => (Number.isFinite(score) ? String(score) : '-');

export const lastKeep = (rows) => rows.filter((row) => row.status === 'keep').at(-1);

export function readItems(output) {
  const items = {};
  for (const [, id, text] of output.matchAll(/^ITEM (\S+) (\S+)\s*$/gm)) {
    const value = Number(text);
    if (Number.isFinite(value)) items[id] = value;
  }
  return items;
}

export const emptySamples = () => ({ runs: [], items: {}, aborted: 0 });

export function addRun(samples, run) {
  samples.runs.push(run.score);
  for (const [id, value] of Object.entries(run.items)) samples.items[id] = [...(samples.items[id] ?? []), value];
  for (const [id, value] of Object.entries(run.held ?? {})) {
    samples.held ??= {};
    samples.held[id] = [...(samples.held[id] ?? []), value];
  }
}

const heldIds = (cfg) => cfg.holdout?.held ?? [];

export function readRun(output, cfg) {
  const items = readItems(output);
  if (heldIds(cfg).length === 0) return { score: readScore(output, cfg.regex), items, held: {} };
  const { tune, held } = splitItems(items, heldIds(cfg));
  const mean = itemsMean(Object.fromEntries(Object.entries(tune).map(([id, value]) => [id, [value]])));
  return { score: mean === null ? null : round4(mean), items: tune, held };
}

function visibleOutput(output, cfg) {
  const held = new Set(heldIds(cfg));
  if (held.size === 0) return output;
  const score = new RegExp(cfg.regex);
  const hidden = (line) => held.has(/^ITEM (\S+) /.exec(line)?.[1]) || score.test(line);
  return output.split('\n').filter((line) => !hidden(line)).join('\n');
}

const samplesFile = (dir, tag) => path.join(dir, `${tag}.samples.jsonl`);

const appendSamples = (dir, tag, entry) => fs.appendFileSync(samplesFile(dir, tag), `${JSON.stringify(entry)}\n`);

function sampleLines(dir, tag) {
  const file = samplesFile(dir, tag);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : [];
}

function keptSamples(lines, kept) {
  const entry = lines.findLast((line) => line.commit === kept.commit && line.runs?.length > 0);
  return entry ? { runs: entry.runs, items: entry.items ?? {}, held: entry.held ?? {} } : { runs: [kept.score], items: {}, held: {} };
}

const scorerNoise = (lines, cfg) => pooledSd(lines.map((line) => line.runs ?? []).filter((runs) => runs.length > 1), cfg.noiseSd ?? null);

export const improveDefaults = (home = os.homedir()) => loadRunConfig({ home }).defaults.improve;

export const scoreEnv = (cfg) => ({ ...process.env, EXO_SEED: String(cfg.seed ?? improveDefaults().seed) });

function treeFiles(cwd, commit) {
  return (gitLine(cwd, ['ls-tree', '-r', '-z', '-l', commit]) ?? '').split('\0').filter(Boolean).map((line) => {
    const [meta, file] = line.split('\t');
    return { file, bytes: Number(meta.split(/\s+/)[3]) };
  }).filter((entry) => Number.isFinite(entry.bytes));
}

function fence(text) {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((run) => run[0].length));
  return '`'.repeat(longest + 1);
}

function matchOrNone(names, entries) {
  try {
    return matchScope(names, entries);
  } catch (error) {
    if (!(error instanceof ScopeError)) throw error;
    return new Set();
  }
}

function scopedTree(cwd, cfg, base) {
  const tree = treeFiles(cwd, base);
  const names = tree.map((entry) => entry.file);
  const readOnly = matchOrNone(names, cfg.readOnly);
  const scope = matchOrNone(names, cfg.scope);
  return { editable: tree.filter((entry) => scope.has(entry.file) && !readOnly.has(entry.file)), frozen: tree.filter((entry) => readOnly.has(entry.file)), readOnly };
}

export const editableBytes = ({ cwd, cfg, base }) => scopedTree(cwd, cfg, base).editable.reduce((sum, entry) => sum + entry.bytes, 0);

function filesAtBase({ cwd, cfg, base, capBytes }) {
  const { editable, frozen, readOnly } = scopedTree(cwd, cfg, base);
  const wanted = [...editable, ...frozen];
  let left = capBytes;
  const shown = [];
  for (const entry of wanted) {
    if (entry.bytes > left) continue;
    const text = spawnSync('git', ['show', `${base}:${entry.file}`], { cwd, encoding: 'utf8' }).stdout ?? '';
    if (text.includes('\0')) continue;
    left -= entry.bytes;
    const mark = fence(text);
    shown.push(`### \`${entry.file}\`${readOnly.has(entry.file) ? ' (read-only)' : ''}\n\n${mark}\n${text.replace(/\n$/, '')}\n${mark}`);
  }
  const rest = wanted.length - shown.length;
  return [...shown, ...(rest > 0 ? [`${rest} more matching files not shown; over the ${capBytes}-byte cap or binary.`] : [])].join('\n\n') || 'none';
}

export function writeBrief({ dir, tag, cfg, rows, last = null }) {
  const kept = lastKeep(rows);
  const worktree = path.resolve(dir, '..', '..', cfg.worktree);
  const history = rows.slice(-BRIEF_ROWS).map((row) => `${row.commit} ${scoreText(row.score)} ${row.status} ${row.description}`).join('\n');
  const values = {
    '<goal>': cfg.goal, '<scope>': cfg.scope.join(', '), '<readonly>': cfg.readOnly.join(', ') || 'none', '<command>': cfg.command,
    '<direction>': cfg.direction === 'higher' ? 'higher is better' : 'lower is better', '<worktree>': worktree,
    '<base>': kept.commit, '<best>': String(kept.score), '<mde>': String(cfg.noise?.mde ?? 'unknown'), '<fastcheck>': path.join(SKILL_DIR, 'scripts', 'fast-check.mjs'),
    '<root>': path.resolve(dir, '..', '..'), '<tag>': tag, '<rows>': history, '<last>': last === null ? 'none' : `${fence(last)}\n${last}\n${fence(last)}`,
    '<files>': filesAtBase({ cwd: worktree, cfg, base: kept.commit, capBytes: improveDefaults().briefFileBytes }),
  };
  const brief = Object.entries(values).reduce((text, [name, value]) => text.split(name).join(value), fs.readFileSync(TEMPLATE, 'utf8'));
  const file = path.join(dir, `${tag}.brief.md`);
  fs.writeFileSync(file, brief);
  return file;
}

function scoreOnce(cfg, cwd, logs) {
  const run = runTreeSync(cfg.command, { cwd, timeoutMs: cfg.limit * 1000, env: scoreEnv(cfg) });
  const output = visibleOutput(run.output, cfg);
  for (const log of logs) {
    fs.mkdirSync(path.dirname(log), { recursive: true });
    fs.writeFileSync(log, output);
  }
  const { score, items, held } = readRun(run.output, cfg);
  return { score, items, held, output, timedOut: run.timedOut, failed: run.status !== 0, infra: run.status === 0 && score === null };
}

function sampleRuns({ cfg, cwd, logs, judge }) {
  const samples = emptySamples();
  const budget = keepSettings().maxRuns;
  let output = '';
  for (let attempt = 1; attempt <= budget; attempt += 1) {
    const run = scoreOnce(cfg, cwd, logs(attempt));
    output = run.output;
    if (run.timedOut) return { timeout: true, output, samples };
    if (run.infra) {
      samples.aborted += 1;
      continue;
    }
    if (run.failed) return { crash: true, output, samples };
    addRun(samples, run);
    const verdict = judge(samples, samples.runs.length + budget - attempt);
    if (verdict.verdict !== 'repeat') return { samples, verdict, output };
  }
  if (samples.runs.length === 0) return { crash: true, output, samples };
  return { samples, verdict: judge(samples, samples.runs.length), output };
}

function outputTail(output, count = improveDefaults().outputLines) {
  const frame = /^\s+at \S|^Node\.js v\d/;
  return output.split('\n').map((line) => line.trimEnd()).filter((line) => line.trim() && !frame.test(line)).slice(-count);
}

const diffLines = (cwd, from, to) => (gitLine(cwd, ['diff', '--numstat', from, to]) ?? '').split('\n').filter(Boolean)
  .reduce((sum, row) => { const [add, del] = row.split('\t'); return { added: sum.added + (Number(add) || 0), removed: sum.removed + (Number(del) || 0) }; }, { added: 0, removed: 0 });

function keepSettings(defaults = improveDefaults()) {
  return { maxRuns: defaults.maxRuns, z: defaults.keepZ, floor: defaults.keepFloor };
}

const flip = (values) => values.map((value) => -value);

function oriented(cfg, samples) {
  if (cfg.direction === 'higher') return samples;
  return { runs: flip(samples.runs), items: Object.fromEntries(Object.entries(samples.items ?? {}).map(([id, values]) => [id, flip(values)])) };
}

export function judgeKeep({ cfg, best, samples, shrinks, maxRuns, noiseSd = null }) {
  const { z, floor } = keepSettings();
  const result = decideKeep({ best: oriented(cfg, best), candidate: oriented(cfg, samples), z, floor, maxRuns, noiseSd });
  if (result.verdict !== 'discard' || result.diff < 0 || !shrinks) return result;
  if (result.se !== 0 && result.n < maxRuns) return { ...result, verdict: 'repeat', reason: 'tie-shrinks' };
  return { ...result, verdict: 'keep', reason: 'tie-shrinks' };
}

const round4 = (value) => Number(value.toFixed(4));

export const sampleScore = (runs) => (runs.length === 1 ? runs[0] : round4(runs.reduce((sum, value) => sum + value, 0) / runs.length));

function statsNote(verdict, samples) {
  if (verdict.n === 1 && samples.aborted === 0 && verdict.se === 0) return null;
  const shown = (value) => (value === null ? 'null' : String(round4(value)));
  return `n=${verdict.n} se=${shown(verdict.se)} lo=${shown(verdict.lo)} hi=${shown(verdict.hi)} aborted=${samples.aborted}`;
}

function commitsOnKept(cwd, kept, commit) {
  if (gitLine(cwd, ['merge-base', '--is-ancestor', kept, commit]) === null) return `not on ${kept}`;
  const count = Number(gitLine(cwd, ['rev-list', '--count', `${kept}..${commit}`]));
  return count === 1 ? null : `${count} commits on ${kept}`;
}

const sign = (cfg) => (cfg.direction === 'higher' ? 1 : -1);

const heldOutFails = (cfg, best, samples) => heldIds(cfg).length > 0 && clearlyWorse(heldOutDiff(best.held, samples.held, { z: keepSettings().z, sign: sign(cfg) }));

function holdoutReport(cfg, rows, stored) {
  if (heldIds(cfg).length === 0) return 'HOLDOUT none';
  const base = keptSamples(stored, rows[0]).held;
  const best = keptSamples(stored, lastKeep(rows)).held;
  const check = heldOutDiff(base, best, { z: keepSettings().z });
  const shown = (value) => (value === null || value === undefined ? 'null' : String(round4(value)));
  if (check === null) return 'HOLDOUT none';
  return `HOLDOUT baseline=${shown(itemsMean(base))} best=${shown(itemsMean(best))} diff=${shown(check.mean)} lo=${shown(check.lo)} hi=${shown(check.hi)} cases=${check.cases}`;
}

function decide({ cfg, cwd, dir, tag, commit, rows }) {
  const kept = lastKeep(rows);
  const stacked = commitsOnKept(cwd, kept.commit, commit);
  if (stacked) return { status: 'not-one-commit', score: null, kept, note: `${stacked}, want one` };
  const lines = diffLines(cwd, kept.commit, commit);
  const files = (gitLine(cwd, ['diff', '--name-only', kept.commit, commit]) ?? '').split('\n').filter(Boolean);
  const refusal = outOfScope(files, cfg);
  if (refusal) return { status: 'discard', score: kept.score, kept, note: refusal, lines };
  const stored = sampleLines(dir, tag);
  const best = keptSamples(stored, kept);
  const noiseSd = scorerNoise(stored, cfg);
  const shrinks = lines.added < lines.removed;
  const logs = (attempt) => [path.join(dir, `${tag}.logs`, `${commit}-${attempt}.log`), path.join(dir, 'run.log')];
  const judge = (samples, maxRuns) => judgeKeep({ cfg, best, samples, shrinks, maxRuns, noiseSd });
  const result = sampleRuns({ cfg, cwd, logs, judge });
  if (result.timeout) return { status: 'timeout', score: null, kept, note: `timeout over ${cfg.limit}s`, lines, best, output: result.output, samples: result.samples };
  if (result.crash) return { status: 'crash', score: 0, kept, note: 'crash', lines, best, output: result.output, samples: result.samples };
  const { samples, verdict } = result;
  const status = verdict.verdict === 'keep' && heldOutFails(cfg, best, samples) ? 'discard-holdout' : verdict.verdict;
  return { status, score: sampleScore(samples.runs), kept, note: statsNote(verdict, samples), lines, best, output: result.output, samples };
}

function record({ dir, tag, commit, outcome, cwd }) {
  if (outcome.samples) appendSamples(dir, tag, { commit, status: outcome.status, ...outcome.samples });
  const size = outcome.lines ? `lines=+${outcome.lines.added}/-${outcome.lines.removed}` : null;
  const note = [outcome.note, size].filter(Boolean).join(' ');
  const subject = gitLine(cwd, ['log', '-1', '--format=%s', commit]) ?? '';
  fs.appendFileSync(path.join(dir, `${tag}.tsv`), `${commit}\t${scoreText(outcome.score)}\t${outcome.status}\t${note ? `${note}; ` : ''}${subject}\n`);
}


export function caseMovers(best, candidate, count = improveDefaults().caseMovers) {
  const ids = Object.keys(candidate?.items ?? {}).filter((id) => best?.items?.[id]?.length > 0 && candidate.items[id].length > 0);
  if (ids.length === 0) return null;
  const moves = ids.map((id) => ({ id, from: round4(mean(best.items[id])), to: round4(mean(candidate.items[id])) }))
    .filter((move) => move.from !== move.to)
    .sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from) || a.id.localeCompare(b.id));
  if (moves.length === 0) return 'CASES none moved';
  return `CASES ${moves.slice(0, count).map((move) => `${move.id} ${move.from}->${move.to}`).join(', ')}`;
}

function roundLines(commit, outcome, best) {
  const cases = caseMovers(outcome.best, outcome.samples);
  const out = outcome.status !== 'keep' && outcome.output ? outputTail(outcome.output).map((line) => `OUT ${line}`) : [];
  return { row: `ROW ${commit} ${scoreText(outcome.score)} ${outcome.status} best=${best}`, notes: [...(cases ? [cases] : []), ...out] };
}

const noKeepStreak = (rows) => rows.length - 1 - rows.findLastIndex((row) => row.status === 'keep');

function runRound(flags) {
  const root = path.resolve(flags.root);
  const dir = path.join(root, '.exo', 'improve');
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, `${flags.tag}.json`), 'utf8'));
  const cwd = path.resolve(root, cfg.worktree);
  const finish = (line, code = 0) => { process.stdout.write(`${line}\n`); process.exit(code); };
  if (scorerHash(cwd, cfg.readOnly) !== cfg.scorerHash) finish('STOP scorer-changed score-files', 1);
  const rows = readRows(path.join(dir, `${flags.tag}.tsv`));
  if (gitLine(cwd, ['reset', '--hard', flags.commit]) === null) finish(`STOP reset-failed ${flags.commit}`, 1);
  const outcome = decide({ cfg, cwd, dir, tag: flags.tag, commit: flags.commit, rows });
  if (outcome.status !== 'keep' && gitLine(cwd, ['reset', '--hard', outcome.kept.commit]) === null) finish(`STOP reset-failed ${outcome.kept.commit}`, 1);
  record({ dir, tag: flags.tag, commit: flags.commit, outcome, cwd });
  const after = readRows(path.join(dir, `${flags.tag}.tsv`));
  const { row, notes } = roundLines(flags.commit, outcome, lastKeep(after).score);
  writeBrief({ dir, tag: flags.tag, cfg, rows: after, last: [row, ...notes].join('\n') });
  process.stdout.write(`${row}\n`);
  for (const line of notes) process.stderr.write(`${line}\n`);
  if (noKeepStreak(after) >= NO_KEEP_STOP) finish(`STOP no-keep ${NO_KEEP_STOP}`);
}

function report(flags) {
  const dir = path.join(path.resolve(flags.root), '.exo', 'improve');
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, `${flags.tag}.json`), 'utf8'));
  process.stdout.write(`${holdoutReport(cfg, readRows(path.join(dir, `${flags.tag}.tsv`)), sampleLines(dir, flags.tag))}\n`);
}

function main() {
  let flags;
  try {
    flags = parseFlags(process.argv.slice(2), { root: 'string', tag: 'string', commit: 'string', report: 'boolean' }, { usage: USAGE });
    for (const name of ['root', 'tag', ...(flags.report ? [] : ['commit'])]) if (!flags[name]) throw new UsageError(`--${name} is required`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }
  if (flags.report) report(flags);
  else runRound(flags);
}

if (isMain(import.meta.url)) main();
