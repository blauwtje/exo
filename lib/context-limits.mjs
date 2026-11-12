import path from 'node:path';
import os from 'node:os';
import { readJsonOrNull } from './basics.mjs';

const SOFT_RATIO = 0.75;
export const TASK_SPLIT_TOKENS = 15_000;
export const AGENT_HARD_RATIO = 1.25;
export const BYTES_PER_TOKEN = 4;
const REVIEW_SHARD_RATIO = 0.25;
const CAP_MARGIN = 0.1;

const CATALOG = new URL('./run-providers.json', import.meta.url);

const isNonNegativeNumber = (value) => Number.isFinite(value) && value >= 0;
const isPositiveNumber = (value) => Number.isFinite(value) && value > 0;

function readDefault(file, key, accepts) {
  const value = readJsonOrNull(file)?.defaults?.[key];
  return accepts(value) ? value : null;
}

function contextDefault(key, home, accepts = isPositiveNumber) {
  return readDefault(path.join(home, '.config', 'exo', 'run.json'), key, accepts) ?? readDefault(CATALOG, key, accepts);
}

export function softLimit(limit) {
  return Math.round(limit * SOFT_RATIO);
}

export function contextLimit(home = os.homedir()) {
  return contextDefault('contextLimit', home, (value) => Number.isInteger(value) && value > 0);
}

export function agentContextTarget(home = os.homedir()) {
  return contextDefault('agentContextTarget', home);
}

export function dispatchBytesPerToken(home = os.homedir()) {
  return contextDefault('bytesPerToken', home);
}

export function fetchTokens(home = os.homedir()) {
  return contextDefault('fetchTokens', home);
}

export function imageTokenCap(home = os.homedir()) {
  return contextDefault('imageTokenCap', home);
}

export function pdfPageTokens(home = os.homedir()) {
  return contextDefault('pdfPageTokens', home);
}

export function binaryReadTokens(home = os.homedir()) {
  return contextDefault('binaryReadTokens', home);
}

export function searchLineBytes(home = os.homedir()) {
  return contextDefault('searchLineBytes', home);
}

export function toolSchemaBytes(home = os.homedir()) {
  return contextDefault('toolSchemaBytes', home);
}

export function orchestratorWorkers(home = os.homedir()) {
  return contextDefault('orchestratorWorkers', home);
}

export function capMargin(home = os.homedir()) {
  return contextDefault('capMargin', home, isNonNegativeNumber) ?? CAP_MARGIN;
}

export function orchestratorPredispatchReads(home = os.homedir()) {
  return contextDefault('orchestratorPredispatchReads', home, Number.isInteger);
}

export function scriptBytes(home = os.homedir()) {
  return contextDefault('scriptBytes', home);
}

export function reviewShardTokens() {
  return Math.round(softLimit(contextLimit()) * REVIEW_SHARD_RATIO);
}

export function capHeadroomTokens(home = os.homedir()) {
  return contextDefault('capHeadroomTokens', home) ?? 50;
}

export function changedTestsTrialRuns(home = os.homedir()) {
  return contextDefault('changedTestsTrialRuns', home, Number.isInteger);
}
