import { execFileSync } from 'node:child_process';
import { clusteredMeanCi, powerLine } from '../../lib/eval-stats.mjs';
import { usageCounts } from '#token-weights';
import { pairedArms, pairedByCase, verdictWord } from '../interval-text.mjs';
import { countsCost } from '../pricing.mjs';
import { overlaps, parseFindings, parseRange } from '../review-replay.mjs';
import { MODELS } from '../tasks.mjs';
import { meanOrNull, median, sum } from '../basics.mjs';

const WILSON_Z = 1.96;
const percent = (value) => (value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`);
export const labelOf = ({ model, effort }) => `${model}:${effort}`;

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
export const settingOfJob = (candidate) => (session) => session.model === candidate.model && session.effort === candidate.effort;
const wallOf = (session) => (isNumber(session.durationMs) && session.durationMs > 0 ? session.durationMs / 1000 : null);

function recordedEstimate(own, fixture, measure) {
  const measured = own.map((session) => ({ fixture: session.fixture, value: measure(session) })).filter((entry) => isNumber(entry.value));
  if (measured.length === 0) return null;
  const exact = measured.filter((entry) => fixture !== undefined && entry.fixture === fixture);
  if (exact.length > 0) return median(exact.map((entry) => entry.value));
  const byFixture = new Map();
  for (const entry of measured) byFixture.set(entry.fixture, [...(byFixture.get(entry.fixture) ?? []), entry.value]);
  return meanOrNull([...byFixture.values()].map(median));
}

const recordedOwn = (agent, candidate, recorded) => recorded.filter((session) => session.agent === agent && !session.skipped && settingOfJob(candidate)(session));

export function estimateUsd(agent, candidate, recorded, config, fixture) {
  const seen = recordedEstimate(recordedOwn(agent, candidate, recorded), fixture, (session) => session.cost_usd);
  if (seen !== null) return seen;
  const profile = config[agent].profile;
  const priced = countsCost(profile, MODELS[candidate.model]) ?? 0;
  return priced * (profile.usdScale?.[labelOf(candidate)] ?? 1);
}

export function estimateWallS(agent, candidate, recorded, config, fixture) {
  const seen = recordedEstimate(recordedOwn(agent, candidate, recorded), fixture, wallOf);
  if (seen !== null) return seen;
  const profile = config[agent].profile;
  if (!isNumber(profile.wallS)) return null;
  return profile.wallS * (profile.wallScale?.[labelOf(candidate)] ?? 1);
}

export function estimateTotal(jobs, recorded, config) {
  return sum(jobs.map((job) => estimateUsd(job.agent, job.candidate, recorded, config, job.fixture)));
}

export function estimateWallTotalS(jobs, recorded, config, concurrency) {
  const walls = jobs.map((job) => estimateWallS(job.agent, job.candidate, recorded, config, job.fixture));
  if (walls.some((wall) => wall === null)) return null;
  return sum(walls) / Math.max(1, Math.min(concurrency, jobs.length));
}

export function wallText(seconds) {
  if (seconds === null) return 'n/a';
  return seconds < 90 ? `${seconds.toFixed(0)} s` : `${(seconds / 60).toFixed(1)} min`;
}

export function dryRunText(jobs, recorded, config, concurrency = 2) {
  const agents = [...new Set(jobs.map((job) => job.agent))];
  const lines = agents.map((agent) => {
    const own = jobs.filter((job) => job.agent === agent);
    const labels = [...new Set(own.map((job) => labelOf(job.candidate)))].join(' ');
    return `${agent}: ${own.length} sessions, est $${estimateTotal(own, recorded, config).toFixed(2)}, est wall ${wallText(estimateWallTotalS(own, recorded, config, concurrency))} at concurrency ${concurrency} (${labels})`;
  });
  const powerLines = agents.filter((agent) => agent === 'ideate-worker').map((agent) => {
    const own = jobs.filter((job) => job.agent === agent);
    const arms = new Set(own.map((job) => labelOf(job.candidate))).size;
    return `${agent} ${powerLine({ tasks: new Set(own.map((job) => job.fixture)).size, samples: Math.max(...own.map((job) => job.run ?? 1)), arms })}`;
  });
  const total = `total: ${jobs.length} sessions, est $${estimateTotal(jobs, recorded, config).toFixed(2)}, est wall ${wallText(estimateWallTotalS(jobs, recorded, config, concurrency))} at concurrency ${concurrency}`;
  return `${[...lines, ...powerLines, total, 'note: a recorded session of the same agent, model, effort and fixture in --out or --history wins; else the profile, whose usdScale and wallScale model effort where it lists them'].join('\n')}\n`;
}

export function flaggedShare(plants, findingsText) {
  if (plants.length === 0) return null;
  const flagged = parseFindings(findingsText).filter((finding) => finding.weight === 'defect' || finding.weight === 'concern');
  const hit = plants.filter((plant) => flagged.some((finding) => overlaps({ path: plant.path, ...parseRange(plant.range) }, finding)));
  return hit.length / plants.length;
}

export class Budget {
  constructor(cap) {
    this.cap = cap;
    this.spent = 0;
    this.reserved = 0;
    this.skipped = 0;
  }

  reserve(estimate) {
    if (this.cap !== null && this.spent + this.reserved + estimate > this.cap) {
      this.skipped += 1;
      return false;
    }
    this.reserved += estimate;
    return true;
  }

  settle(estimate, actual) {
    this.reserved -= estimate;
    this.spent += actual ?? estimate;
  }

  message() {
    if (this.skipped === 0) return null;
    return `--max-usd $${this.cap} reached after $${this.spent.toFixed(2)}: ${this.skipped} sessions skipped`;
  }
}

function resultOfStream(text) {
  for (const line of text.split('\n').reverse()) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event?.type === 'result') return event;
  }
  return null;
}

export function usageOfStream(text) {
  return resultOfStream(text)?.usage ?? null;
}

const modelUsageCounts = (use) => ({ input: use.inputTokens ?? 0, cacheRead: use.cacheReadInputTokens ?? 0, cache5m: use.cacheCreationInputTokens ?? 0, cache1h: 0, output: use.outputTokens ?? 0 });

export function modelUsageCost(modelUsage) {
  const entries = Object.entries(modelUsage ?? {});
  if (entries.length === 0) return null;
  const costs = entries.map(([id, use]) => countsCost(modelUsageCounts(use), id));
  return costs.every(Number.isFinite) ? sum(costs) : null;
}

export function sessionCost(outcome, model) {
  const result = resultOfStream(outcome.stdout ?? '');
  const usage = result?.usage;
  const priced = modelUsageCost(result?.modelUsage) ?? (usage ? countsCost(usageCounts(usage), MODELS[model]) : null);
  return priced ?? outcome.cost_usd ?? null;
}

export function apiKeySourceOf(stdout) {
  for (const line of String(stdout ?? '').split('\n')) {
    if (!line.includes('"init"')) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event?.type === 'system' && event.subtype === 'init') return event.apiKeySource ?? null;
  }
  return null;
}

export function wilson95(passes, total) {
  if (total === 0) return null;
  const share = passes / total;
  const z2 = WILSON_Z ** 2;
  const denominator = 1 + z2 / total;
  const centre = (share + z2 / (2 * total)) / denominator;
  const half = (WILSON_Z * Math.sqrt((share * (1 - share)) / total + z2 / (4 * total ** 2))) / denominator;
  return [Math.max(0, centre - half), Math.min(1, centre + half)].map((bound) => Number(bound.toFixed(4)));
}

const scoreOf = (session) => (session.error ? 0 : session.score);
const fractionOf = (session) => (session.error ? 0 : session.fraction ?? session.score);
const isScored = (session) => !session.skipped && (Boolean(session.error) || typeof session.score === 'number');
const intervalOf = (sessions, valueOf) => (sessions.length === 0 ? null : clusteredMeanCi(sessions.map((session) => ({ cluster: session.fixture ?? '', value: valueOf(session) }))));
const costOf = (session) => (isNumber(session.cost_usd) ? session.cost_usd : null);
const knownValues = (sessions, measure) => sessions.map(measure).filter(isNumber);

export function summarizeCells(sessions) {
  const groups = new Map();
  for (const session of sessions) {
    const key = `${session.agent} ${labelOf(session)}`;
    groups.set(key, [...(groups.get(key) ?? []), session]);
  }
  return [...groups.values()].map((own) => {
    const attempted = own.filter((session) => !session.skipped);
    const finished = attempted.filter((session) => !session.error);
    const scored = own.filter(isScored);
    const graded = finished.filter((session) => typeof session.score === 'number');
    const passes = graded.filter((session) => session.score >= 1).length;
    const costs = knownValues(finished, costOf);
    const walls = knownValues(finished, wallOf);
    const scoreCi = intervalOf(scored, scoreOf);
    const fractionCi = intervalOf(scored, fractionOf);
    return {
      agent: own[0].agent,
      model: own[0].model,
      effort: own[0].effort,
      sessions: own.length,
      attempted: attempted.length,
      graded: graded.length,
      errored: attempted.length - finished.length,
      score: scoreCi?.mean ?? null,
      fraction: fractionCi?.mean ?? null,
      scoreCi,
      fractionCi,
      cost_usd: sum(knownValues(own, costOf)),
      costPerSession: meanOrNull(costs),
      costExcluded: attempted.length - costs.length,
      wallS: meanOrNull(walls),
      wallMedianS: median(walls),
      wallExcluded: attempted.length - walls.length,
      wilson95: wilson95(passes, attempted.length)
    };
  });
}

const comparedScore = (session) => [session.fixture ?? '', labelOf(session), scoreOf(session)];

export function candidateComparisons(sessions, currentOf) {
  const agents = [...new Set(sessions.map((session) => session.agent))];
  return agents.flatMap((agent) => {
    const rows = sessions.filter((session) => session.agent === agent && isScored(session));
    const cases = pairedByCase(rows, comparedScore);
    const current = labelOf(currentOf(agent));
    const labels = [...new Set(rows.map(labelOf))].filter((label) => label !== current);
    if (!rows.some((session) => labelOf(session) === current)) return [];
    return labels.map((label) => {
      const interval = pairedArms(cases, current, label);
      return { agent, current, candidate: label, interval, verdict: verdictWord(interval) };
    });
  });
}

const percentInterval = (interval) => {
  if (!interval) return 'n/a';
  if (interval.se === null) return `${percent(interval.mean)} no SE`;
  return `${percent(interval.mean)} se ${percent(interval.se)} ci95 ${percent(interval.lo)}..${percent(interval.hi)}`;
};

const wilsonText = (interval) => (interval ? ` wilson95 [${percent(interval[0])}-${percent(interval[1])}]` : '');

const wallSeconds = (seconds) => (isNumber(seconds) ? `${seconds.toFixed(0)}s` : 'n/a');

export function comparisonLine({ agent, current, candidate, interval, verdict }) {
  if (interval === null) return `${agent} ${candidate} minus ${current}: no shared fixture`;
  const spread = interval.se === null ? 'no SE' : `se ${percent(interval.se)} ci95 ${percent(interval.lo)}..${percent(interval.hi)}`;
  return `${agent} ${candidate} minus ${current}: score ${percent(interval.mean)} ${spread} over ${interval.n} shared fixtures: ${verdict}`;
}

export function cellLine(cell, config) {
  const perSession = isNumber(cell.costPerSession) ? ` $${cell.costPerSession.toFixed(3)}/session` : '';
  const medianWall = isNumber(cell.wallMedianS) ? ` median ${cell.wallMedianS.toFixed(0)}s` : '';
  const excluded = ` errored ${cell.errored}, cost excluded ${cell.costExcluded} and wall excluded ${cell.wallExcluded} of ${cell.attempted}`;
  return `${cell.agent} ${labelOf(cell)} ${config[cell.agent].metric} ${percentInterval(cell.scoreCi)} checks ${percentInterval(cell.fractionCi)} usd $${cell.cost_usd.toFixed(2)}${perSession} wall ${wallSeconds(cell.wallS)}${medianWall}${wilsonText(cell.wilson95)}${excluded}`;
}

const git = (repository, args) => execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8' });
