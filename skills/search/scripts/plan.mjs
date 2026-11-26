#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { isMain, parseFlags, UsageError, USAGE_EXIT } from '#script-flags';
import { RESEARCH_SCRATCH, SEARCH_TIERS } from '#shared-values';
import { scratchPath } from '#scratch-path';

const USAGE = 'usage: plan.mjs --question <text> --tier <quick|standard|deep> --subs <json file> [--hosts <a,b>] [--sources <text>]';
const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WATCH_SCRIPTS = path.join(SKILL_DIR, '..', 'watch', 'scripts');
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;

function workerPrompt(sub, { dir, tier, question, sources }) {
  return [
    'Sources: web',
    `Run dir: ${dir}`,
    `Sub-question ${sub.id}: ${sub.ask}`,
    `Call budget: ${sub.calls}`,
    `Read target: ${tier.pages} pages`,
    `Deadline: ${sub.deadline}`,
    `Skill dir: ${SKILL_DIR}`,
    `Watch scripts: ${WATCH_SCRIPTS}`,
    `User prompt: "${question}"`,
    `User sources: ${sources}`,
    `Quality rubric: ${path.join(SKILL_DIR, 'references', 'quality.md')}`,
    `Follow ${path.join(SKILL_DIR, 'references', 'worker.md')}.`,
  ].join('\n');
}

export function makePlan({ question, tierName, asks, hosts, sources }, cwd, now = Date.now()) {
  const tier = SEARCH_TIERS[tierName];
  if (!tier) throw new UsageError(`tier must be one of ${Object.keys(SEARCH_TIERS).join(', ')}`);
  const [least, most] = tier.workers;
  if (!Array.isArray(asks) || asks.length < least || asks.length > most) {
    throw new Error(`tier ${tierName} takes ${least} to ${most} sub-questions, got ${Array.isArray(asks) ? asks.length : 'no list'}`);
  }
  const deadline = new Date(now + tier.minutes * SECONDS_PER_MINUTE * MS_PER_SECOND).toISOString();
  const subQuestions = asks.map((ask, index) => ({ id: `Q${index + 1}`, ask, calls: tier.calls, deadline, status: 'open' }));
  const dir = fs.mkdtempSync(path.join(scratchPath(cwd, RESEARCH_SCRATCH), 'run-'));
  const runDeadline = tier.runMinutes && new Date(now + tier.runMinutes * SECONDS_PER_MINUTE * MS_PER_SECOND).toISOString();
  const plan = { question, tier: tierName, subQuestions, ...(runDeadline && { runDeadline }), ...(hosts.length > 0 && { hosts }) };
  fs.writeFileSync(path.join(dir, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
  const lines = [`Run: ${dir}`, ...(runDeadline ? [`Run deadline: ${runDeadline}`] : [])];
  for (const sub of subQuestions) lines.push(`Worker ${sub.id}:`, workerPrompt(sub, { dir, tier, question, sources }));
  return lines.join('\n');
}

if (isMain(import.meta.url)) {
  try {
    const flags = parseFlags(process.argv.slice(2), { question: 'value', tier: 'value', subs: 'value', hosts: 'value', sources: 'value' }, { usage: USAGE });
    if (flags.question === undefined || flags.tier === undefined || flags.subs === undefined) throw new UsageError(USAGE);
    const asks = JSON.parse(fs.readFileSync(flags.subs, 'utf8'));
    const hosts = (flags.hosts ?? '').split(',').filter(Boolean);
    process.stdout.write(`${makePlan({ question: flags.question, tierName: flags.tier, asks, hosts, sources: flags.sources ?? 'none' }, process.cwd())}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(error instanceof UsageError ? USAGE_EXIT : 1);
  }
}
