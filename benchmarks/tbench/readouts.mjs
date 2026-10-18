import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { signTest } from '../statistics.mjs';
import { classify, readTrials, streamResult, trialCost, trialMix, trialSetupMs, trialTask, trialWallMs } from './job.mjs';

const ASK_PHRASE = /\b(would you like|let me know|want me to|should I|shall I)\b/i;
const MIN_MIXED_TASKS = 4;

function streamEvents(trialDirectory) {
  let text;
  try {
    text = fs.readFileSync(path.join(trialDirectory, 'agent', 'claude-code.txt'), 'utf8');
  } catch {
    return [];
  }
  const events = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('{')) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      continue;
    }
  }
  return events;
}

function toolUses(events) {
  return events
    .filter((event) => event.type === 'assistant' && Array.isArray(event.message?.content))
    .flatMap((event) => event.message.content.filter((block) => block.type === 'tool_use'));
}

export function isAsk(text) {
  const lines = String(text ?? '').split('\n').map((line) => line.trim()).filter(Boolean).slice(-3);
  return lines.some((line) => /\?[\s"'`*_)\]]*$/.test(line) || ASK_PHRASE.test(line));
}

export function scoreStream(trialDirectory) {
  const events = streamEvents(trialDirectory);
  const askTool = toolUses(events).some((use) => use.name === 'AskUserQuestion');
  const closing = streamResult(trialDirectory)?.result;
  return { ask: askTool || isAsk(closing), askTool };
}

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

function standardError(values) {
  if (values.length < 2) return null;
  const center = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - center) ** 2, 0) / (values.length - 1) / values.length);
}

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function byTask(cells) {
  const groups = new Map();
  for (const cell of cells) groups.set(cell.task, [...(groups.get(cell.task) ?? []), cell]);
  return groups;
}

function perSolved(cells, metric) {
  const passes = cells.filter((cell) => cell.pass).length;
  return passes === 0 ? null : cells.reduce((sum, cell) => sum + (cell[metric] ?? 0), 0) / passes;
}

export function bootstrapPerSolved(cells, metric, { rounds = 2000, seed = 1 } = {}) {
  const point = perSolved(cells, metric);
  if (point === null) return null;
  const random = seeded(seed);
  const groups = [...byTask(cells).values()];
  const draws = [];
  for (let round = 0; round < rounds; round += 1) {
    const sample = groups.flatMap((group) => group.map(() => group[Math.floor(random() * group.length)]));
    const draw = perSolved(sample, metric);
    if (draw !== null) draws.push(draw);
  }
  draws.sort((left, right) => left - right);
  if (draws.length === 0) return { point, low: null, high: null };
  return { point, low: draws[Math.floor(0.025 * (draws.length - 1))], high: draws[Math.ceil(0.975 * (draws.length - 1))] };
}

const money = (value) => (value === null ? 'none' : `$${value.toFixed(3)}`);
const seconds = (value) => (value === null ? 'none' : `${(value / 1000).toFixed(1)} s`);
const spread = (values, format) => {
  if (values.length === 0) return 'none';
  const error = standardError(values);
  return `${format(mean(values))}${error === null ? '' : ` ±${format(2 * error)}`} (n=${values.length})`;
};
const interval = (estimate, format) => (estimate === null ? 'none (0 passes)' : `${format(estimate.point)}${estimate.low === null ? '' : ` [${format(estimate.low)}, ${format(estimate.high)}]`}`);

export function renderReport(cells) {
  const arms = [...new Set(cells.map((cell) => cell.arm))].sort();
  const of = (arm) => cells.filter((cell) => cell.arm === arm);
  const lines = ['## Mechanism readouts', '', '| arm | cells | asks |', '|---|---|---|'];
  for (const arm of arms) lines.push(`| ${arm} | ${of(arm).length} | ${of(arm).filter((cell) => cell.ask).length} |`);
  lines.push('', '## 1. Cost and wall per solved task (arm total over passes, 95% bootstrap interval)', '', '| arm | passes | cost | wall |', '|---|---|---|---|');
  for (const arm of arms) {
    const own = of(arm);
    lines.push(`| ${arm} | ${own.filter((cell) => cell.pass).length}/${own.length} | ${interval(bootstrapPerSolved(own, 'cost'), money)} | ${interval(bootstrapPerSolved(own, 'wallMs'), seconds)} |`);
  }
  lines.push('', '## 2. Passing cells only, per task (mean ±2 SE)', '', '| task | arm | cost | wall |', '|---|---|---|---|');
  const tasks = [...new Set(cells.map((cell) => cell.task))].sort();
  for (const task of tasks) {
    for (const arm of arms) {
      const passing = of(arm).filter((cell) => cell.task === task && cell.pass);
      lines.push(`| ${task} | ${arm} | ${spread(passing.map((cell) => cell.cost ?? 0), money)} | ${spread(passing.map((cell) => cell.wallMs ?? 0), seconds)} |`);
    }
  }
  lines.push('', '## 3. Raw per cell, passing or not (mean ±2 SE)', '', '| task | arm | cost | wall |', '|---|---|---|---|');
  for (const task of tasks) {
    for (const arm of arms) {
      const own = of(arm).filter((cell) => cell.task === task);
      lines.push(`| ${task} | ${arm} | ${spread(own.map((cell) => cell.cost ?? 0), money)} | ${spread(own.map((cell) => cell.wallMs ?? 0), seconds)} |`);
    }
  }
  const known = (own, key) => own.map((cell) => cell[key]).filter((value) => typeof value === 'number');
  const hasThinking = known(cells, 'thinking').length > 0;
  const counts = [['output', 'output'], ['turns', 'turns'], ['cacheWrites', 'cache writes'], ...(hasThinking ? [['thinking', 'thinking']] : [])];
  const heads = [...counts.map(([, head]) => head), 'agent wall', 'setup wall'];
  lines.push('', '## 4. Token mix and wall per cell (mean over cells reporting it)', '', `| task | arm | ${heads.join(' | ')} |`, `|---|---|${heads.map(() => '---|').join('')}`);
  const count = (values) => (values.length === 0 ? 'none' : Math.round(mean(values)).toString());
  for (const task of tasks) {
    for (const arm of arms) {
      const own = of(arm).filter((cell) => cell.task === task);
      const wall = (key) => (known(own, key).length === 0 ? 'n/a' : seconds(mean(known(own, key))));
      lines.push(`| ${task} | ${arm} | ${counts.map(([key]) => count(known(own, key))).join(' | ')} | ${wall('wallMs')} | ${wall('setupMs')} |`);
    }
  }
  lines.push(...pairedCost(cells, tasks, arms), ...failingTranscripts(cells));
  return `${lines.join('\n')}\n`;
}

function pairedCost(cells, tasks, arms) {
  if (arms.length !== 2) return [];
  const taskMean = (task, arm) => {
    const costs = cells.filter((cell) => cell.task === task && cell.arm === arm && typeof cell.cost === 'number').map((cell) => cell.cost);
    return costs.length === 0 ? null : mean(costs);
  };
  const pairs = tasks.map((task) => [task, taskMean(task, arms[0]), taskMean(task, arms[1])]).filter(([, left, right]) => left !== null && right !== null);
  const test = signTest(pairs.map(([, left, right]) => [right, left]));
  return ['', `## 5. Paired cost per task (${arms[0]} vs ${arms[1]})`, '', `| task | ${arms[0]} | ${arms[1]} |`, '|---|---|---|', ...pairs.map(([task, left, right]) => `| ${task} | ${money(left)} | ${money(right)} |`), '', `${arms[1]} cheaper on ${test.wins} of ${test.n} decided tasks, sign test p=${test.p.toFixed(3)}`];
}

function failingTranscripts(cells) {
  const failing = cells.filter((cell) => !cell.pass && cell.transcript);
  if (failing.length === 0) return [];
  return ['', '## 6. Failing trial transcripts', '', ...failing.map((cell) => `- ${cell.task} ${cell.arm}: ${cell.transcript}`)];
}

export function calibrate(cells) {
  const mixed = [...byTask(cells)].filter(([, group]) => group.some((cell) => cell.pass) && group.some((cell) => !cell.pass)).map(([task]) => task).sort();
  return { mixed, saturated: mixed.length < MIN_MIXED_TASKS };
}

function cellOf(trial, arm) {
  if (!trial.result) return null;
  const verdict = classify(trial);
  if (verdict.kind === 'cancelled' || verdict.kind === 'infra') return null;
  return { task: trialTask(trial.result), arm, name: trial.name, pass: verdict.kind === 'pass', cost: trialCost(trial), wallMs: trialWallMs(trial.result), setupMs: trialSetupMs(trial.result), ...trialMix(trial), transcript: path.join(trial.directory, 'agent', 'claude-code.txt'), ...scoreStream(trial.directory) };
}

export function readCells(jobs) {
  return jobs.flatMap(({ directory, arm }) => readTrials(directory).map((trial) => cellOf(trial, arm)).filter(Boolean));
}

function parseJobs(values) {
  return values.map((value) => {
    const [directory, arm] = String(value).split('=');
    if (!directory || !arm) throw new Error('--job takes <job dir>=<arm>');
    return { directory, arm };
  });
}

function main(argv) {
  const { values } = parseArgs({ args: argv, options: { job: { type: 'string', multiple: true }, calibrate: { type: 'boolean' } } });
  const jobs = parseJobs(values.job ?? []);
  if (jobs.length === 0) throw new Error('usage: readouts.mjs --job <job dir>=<arm> [--job ...] [--calibrate]');
  const cells = readCells(jobs);
  if (!values.calibrate) return process.stdout.write(renderReport(cells));
  const { mixed, saturated } = calibrate(cells);
  process.stdout.write(`mixed tasks (${mixed.length}): ${mixed.join(', ') || 'none'}\n${saturated ? 'saturated\n' : ''}`);
  if (saturated) process.exitCode = 3;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
