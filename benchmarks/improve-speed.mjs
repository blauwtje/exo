import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MEASURES = ['pathCalls', 'calls', 'outputTokens', 'fixRounds'];
const USAGE = 'usage: node benchmarks/improve-speed.mjs <checkout> | --from <out dir> [--measure pathCalls|calls|outputTokens|fixRounds] [--repeat 15] [--concurrency 5]';
const FAILED_LINE = /^(FAIL|UNPLANNED)/m;

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const mean = (values) => Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;

function readLines(file) {
  const entries = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      continue;
    }
  }
  return entries;
}

function agentOf(entries) {
  const callIds = new Set();
  const times = [];
  for (const entry of entries) {
    if (entry.type === 'assistant' && entry.message?.id && entry.message.usage) callIds.add(entry.message.id);
    const time = Date.parse(entry.timestamp);
    if (Number.isFinite(time)) times.push(time);
  }
  return { entries, callIds, start: Math.min(...times), end: Math.max(...times), children: [] };
}

function subagentFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).sort().filter((name) => name.endsWith('.jsonl'));
}

function subagentOf(directory, name) {
  const agent = agentOf(readLines(path.join(directory, name)));
  const metaFile = path.join(directory, name.replace(/\.jsonl$/, '.meta.json'));
  agent.parent = fs.existsSync(metaFile) ? readJson(metaFile).parentAgentId : undefined;
  return agent;
}

export function loadAgents(transcript) {
  const main = agentOf(readLines(transcript));
  const directory = path.join(transcript.replace(/\.jsonl$/, ''), 'subagents');
  const byId = new Map(subagentFiles(directory).map((name) => [name.slice('agent-'.length, -'.jsonl'.length), subagentOf(directory, name)]));
  for (const agent of byId.values()) (byId.get(agent.parent) ?? main).children.push(agent);
  return { main, all: [main, ...byId.values()] };
}

function overlapGroups(agents) {
  const groups = [];
  for (const agent of [...agents].sort((a, b) => a.start - b.start)) {
    const group = groups.at(-1);
    if (group && agent.start <= group.end) {
      group.agents.push(agent);
      group.end = Math.max(group.end, agent.end);
    } else groups.push({ agents: [agent], end: agent.end });
  }
  return groups.map((group) => group.agents);
}

export function pathCalls(agent) {
  const groups = overlapGroups(agent.children);
  return agent.callIds.size + groups.reduce((sum, group) => sum + Math.max(...group.map(pathCalls)), 0);
}

function toolBlocks(entries) {
  return entries.flatMap((entry) => (Array.isArray(entry.message?.content) ? entry.message.content : []));
}

const isVerifyRun = (block) => block.type === 'tool_use' && block.name === 'Bash' && /verify\.mjs/.test(String(block.input?.command));

const resultText = (content) => (Array.isArray(content) ? content.map((part) => part.text ?? '').join('\n') : String(content ?? ''));

export function verifyFailure(main) {
  const blocks = toolBlocks(main.entries);
  const last = blocks.filter(isVerifyRun).at(-1);
  if (!last) return 'verify gate not run';
  const result = blocks.findLast((block) => block.type === 'tool_result' && block.tool_use_id === last.id);
  if (!result || result.is_error || FAILED_LINE.test(resultText(result.content))) return 'verify gate failed';
  return null;
}

function recordFailures(record) {
  const failures = [];
  if (record.exitCode !== 0) failures.push('exit code not 0');
  if (record.timedOut) failures.push('timed out');
  if (record.hiddenPass !== true) failures.push('hidden tests failed');
  if (record.defects?.length) failures.push('defects found');
  if (record.verifyRan !== true) failures.push('verify gate not run');
  return failures;
}

function transcriptFailures(usage) {
  if (!usage?.transcript || !fs.existsSync(usage.transcript)) return { failures: ['transcript missing'] };
  const { main, all } = loadAgents(usage.transcript);
  const gate = verifyFailure(main);
  const calls = new Set(all.flatMap((agent) => [...agent.callIds])).size;
  return { failures: gate ? [gate] : [], calls, pathCalls: pathCalls(main) };
}

export function cellRow(directory) {
  const record = readJson(path.join(directory, 'record.json'));
  const usageFile = path.join(directory, 'usage.json');
  const usage = fs.existsSync(usageFile) ? readJson(usageFile) : null;
  const measured = transcriptFailures(usage);
  const failures = [...recordFailures(record), ...measured.failures];
  const fixRounds = (usage?.subagents ?? []).filter((type) => type === 'exo:fix-review').length;
  return { cell: path.basename(directory), failures: [...new Set(failures)], outputTokens: record.outputTokens, fixRounds, calls: measured.calls, pathCalls: measured.pathCalls };
}

export function scoreOutDir(outDirectory) {
  const cells = fs.readdirSync(outDirectory).sort().map((name) => path.join(outDirectory, name)).filter((directory) => fs.existsSync(path.join(directory, 'record.json')));
  const rows = cells.map(cellRow);
  const measures = Object.fromEntries(MEASURES.map((name) => [name, rows.every((row) => row[name] !== undefined) ? mean(rows.map((row) => row[name])) : null]));
  return { rows, measures };
}

function parseArgs(argv) {
  const options = { checkout: null, from: null, measure: 'pathCalls', repeat: 15, concurrency: 5 };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === '--from') options.from = argv[++index];
    else if (flag === '--measure') options.measure = argv[++index];
    else if (flag === '--repeat') options.repeat = Number(argv[++index]);
    else if (flag === '--concurrency') options.concurrency = Number(argv[++index]);
    else options.checkout = flag;
  }
  return options;
}

function runSweep(options) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-improve-speed-'));
  const out = path.join(tmp, 'runs');
  const log = path.join(tmp, 'sweep.log');
  const descriptor = fs.openSync(log, 'w');
  const checkout = path.resolve(options.checkout);
  const args = [path.join(checkout, 'benchmarks', 'sweep.mjs'), '--set', 'flow', '--cells', 'flow-unit', '--repeat', String(options.repeat), '--concurrency', String(options.concurrency), '--confirm', '--out', out, '--results', path.join(tmp, 'results')];
  spawnSync(process.execPath, args, { stdio: ['ignore', descriptor, descriptor] });
  fs.closeSync(descriptor);
  console.log(`log ${log}`);
  console.log(`out ${out}`);
  return out;
}

function main(argv) {
  const options = parseArgs(argv);
  if (!MEASURES.includes(options.measure) || (!options.from && !options.checkout)) {
    console.error(USAGE);
    return 2;
  }
  const out = options.from ?? runSweep(options);
  const { rows, measures } = fs.existsSync(out) ? scoreOutDir(out) : { rows: [], measures: {} };
  const failures = rows.flatMap((row) => row.failures.map((reason) => `FAIL ${row.cell} ${reason}`));
  if (rows.length === 0) failures.push('FAIL no cells');
  if (!options.from && rows.length < options.repeat) failures.push(`FAIL sweep ${rows.length} of ${options.repeat} cells recorded`);
  if (failures.length) {
    console.log(failures.join('\n'));
    return 1;
  }
  for (const name of MEASURES) console.log(`measure ${name} ${measures[name]}`);
  console.log(`score: ${measures[options.measure]}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
