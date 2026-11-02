#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { calibrationStatus, parseJsonl, statusLine, CALIBRATION_KAPPA_FLOOR, CALIBRATION_MIN_LABELS } from '../lib/judge-agreement.mjs';
import { UsageError, isMain, parseFlags } from '../lib/script-flags.mjs';

export const ROOT = path.join(import.meta.dirname, '..');
export const LABELS_DIR = path.join(import.meta.dirname, 'judge-labels');
export const VERDICTS_DIR = path.join(import.meta.dirname, 'judge-verdicts');
export const REGISTRY = path.join(import.meta.dirname, 'judges.json');
export const QUICK_ITEMS = 3;
export const RERUN_VOTES = { quick: 1, full: 3 };

const USAGE = `usage: node benchmarks/judge-calibration.mjs [--judge <name>] [--labels <dir>] [--verdicts <dir>]
       node benchmarks/judge-calibration.mjs --judge <name> --collect <source> [--verdicts <dir>]
       node benchmarks/judge-calibration.mjs --judge <name> --export <file> [--verdicts <dir>]
       node benchmarks/judge-calibration.mjs --judge <name> --rerun [--full] [--dry-run] [--labels <dir>] [--verdicts <dir>]

Compares each judge's recorded verdicts with human labels and prints one line per judge:
  CALIBRATED | UNCALIBRATED | NO-LABELS <judge>/<dimension> kappa <k> ci <lo>..<hi> n <paired labels> agreement <rate>
A judge is CALIBRATED when at least ${CALIBRATION_MIN_LABELS} human labels pair with a recorded verdict and the lower 95% bound of Cohen's kappa is at least ${CALIBRATION_KAPPA_FLOOR}.

Human labels: <labels dir>/<judge>.jsonl (default benchmarks/judge-labels), one JSON row per item:
  {"id": "<item id>", "dimension": "<the judge's dimension>", "label": "PASS" | "FAIL" | "1".."5", "labeler": "<rater id>"}
Rows with a "built" or "synthetic" field are synthetic: they are counted apart and never count as human labels.
Recorded verdicts: <verdicts dir>/<judge>.jsonl (default benchmarks/judge-verdicts), rows {id, dimension, verdict, item}.

--collect <source> reads a scorer's stored output (no model call) and writes the verdicts file. Sources:
  replay-rubric: a replay run folder with grade.json, case.json and result.json per cell
  adhd-facts: an adhd-score log .json
  pressure-line: a pressure run folder with grades.json and the saved answers
  ideas-originality, ideas-fit: a <results>.records.json file
--export <file> writes a labelling sheet from the recorded verdicts, without the verdicts, for a human to fill label and labeler.
--rerun judges the human-labelled items again with the live judge (adhd-facts, replay-rubric). The default is the quick tier: ${QUICK_ITEMS} items, 1 vote; --full runs every labelled item with 3 votes. --dry-run prints the item and call count and spends nothing.
Exit codes: 0 ok, 1 a judge has enough human labels and misses the threshold, 2 usage error.`;

export function readRegistry(file = REGISTRY) {
  return JSON.parse(fs.readFileSync(file, 'utf8')).judges;
}

function readRows(file) {
  return fs.existsSync(file) ? parseJsonl(fs.readFileSync(file, 'utf8')) : [];
}

export function calibrationFor(judge, { labelsDir = LABELS_DIR, verdictsDir = VERDICTS_DIR } = {}) {
  const labels = readRows(path.join(labelsDir, `${judge.name}.jsonl`));
  const verdicts = readRows(path.join(verdictsDir, `${judge.name}.jsonl`));
  const result = calibrationStatus({ labels, verdicts, dimension: judge.dimension });
  return { result, line: statusLine({ judge: judge.name, dimension: judge.dimension, result }) };
}

export function calibrationLines(names, options = {}) {
  const graders = readRegistry().filter((judge) => names.includes(judge.name));
  return graders.map((judge) => calibrationFor(judge, options).line);
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const binary = (pass) => (pass ? 'PASS' : 'FAIL');

function cellsUnder(directory) {
  if (fs.existsSync(path.join(directory, 'grade.json')) && fs.existsSync(path.join(directory, 'case.json'))) return [directory];
  if (!fs.statSync(directory).isDirectory()) return [];
  return fs.readdirSync(directory).sort().flatMap((name) => cellsUnder(path.join(directory, name)));
}

function collectReplay(source, judge) {
  return cellsUnder(source).flatMap((cell) => {
    const graded = readJson(path.join(cell, 'grade.json'));
    const caseDef = readJson(path.join(cell, 'case.json'));
    if (caseDef.grade?.type !== 'rubric' || graded.votes === undefined) return [];
    const result = readJson(path.join(cell, 'result.json'));
    return [{ id: path.relative(source, cell), dimension: judge.dimension, verdict: graded.grade.toUpperCase(), item: { rubric: caseDef.grade.rubric, output: result.result } }];
  });
}

function collectAdhd(source, judge) {
  const log = readJson(source);
  const cases = new Map(fs.readFileSync(path.join(import.meta.dirname, 'adhd', 'cases.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)).map((row) => [row.id, row]));
  return (log.perCase ?? []).flatMap((entry) => {
    const spec = cases.get(entry.id);
    if (spec === undefined) return [];
    const replies = entry.replies ?? (entry.reply === undefined ? [] : [entry.reply]);
    const runs = entry.runs ?? [{ failed: entry.failed ?? [], missing: entry.missing ?? [] }];
    return replies.flatMap((reply, n) => {
      const failed = runs[n]?.failed ?? [];
      const judged = failed.every((name) => name === 'judge:facts');
      if (!judged) return [];
      const missing = runs[n]?.missing ?? [];
      return [{ id: `${entry.id}#${n}`, dimension: judge.dimension, verdict: binary(missing.length === 0), item: { question: spec.question, facts: spec.facts, reply } }];
    });
  });
}

function collectPressure(source, judge) {
  const grades = readJson(path.join(source, 'grades.json'));
  return Object.entries(grades).flatMap(([cell, summary]) => summary.runs.flatMap((run) => run.lines.flatMap((line, index) => {
    if (line.votes === undefined) return [];
    const answerFile = fs.readdirSync(source).find((name) => name.endsWith(`-${run.arm}-${run.run}.md`) && name.startsWith(cell.split(':')[0]));
    const answer = answerFile === undefined ? null : fs.readFileSync(path.join(source, answerFile), 'utf8');
    return [{ id: `${cell}/${run.case}/${run.arm}/${run.run}/${index}`, dimension: judge.dimension, verdict: binary(line.pass), item: { rubric: line.text, answer } }];
  })));
}

function collectIdeas(source, judge) {
  const cases = readJson(path.join(import.meta.dirname, 'ideas', 'cases.json'));
  const { records } = readJson(source);
  return records.flatMap((record) => (record.optionScores ?? []).map((option) => ({
    id: `${record.case}/${record.run}/${option.title}`,
    dimension: judge.dimension,
    verdict: String(option[judge.dimension]),
    item: { problem: cases[record.case]?.feature, option: `${option.title}: ${option.mechanism}` },
  })));
}

export const COLLECTORS = { 'replay-rubric': collectReplay, 'adhd-facts': collectAdhd, 'pressure-line': collectPressure, 'ideas-originality': collectIdeas, 'ideas-fit': collectIdeas };

const jsonl = (rows) => `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;

export function collectVerdicts(judge, source, verdictsDir = VERDICTS_DIR) {
  const collector = COLLECTORS[judge.name];
  if (collector === undefined) throw new UsageError(`${judge.name} has no stored-output reader; known: ${Object.keys(COLLECTORS).join(', ')}`);
  const rows = collector(path.resolve(source), judge);
  if (rows.length === 0) throw new UsageError(`${source} holds no ${judge.name} verdicts; point --collect at the scorer output named in --help`);
  fs.mkdirSync(verdictsDir, { recursive: true });
  const file = path.join(verdictsDir, `${judge.name}.jsonl`);
  fs.writeFileSync(file, jsonl(rows));
  return { file, rows: rows.length };
}

export function exportSheet(judge, file, verdictsDir = VERDICTS_DIR) {
  const verdicts = readRows(path.join(verdictsDir, `${judge.name}.jsonl`));
  if (verdicts.length === 0) throw new UsageError(`no recorded verdicts for ${judge.name}; run --collect first`);
  const rows = verdicts.map((row) => ({ id: row.id, dimension: row.dimension, item: row.item, label: null, labeler: null }));
  fs.writeFileSync(file, jsonl(rows));
  return rows.length;
}

export function rerunPlan(judge, { labelsDir, verdictsDir, full }) {
  const labels = readRows(path.join(labelsDir, `${judge.name}.jsonl`)).filter((row) => row.label && row.built === undefined && row.synthetic !== true);
  const items = new Map(readRows(path.join(verdictsDir, `${judge.name}.jsonl`)).map((row) => [row.id, row]));
  const labelled = [...new Set(labels.map((row) => row.id))].filter((id) => items.has(id)).map((id) => items.get(id));
  const tier = full ? 'full' : 'quick';
  const chosen = full ? labelled : labelled.slice(0, QUICK_ITEMS);
  return { tier, items: chosen, votes: RERUN_VOTES[tier], calls: chosen.length * RERUN_VOTES[tier] };
}

async function rerunVerdict(judge, row, votes) {
  if (judge.name === 'replay-rubric') {
    const { judgeMajority } = await import('./replay/grade.mjs');
    return judgeMajority(row.item.rubric, row.item.output, votes).grade.toUpperCase();
  }
  const { judgeVote, missingFacts } = await import('./adhd/judges.mjs');
  const verdicts = await judgeVote({ ...row.item, votes });
  return binary(missingFacts(verdicts).length === 0);
}

async function rerun(judge, options) {
  if (!['replay-rubric', 'adhd-facts'].includes(judge.name)) throw new UsageError(`--rerun supports replay-rubric and adhd-facts, not ${judge.name}`);
  const plan = rerunPlan(judge, options);
  if (options.dryRun) return [`${plan.tier} tier, ${plan.items.length} labelled items, ${plan.calls} judge calls, nothing spent`];
  const verdicts = [];
  for (const row of plan.items) verdicts.push({ id: row.id, dimension: row.dimension, verdict: await rerunVerdict(judge, row, plan.votes) });
  const labels = readRows(path.join(options.labelsDir, `${judge.name}.jsonl`));
  const result = calibrationStatus({ labels, verdicts, dimension: judge.dimension });
  return [`${plan.tier} tier, ${plan.items.length} items`, statusLine({ judge: judge.name, dimension: judge.dimension, result })];
}

function chooseJudges(registry, name) {
  if (name === undefined) return registry.filter((judge) => judge.kind === 'grader');
  const found = registry.find((judge) => judge.name === name);
  if (found === undefined) throw new UsageError(`unknown judge '${name}'; known: ${registry.map((judge) => judge.name).join(', ')}`);
  return [found];
}

export async function main(argv) {
  const flags = parseFlags(argv, { judge: 'value', labels: 'value', verdicts: 'value', collect: 'value', export: 'value', rerun: 'boolean', full: 'boolean', 'dry-run': 'boolean' }, { usage: USAGE });
  const labelsDir = path.resolve(flags.labels ?? LABELS_DIR);
  const verdictsDir = path.resolve(flags.verdicts ?? VERDICTS_DIR);
  const judges = chooseJudges(readRegistry(), flags.judge);
  const single = () => {
    if (flags.judge === undefined) throw new UsageError('--collect, --export and --rerun need --judge <name>');
    return judges[0];
  };
  if (flags.collect !== undefined) {
    const { file, rows } = collectVerdicts(single(), flags.collect, verdictsDir);
    console.log(`wrote ${rows} verdicts to ${file}`);
    return 0;
  }
  if (flags.export !== undefined) {
    console.log(`wrote ${exportSheet(single(), path.resolve(flags.export), verdictsDir)} rows to ${flags.export}; fill label and labeler, then save as ${path.join(labelsDir, `${judges[0].name}.jsonl`)}`);
    return 0;
  }
  if (flags.rerun) {
    const tier = flags.full ? 'full' : 'quick';
    for (const line of await rerun(single(), { labelsDir, verdictsDir, full: tier === 'full', dryRun: flags['dry-run'] === true })) console.log(line);
    return 0;
  }
  const results = judges.map((judge) => calibrationFor(judge, { labelsDir, verdictsDir }));
  for (const { line } of results) console.log(line);
  return results.some(({ result }) => result.failing) ? 1 : 0;
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(error.message);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  });
}
