#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { calibrationStatus, parseJsonl, statusLine, CALIBRATION_KAPPA_FLOOR, CALIBRATION_MIN_LABELS } from '../../../lib/judge-agreement.mjs';
import { UsageError, isMain, parseFlags } from '../../../lib/script-flags.mjs';

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

export const ROOT = path.join(import.meta.dirname, '..', '..', '..');
export const LABELS_DIR = path.join(ROOT, '.exo', 'judge-labels');
export const VERDICTS_DIR = path.join(ROOT, '.exo', 'judge-verdicts');
export const REGISTRY = [
  { name: 'replay-rubric', kind: 'grader', dimension: 'case-rubric' },
  { name: 'pressure-line', kind: 'grader', dimension: 'rubric-line' },
  { name: 'adhd-facts', kind: 'grader', dimension: 'facts' },
  { name: 'ideas-originality', kind: 'grader', dimension: 'originality' },
  { name: 'ideas-fit', kind: 'grader', dimension: 'fit' },
];

const USAGE = `usage: node skills/edit-skills/scripts/judge-calibration.mjs [--judge <name>] [--labels <dir>] [--verdicts <dir>] [--collect <source> | --export <file>]

Prints one line per judge: CALIBRATED | UNCALIBRATED | NO-LABELS <judge>/<dimension> kappa <k> ci <lo>..<hi> n <labels> agreement <rate>
CALIBRATED needs ${CALIBRATION_MIN_LABELS} paired human labels and a kappa lower bound of ${CALIBRATION_KAPPA_FLOOR}.
--collect reads a scorer's stored output into verdicts; --export writes a labelling sheet (both need --judge).
Exit codes: 0 ok, 1 a judge has enough human labels and misses the threshold, 2 usage error.`;

export function readRegistry() {
  return REGISTRY;
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
  const { records } = readJson(source);
  return records.flatMap((record) => (record.optionScores ?? []).map((option) => ({
    id: `${record.case}/${record.run}/${option.title}`,
    dimension: judge.dimension,
    verdict: String(option[judge.dimension]),
    item: { problem: record.case, option: `${option.title}: ${option.mechanism}` },
  })));
}

export const COLLECTORS = { 'replay-rubric': collectReplay, 'pressure-line': collectPressure, 'ideas-originality': collectIdeas, 'ideas-fit': collectIdeas };

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

function chooseJudges(registry, name) {
  if (name === undefined) return registry.filter((judge) => judge.kind === 'grader');
  const found = registry.find((judge) => judge.name === name);
  if (found === undefined) throw new UsageError(`unknown judge '${name}'; known: ${registry.map((judge) => judge.name).join(', ')}`);
  return [found];
}

function singleJudge(flags, judges) {
  if (flags.judge === undefined) throw new UsageError('--collect and --export need --judge <name>');
  return judges[0];
}

export async function main(argv) {
  const flags = parseFlags(argv, { judge: 'value', labels: 'value', verdicts: 'value', collect: 'value', export: 'value', }, { usage: USAGE });
  const labelsDir = path.resolve(flags.labels ?? LABELS_DIR);
  const verdictsDir = path.resolve(flags.verdicts ?? VERDICTS_DIR);
  const judges = chooseJudges(readRegistry(), flags.judge);
  if (flags.collect !== undefined) {
    const { file, rows } = collectVerdicts(singleJudge(flags, judges), flags.collect, verdictsDir);
    console.log(`wrote ${rows} verdicts to ${file}`);
    return 0;
  }
  if (flags.export !== undefined) {
    const rows = exportSheet(singleJudge(flags, judges), path.resolve(flags.export), verdictsDir);
    console.log(`wrote ${rows} rows to ${flags.export}; fill label and labeler, then save as ${path.join(labelsDir, `${judges[0].name}.jsonl`)}`);
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
