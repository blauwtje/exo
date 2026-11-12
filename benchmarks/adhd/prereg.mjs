import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { planningVariance, powerLine, tasksNeeded } from '../../lib/eval-stats.mjs';
import { readJson } from '../basics.mjs';

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function assertFrozen({ hashes, root }) {
  for (const [file, hash] of Object.entries(hashes)) {
    if (sha256(path.join(root, file)) !== hash) throw new Error(`prereg refused: ${file} changed since the prereg was written`);
  }
}

function keptScores(perCase, cases) {
  const factCount = Object.fromEntries(cases.map((c) => [c.id, c.facts.length]));
  return Object.fromEntries(perCase.map((p) => [p.id, p.answers.map((a) => factCount[p.id] - a.missing.length)]));
}

function designOf(record, cases) {
  return { scores: { base: keptScores(record.base.perCase, cases), candidate: keptScores(record.perCase, cases) }, paired: true };
}

export function gatePrereg({ prereg, root, cases }) {
  assertFrozen({ hashes: prereg.hashes, root });
  const { samples, effect, alpha, power } = prereg;
  const designs = prereg.varianceRecords.map((file) => designOf(readJson(path.join(root, file)), cases));
  const variances = designs.map((design) => planningVariance({ ...design, samples }));
  const largest = Math.max(...variances);
  const design = designs[variances.indexOf(largest)];
  const line = powerLine({ tasks: prereg.caseIds.length, samples, arms: 2, effect, alpha, power, ...design });
  const needed = tasksNeeded({ variance: largest, effect, alpha, power });
  if (prereg.caseIds.length < needed) throw new Error(`${line}\nprereg refused: needs ${needed} cases, plans ${prereg.caseIds.length}`);
  return line;
}

export function applyPrereg(opts, root) {
  const prereg = readJson(opts.prereg);
  const cases = fs.readFileSync(path.join(root, 'benchmarks', 'adhd', 'cases.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  process.stderr.write(`${gatePrereg({ prereg, root, cases })}\n`);
  if (opts.mode !== 'quick') return;
  Object.assign(opts, { caseIds: prereg.caseIds, answers: prereg.samples, model: prereg.model, maxUsd: prereg.maxUsd, baseStyle: path.join(root, prereg.arms.base) });
}
