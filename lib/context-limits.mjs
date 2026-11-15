import os from 'node:os';
import { isPositiveInteger, runDefault } from './basics.mjs';

const SOFT_RATIO = 0.75;
export const TASK_SPLIT_TOKENS = 15_000;
export const AGENT_HARD_RATIO = 1.25;
export const BYTES_PER_TOKEN = 4;

export function softLimit(limit) {
  return Math.round(limit * SOFT_RATIO);
}

export function contextLimit(home = os.homedir()) {
  return runDefault('contextLimit', home, isPositiveInteger);
}

export function agentContextTarget(home = os.homedir()) {
  return runDefault('agentContextTarget', home);
}

export function dispatchBytesPerToken(home = os.homedir()) {
  return runDefault('bytesPerToken', home);
}

export function fetchTokens(home = os.homedir()) {
  return runDefault('fetchTokens', home);
}

export function imageTokenCap(home) {
  return runDefault('imageTokenCap', home);
}

export function pdfPageTokens(home) {
  return runDefault('pdfPageTokens', home);
}

export function binaryReadTokens(home) {
  return runDefault('binaryReadTokens', home);
}

export function orchestratorWorkers(home = os.homedir()) {
  return runDefault('orchestratorWorkers', home);
}

export function capHeadroomTokens(home = os.homedir()) {
  return runDefault('capHeadroomTokens', home) ?? 50;
}

export function changedTestsTrialRuns() {
  return runDefault('changedTestsTrialRuns', os.homedir(), Number.isInteger);
}
