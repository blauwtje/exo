#!/usr/bin/env node

import process from 'node:process';
import { USAGE_EXIT, UsageError, parseFlags, isMain } from '#script-flags';
import { GH_ERROR_EXIT, GhError, PR_NUMBER, ghJson } from './gh-run.mjs';

const USAGE = 'usage: ship-gate.mjs --pr <number> | --order <number>...';
const GATE_FIELDS = 'number,state,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup';
const ORDER_FIELDS = 'number,baseRefName,headRefName';
const PASSING_CONCLUSIONS = new Set(['SUCCESS', 'SKIPPED', 'NEUTRAL']);

function holdingCheck(check) {
  const name = check.name || check.context || 'unnamed';
  if (check.state !== undefined && check.status === undefined) {
    return check.state === 'SUCCESS' ? null : `state=${check.state} ${name}`;
  }
  if (check.status !== undefined && check.status !== 'COMPLETED') return `status=${check.status} ${name}`;
  const conclusion = check.conclusion || 'NONE';
  return PASSING_CONCLUSIONS.has(conclusion) ? null : `conclusion=${conclusion} ${name}`;
}

function gateVerdict(pullRequest) {
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

function visitStacked(stack, pullRequest) {
  if (stack.done.has(pullRequest.number)) return null;
  const at = stack.visiting.indexOf(pullRequest.number);
  if (at !== -1) return stack.visiting.slice(at);
  stack.visiting.push(pullRequest.number);
  const base = stack.byHead.get(pullRequest.baseRefName);
  const cycle = base ? visitStacked(stack, base) : null;
  if (cycle) return cycle;
  stack.visiting.pop();
  stack.done.add(pullRequest.number);
  stack.order.push(pullRequest.number);
  return null;
}

function stackOrder(pullRequests) {
  const byHead = new Map(pullRequests.map((pullRequest) => [pullRequest.headRefName, pullRequest]));
  const stack = { byHead, order: [], done: new Set(), visiting: [] };
  for (const pullRequest of pullRequests) {
    const cycle = visitStacked(stack, pullRequest);
    if (cycle) return { cycle };
  }
  return { order: stack.order };
}

function viewPullRequest(number, fields) {
  return ghJson(['pr', 'view', number, '--json', fields]);
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
  if (!PR_NUMBER.test(flags.pr ?? '')) throw new UsageError(`--pr needs a pull request number, got '${flags.pr ?? ''}'`);
  return { pr: flags.pr };
}

function main() {
  let flags;
  try {
    flags = readFlags(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`${USAGE}: ${error.message}`);
    process.exitCode = USAGE_EXIT;
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
