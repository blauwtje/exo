#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { UsageError, parseFlags, isMain } from '#script-flags';

export const GH_ERROR_EXIT = 3;
const USAGE = 'usage: ship-gate.mjs --pr <number> | --order <number>...';
const GATE_FIELDS = 'number,state,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup';
const ORDER_FIELDS = 'number,baseRefName,headRefName';
const PASSING_CONCLUSIONS = new Set(['SUCCESS', 'SKIPPED', 'NEUTRAL']);
const PR_NUMBER = /^[1-9][0-9]*$/;

class GhError extends Error {}

function holdingCheck(check) {
  const name = check.name || check.context || 'unnamed';
  if (check.state !== undefined && check.status === undefined) {
    return check.state === 'SUCCESS' ? null : `state=${check.state} ${name}`;
  }
  if (check.status !== undefined && check.status !== 'COMPLETED') return `status=${check.status} ${name}`;
  const conclusion = check.conclusion || 'NONE';
  return PASSING_CONCLUSIONS.has(conclusion) ? null : `conclusion=${conclusion} ${name}`;
}

export function gateVerdict(pullRequest) {
  if (pullRequest.state && pullRequest.state !== 'OPEN') return `STOP state=${pullRequest.state}`;
  if (pullRequest.mergeStateStatus === 'DIRTY' || pullRequest.mergeable === 'CONFLICTING') return 'DIRTY';
  if (pullRequest.mergeStateStatus === 'BEHIND') return 'BEHIND';
  if (pullRequest.reviewDecision === 'CHANGES_REQUESTED') return 'STOP reviewDecision=CHANGES_REQUESTED';
  for (const check of pullRequest.statusCheckRollup ?? []) {
    const hold = holdingCheck(check);
    if (hold) return `STOP ${hold}`;
  }
  if (pullRequest.mergeStateStatus !== 'CLEAN') return `STOP mergeStateStatus=${pullRequest.mergeStateStatus || 'NONE'}`;
  return 'MERGE';
}

export function stackOrder(pullRequests) {
  const byHead = new Map(pullRequests.map((pullRequest) => [pullRequest.headRefName, pullRequest]));
  const order = [];
  const done = new Set();
  const visiting = [];
  const visit = (pullRequest) => {
    if (done.has(pullRequest.number)) return null;
    if (visiting.includes(pullRequest.number)) return visiting.slice(visiting.indexOf(pullRequest.number));
    visiting.push(pullRequest.number);
    const base = byHead.get(pullRequest.baseRefName);
    const cycle = base ? visit(base) : null;
    if (cycle) return cycle;
    visiting.pop();
    done.add(pullRequest.number);
    order.push(pullRequest.number);
    return null;
  };
  for (const pullRequest of pullRequests) {
    const cycle = visit(pullRequest);
    if (cycle) return { cycle };
  }
  return { order };
}

function viewPullRequest(number, fields) {
  try {
    const text = execFileSync('gh', ['pr', 'view', number, '--json', fields], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return JSON.parse(text);
  } catch (error) {
    const errorText = `${error.stderr ?? ''}`.trim() || error.message;
    throw new GhError((errorText.split('\n').find((line) => line.trim() !== '') ?? 'no output').trim());
  }
}

function readFlags(argv) {
  const orderAt = argv.indexOf('--order');
  const numbers = orderAt === -1 ? [] : argv.slice(orderAt + 1);
  const flags = parseFlags(orderAt === -1 ? argv : argv.slice(0, orderAt), { pr: 'value' }, { usage: USAGE });
  if (orderAt !== -1) {
    if (flags.pr !== undefined) throw new UsageError('--pr and --order do not combine');
    if (numbers.length === 0 || !numbers.every((number) => PR_NUMBER.test(number))) {
      throw new UsageError('--order needs one or more pull request numbers');
    }
    return { order: numbers };
  }
  if (!PR_NUMBER.test(flags.pr ?? '')) throw new UsageError('--pr needs a pull request number');
  return { pr: flags.pr };
}

function main() {
  let flags;
  try {
    flags = readFlags(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`${USAGE}: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  try {
    if (flags.pr) {
      const verdict = gateVerdict(viewPullRequest(flags.pr, GATE_FIELDS));
      console.log(verdict);
      process.exitCode = verdict === 'MERGE' ? 0 : 1;
      return;
    }
    const outcome = stackOrder(flags.order.map((number) => viewPullRequest(number, ORDER_FIELDS)));
    console.log(outcome.order ? outcome.order.join(' ') : `CYCLE ${outcome.cycle.join(' ')}`);
    process.exitCode = outcome.order ? 0 : 1;
  } catch (error) {
    if (!(error instanceof GhError)) throw error;
    console.log(`STOP gh=${error.message}`);
    process.exitCode = GH_ERROR_EXIT;
  }
}

if (isMain(import.meta.url)) {
  main();
}
