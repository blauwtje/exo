import fs from 'node:fs';
import path from 'node:path';
import { benchmarkScripts, readScript } from './benchmark-entry-points.mjs';
import { calibrationStatus, parseJsonl } from '../../lib/judge-agreement.mjs';

const NAME = 'eval judges';
const REGISTRY = 'benchmarks/judges.json';
const LABELS_FOLDER = 'benchmarks/judge-labels';
const VERDICTS_FOLDER = 'benchmarks/judge-verdicts';
const STATUS_HELPER = 'calibrationLines';
const PROMPT_NAME = /^judge[^/]*\.md$/;
const PROMPT_FOLDER = 'judges';
const REPLY_TEMPLATE = /\{\s*"[^{}]*\}/g;
const TEMPLATE_KEY = /"([^"]+)"\s*:/g;
const EVIDENCE_KEY = 'evidence';

function readRows(repository, file) {
  const absolute = repository.join(file);
  return fs.existsSync(absolute) ? parseJsonl(fs.readFileSync(absolute, 'utf8')) : [];
}

function registryOf(repository) {
  const file = repository.join(REGISTRY);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')).judges ?? [];
}

function promptFiles(repository) {
  const root = repository.join('benchmarks');
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.relative(repository.join('.'), path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .filter((file) => !/^benchmarks\/(?:results|runs|fixtures|value)\//.test(file))
    .filter((file) => PROMPT_NAME.test(path.posix.basename(file)) || path.posix.basename(path.posix.dirname(file)) === PROMPT_FOLDER)
    .sort();
}

function dimensionFailures(judge) {
  if (judge.kind === 'transform') return [];
  if (Array.isArray(judge.dimension)) return [`DIMENSIONS ${judge.name}: ${judge.dimension.length} dimensions in one call; one call grades one dimension, so split the judge`];
  if (typeof judge.dimension !== 'string' || judge.dimension.trim() === '') return [`NO-DIMENSION ${judge.name}: declare its dimension in ${REGISTRY}`];
  return [];
}

function replyKeys(source) {
  const template = source.match(REPLY_TEMPLATE)?.at(-1);
  if (template === undefined) return null;
  return [...template.matchAll(TEMPLATE_KEY)].map((match) => match[1]).filter((key) => key !== EVIDENCE_KEY);
}

function promptReplyKeys(repository, judge) {
  return (judge.files ?? [])
    .filter((file) => file.endsWith('.md') && fs.existsSync(repository.join(file)))
    .map((file) => ({ file, keys: replyKeys(fs.readFileSync(repository.join(file), 'utf8')) }));
}

export function skippedJudges(repository) {
  const registry = registryOf(repository) ?? [];
  return registry
    .filter((judge) => judge.kind === 'grader')
    .filter((judge) => promptReplyKeys(repository, judge).some((prompt) => prompt.keys === null))
    .map((judge) => judge.name);
}

function templateFailures(repository, judge) {
  if (judge.kind !== 'grader' || typeof judge.dimension !== 'string') return [];
  return promptReplyKeys(repository, judge)
    .filter((prompt) => prompt.keys !== null)
    .filter((prompt) => prompt.keys.length !== 1 || prompt.keys[0] !== judge.dimension)
    .map((prompt) => `DIMENSIONS ${judge.name}: ${prompt.file} replies with ${JSON.stringify(prompt.keys)}; one call grades only [${JSON.stringify(judge.dimension)}]`);
}

function fileFailures(repository, judge) {
  return (judge.files ?? []).filter((file) => !fs.existsSync(repository.join(file))).map((file) => `MISSING-FILE ${judge.name}: ${file} does not exist`);
}

function scorerFailures(repository, judge) {
  if (judge.scorer === undefined) return [];
  if (!benchmarkScripts(repository).includes(judge.scorer) && !fs.existsSync(repository.join(judge.scorer))) return [`MISSING-FILE ${judge.name}: scorer ${judge.scorer} does not exist`];
  return readScript(repository, judge.scorer).includes(STATUS_HELPER) ? [] : [`NO-STATUS ${judge.name}: ${judge.scorer} must print its calibration status through ${STATUS_HELPER}`];
}

function calibrationFailures(repository, judge) {
  if (judge.kind !== 'grader' || typeof judge.dimension !== 'string') return [];
  const labels = readRows(repository, `${LABELS_FOLDER}/${judge.name}.jsonl`);
  const verdicts = readRows(repository, `${VERDICTS_FOLDER}/${judge.name}.jsonl`);
  const result = calibrationStatus({ labels, verdicts, dimension: judge.dimension });
  return result.failing ? [`UNCALIBRATED ${judge.name}: ${result.reason} on ${result.n} human labels; relabel, fix the judge or raise the evidence`] : [];
}

function unregisteredFailures(repository, registry) {
  const listed = new Set(registry.flatMap((judge) => judge.files ?? []));
  return promptFiles(repository).filter((file) => !listed.has(file)).map((file) => `UNREGISTERED ${file}: add its judge to ${REGISTRY}`);
}

export function judgeFailures(repository) {
  const registry = registryOf(repository);
  if (registry === null) return [`NO-REGISTRY ${REGISTRY}: list every judge with its dimension`];
  return [
    ...registry.flatMap((judge) => [...dimensionFailures(judge), ...templateFailures(repository, judge), ...fileFailures(repository, judge), ...scorerFailures(repository, judge), ...calibrationFailures(repository, judge)]),
    ...unregisteredFailures(repository, registry)
  ];
}

export function checkEvalJudges(report, repository) {
  const failures = judgeFailures(repository);
  report.assert(
    failures.length === 0,
    NAME,
    'every judge grades one declared dimension per call, prints its calibration status, and none with enough human labels misses the kappa threshold',
    failures.join('\n')
  );
}
