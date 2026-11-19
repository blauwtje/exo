import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import process from 'node:process';
import { UsageError, USAGE_EXIT, isMain, parseFlags } from '../lib/script-flags.mjs';

const USAGE = 'usage: node benchmarks/layout-ab.mjs [--runs <n>=10] [--model <name>=haiku] [--max-cost-usd <usd>=1] [--dry-run] [--claude <bin>=claude]';
const MIN_RUNS = 5;
const ARMS = ['pipe', 'line', 'control'];
const FIELDS = ['dependsOn', 'files', 'data', 'proof'];
const DIRECTORY = new URL('./layout-ab/', import.meta.url);

const INSTRUCTION = `Below is a plan. For each task, return its Depends on, Files, Data and Proof values exactly as written.
Reply with only a JSON array of objects {"task": <number>, "dependsOn": <text>, "files": <text>, "data": <text>, "proof": <text>}.

`;

export function mean(values) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function spread(values) {
  const center = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - center) ** 2)));
}

export function scoreAnswer(answers, expected) {
  const byTask = new Map(answers.map((answer) => [Number(answer.task), answer]));
  let matches = 0;
  for (const [task, fields] of Object.entries(expected)) {
    for (const field of FIELDS) {
      if (String(byTask.get(Number(task))?.[field] ?? '').trim() === fields[field]) matches += 1;
    }
  }
  return matches / (Object.keys(expected).length * FIELDS.length);
}

export function decide(stats) {
  const { pipe, line, control } = stats;
  if (ARMS.some((arm) => stats[arm].rates.length === 0)) return 'void';
  if (ARMS.some((arm) => stats[arm].rates.length !== control.rates.length)) return 'void';
  if (!(control.rate < pipe.rate && control.rate < line.rate)) return 'void';
  const margin = Math.max(pipe.spread, line.spread);
  if (line.rate - pipe.rate > margin) return 'switch';
  if (pipe.rate - line.rate > margin) return 'keep';
  return 'inconclusive';
}

function parseAnswer(stdout) {
  const result = JSON.parse(stdout).result;
  const start = result.indexOf('[');
  const end = result.lastIndexOf(']');
  return JSON.parse(result.slice(start, end + 1));
}

function costOf(stdout) {
  try {
    return Number(JSON.parse(stdout).total_cost_usd ?? 0);
  } catch (error) {
    return 0;
  }
}

function askClaude({ claude, model, prompt, budget }) {
  const stdout = execFileSync(claude, [
    '-p', '--model', model, '--output-format', 'json', '--max-budget-usd', String(budget),
    '--tools', '', '--disable-slash-commands', '--no-session-persistence'
  ], { input: prompt, encoding: 'utf8', cwd: os.tmpdir() });
  return { stdout, cost: costOf(stdout) };
}

export function runAb({ runs, model, cap, claude, expected, prompts }) {
  const stats = Object.fromEntries(ARMS.map((arm) => [arm, { attempted: 0, rates: [], errors: 0, cost: 0 }]));
  let spent = 0;
  for (let run = 0; run < runs && spent < cap; run += 1) {
    for (const arm of ARMS) {
      if (spent >= cap) break;
      const entry = stats[arm];
      entry.attempted += 1;
      try {
        const { stdout, cost } = askClaude({ claude, model, prompt: prompts[arm], budget: cap - spent });
        spent += cost;
        entry.cost += cost;
        entry.rates.push(scoreAnswer(parseAnswer(stdout), expected));
      } catch (error) {
        const cost = costOf(String(error.stdout ?? ''));
        spent += cost;
        entry.cost += cost;
        entry.errors += 1;
        process.stderr.write(`${arm} run ${run + 1}: ${error.message.split('\n')[0]}\n`);
      }
    }
  }
  for (const entry of Object.values(stats)) {
    entry.rate = mean(entry.rates);
    entry.spread = spread(entry.rates);
  }
  return stats;
}

function readInputs() {
  const read = (name) => fs.readFileSync(new URL(name, DIRECTORY), 'utf8');
  return {
    expected: JSON.parse(read('expected.json')),
    prompts: Object.fromEntries(ARMS.map((arm) => [arm, INSTRUCTION + read(`${arm}.md`)]))
  };
}

function main(argv) {
  const flags = parseFlags(argv, { runs: 'string', model: 'string', 'max-cost-usd': 'string', 'dry-run': 'boolean', claude: 'string' }, { usage: USAGE });
  const runs = Number(flags.runs ?? 10);
  const cap = Number(flags['max-cost-usd'] ?? 1);
  if (!Number.isInteger(runs) || runs < MIN_RUNS) throw new UsageError(`--runs needs an integer of at least ${MIN_RUNS}, got '${flags.runs}'`);
  if (!(cap > 0)) throw new UsageError(`--max-cost-usd needs a positive number, got '${flags['max-cost-usd']}'`);
  const model = flags.model ?? 'haiku';
  const { expected, prompts } = readInputs();
  if (flags['dry-run']) {
    process.stdout.write(`Dry run: ${runs * ARMS.length} calls of ${model} over ${ARMS.join(', ')}, cap ${cap} USD, no call made\n`);
    return;
  }
  const stats = runAb({ runs, model, cap, claude: flags.claude ?? 'claude', expected, prompts });
  for (const arm of ARMS) {
    const entry = stats[arm];
    process.stdout.write(`${arm}: runs ${entry.attempted}, finished ${entry.rates.length}, errors ${entry.errors}, rate ${entry.rate.toFixed(3)}, spread ${entry.spread.toFixed(3)}, cost ${entry.cost.toFixed(4)} USD\n`);
  }
  process.stdout.write(`Verdict: ${decide(stats)}\n`);
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`${error.message}\n${USAGE}\n`);
    process.exit(USAGE_EXIT);
  }
}
