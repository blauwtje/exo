import fs from 'node:fs';
import path from 'node:path';
import { sumCounts } from '#token-weights';

const RATE_LIMIT_TYPE = /RateLimit|UsageLimit|Overloaded/i;
const RATE_LIMIT_TEXT = /rate.?limit|usage limit|\b429\b|overloaded/i;
const AUTH_OR_NETWORK_TYPE = /Authentication|NetworkConnection|InternalServer|ConnectionClosed|Stalled/i;
const TIMEOUT_TYPE = /Timeout/i;
export const CANCELLED_TYPE = 'CancelledError';

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function parseEvent(line) {
  if (!line.startsWith('{')) return null;
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

export function streamResult(trialDirectory) {
  let text;
  try {
    text = fs.readFileSync(path.join(trialDirectory, 'agent', 'claude-code.txt'), 'utf8');
  } catch {
    return null;
  }
  let found = null;
  for (const line of text.split('\n')) {
    const event = parseEvent(line);
    if (event?.type === 'result') found = event;
  }
  return found;
}

export function readTrials(jobDirectory) {
  const trials = [];
  for (const entry of fs.readdirSync(jobDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(jobDirectory, entry.name);
    if (!fs.existsSync(path.join(directory, 'config.json'))) continue;
    const result = readJson(path.join(directory, 'result.json'));
    trials.push({ name: entry.name, directory, result: result?.finished_at ? result : null });
  }
  return trials.sort((left, right) => left.name.localeCompare(right.name));
}

export function trialTask(result) {
  return String(result.task_name ?? result.task_id?.name).replace(/^.*\//, '');
}

export function trialCost(trial) {
  const direct = trial.result?.agent_result?.cost_usd;
  if (typeof direct === 'number') return direct;
  const streamed = streamResult(trial.directory)?.total_cost_usd;
  return typeof streamed === 'number' ? streamed : null;
}

export function trialWallMs(result) {
  const span = result.agent_execution?.started_at ? result.agent_execution : result;
  const ms = Date.parse(span.finished_at) - Date.parse(span.started_at);
  return Number.isFinite(ms) ? ms : null;
}

export function trialCounts(trial) {
  const models = Object.values(streamResult(trial.directory)?.modelUsage ?? {});
  if (models.length === 0) return null;
  return sumCounts(models.map((usage) => ({
    input: usage.inputTokens ?? 0,
    cacheRead: usage.cacheReadInputTokens ?? 0,
    cache5m: usage.cacheCreationInputTokens ?? 0,
    cache1h: 0,
    output: usage.outputTokens ?? 0
  })));
}

export function trialMix(trial) {
  const stream = streamResult(trial.directory);
  const models = Object.values(stream?.modelUsage ?? {});
  const total = (key) => models.reduce((sum, usage) => sum + (usage[key] ?? 0), 0);
  const thinking = models.some((usage) => typeof usage.thinkingTokens === 'number') ? total('thinkingTokens') : null;
  return { output: models.length ? total('outputTokens') : null, cacheWrites: models.length ? total('cacheCreationInputTokens') : null, thinking, turns: stream?.num_turns ?? null };
}

export function trialSetupMs(result) {
  const ms = Date.parse(result.agent_setup?.finished_at) - Date.parse(result.agent_setup?.started_at);
  return Number.isFinite(ms) ? ms : null;
}

export function classify(trial) {
  const { result } = trial;
  const type = result.exception_info?.exception_type ?? null;
  if (type === CANCELLED_TYPE) return { kind: 'cancelled' };
  const stream = streamResult(trial.directory);
  const streamText = String(stream?.result ?? '');
  if (type && RATE_LIMIT_TYPE.test(type)) return { kind: 'infra', reason: 'rate-limit' };
  if (stream?.is_error && RATE_LIMIT_TEXT.test(streamText)) return { kind: 'infra', reason: 'rate-limit' };
  if (stream?.subtype === 'error_max_turns') return { kind: 'fail', reason: 'max_turns', maxTurns: true };
  if (type && TIMEOUT_TYPE.test(type)) return { kind: 'fail', reason: 'timeout', timedOut: true };
  if (type) return { kind: 'infra', reason: AUTH_OR_NETWORK_TYPE.test(type) ? type : `exception ${type}` };
  const reward = result.verifier_result?.rewards?.reward;
  if (typeof reward !== 'number') return { kind: 'infra', reason: 'no verifier result' };
  return reward >= 1 ? { kind: 'pass' } : { kind: 'fail', reason: 'verifier' };
}
