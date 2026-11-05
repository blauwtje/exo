#!/usr/bin/env node
import fs from 'node:fs';
import process from 'node:process';
import path from 'node:path';
import { runsInBackground } from '#agent-launch';
import { agentContextTarget, contextPeaks, contextSeries, peakSummary, u4Verdict } from '#context-limits';
import { sumCounts, usageCounts } from '#token-weights';
import { transcriptFolder } from '#confine-claude';
import { parseFlags } from '#script-flags';
import { workerSize } from '#worker-size';

const USAGE = 'usage: context-peaks.mjs [--since <ms or ISO>] [--folder <transcript folder>] [--summary] [--verdict u4|u8|u2] [--sized] [--tools] [--resumed]';

function sinceMs(value) {
  if (value === undefined) return 0;
  const parsed = /^\d+$/.test(value) ? Number(value) : Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`--since '${value}' is neither milliseconds nor an ISO date`);
  return parsed;
}

const U8_OVER_SHARE_CEILING = 0.126;
const U8_INPUT_CEILING = 2860000;
const U8_MIN_RUNS = 30;
const DENY_TEXT = 'exo context limit: over the';
const NOTE_TEXT = 'exo context limit: at ';

function listDir(directory) {
  try {
    return fs.readdirSync(directory);
  } catch {
    return [];
  }
}

function inputTokens(series) {
  const counts = series.filter((point) => point.tokens !== null).map((point) => usageCounts(point.entry.message.usage));
  const totals = sumCounts(counts);
  return totals.input + totals.cacheRead + totals.cache5m + totals.cache1h;
}

function firstAgentContext(series) {
  const call = series.find((point) => point.tokens !== null && Array.isArray(point.entry.message.content)
    && point.entry.message.content.some((block) => block.type === 'tool_use' && block.name === 'Agent'));
  return call ? call.tokens : null;
}

function occurrences(file, text) {
  return fs.readFileSync(file, 'utf8').split(text).length - 1;
}

function isOrchestrator(file) {
  const metaFile = file.replace(/\.jsonl$/, '.meta.json');
  if (!fs.existsSync(metaFile)) return false;
  return /^(exo:)?orchestrator$/.test(JSON.parse(fs.readFileSync(metaFile, 'utf8')).agentType);
}

function instanceOf({ file, id, series }) {
  const agent = path.basename(file);
  return {
    label: `${agent.slice('agent-'.length, -'.jsonl'.length)} (session ${id})`,
    session: id,
    peak: Math.max(0, ...series.map((point) => point.tokens ?? 0)),
    firstAgent: firstAgentContext(series),
    denies: occurrences(file, DENY_TEXT),
    notes: occurrences(file, NOTE_TEXT)
  };
}

function sessionAgents({ folder, id, since }) {
  const subagents = path.join(folder, id, 'subagents');
  return listDir(subagents)
    .filter((entry) => /^agent-.*\.jsonl$/.test(entry))
    .map((entry) => path.join(subagents, entry))
    .filter((file) => fs.statSync(file).mtimeMs >= since);
}

function sessionUsage({ folder, id, since }) {
  const instances = [];
  let input = inputTokens(contextSeries(path.join(folder, `${id}.jsonl`)));
  for (const file of sessionAgents({ folder, id, since })) {
    const series = contextSeries(file);
    input += inputTokens(series);
    if (isOrchestrator(file)) instances.push(instanceOf({ file, id, series }));
  }
  return { instances, input };
}

function orchestratorInstances({ folder, since }) {
  const instances = [];
  const sessionInputs = new Map();
  for (const name of listDir(folder).filter((entry) => entry.endsWith('.jsonl'))) {
    const id = name.slice(0, -'.jsonl'.length);
    const usage = sessionUsage({ folder, id, since });
    instances.push(...usage.instances);
    sessionInputs.set(id, usage.input);
  }
  return { instances, sessionInputs };
}

function u8Report({ folder, since, target }) {
  const { instances, sessionInputs } = orchestratorInstances({ folder, since });
  const lines = instances.map((run) => `${run.label} peak=${run.peak} firstAgent=${run.firstAgent ?? 'none'} input=${sessionInputs.get(run.session)} denies=${run.denies} notes=${run.notes}`);
  if (instances.length < U8_MIN_RUNS) return [...lines, `PENDING n=${instances.length} of ${U8_MIN_RUNS}`];
  const overShare = instances.filter((run) => run.peak >= target).length / instances.length;
  const sessions = [...new Set(instances.map((run) => run.session))];
  const inputPerJob = sessions.reduce((sum, id) => sum + sessionInputs.get(id), 0) / sessions.length;
  const keep = overShare <= U8_OVER_SHARE_CEILING && inputPerJob < U8_INPUT_CEILING;
  return [...lines, `${keep ? 'KEEP' : 'DISCARD'} over=${(overShare * 100).toFixed(1)}% inputPerJob=${Math.round(inputPerJob)} n=${instances.length}`];
}

const SIZED_MIN_PAIRS = 50;
const SIZED_KEEP_SHARE = 0.9;
const SIZED_KEEP_BUDGET = 30000;

function agentCallPrompt({ parent, toolUseId }) {
  for (const point of contextSeries(parent)) {
    const blocks = point.entry.message?.content;
    if (!Array.isArray(blocks)) continue;
    const call = blocks.find((block) => block.type === 'tool_use' && block.name === 'Agent' && block.id === toolUseId);
    if (call) return call.input?.prompt ?? '';
  }
  return null;
}

function sizedPair({ file, parent }) {
  const metaFile = file.replace(/\.jsonl$/, '.meta.json');
  if (!fs.existsSync(metaFile)) return null;
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  const prompt = agentCallPrompt({ parent, toolUseId: meta.toolUseId });
  if (prompt === null) return null;
  const peak = Math.max(0, ...contextSeries(file).map((point) => point.tokens ?? 0));
  return { type: meta.agentType, estimate: workerSize({ prompt }).tokens, peak };
}

function sizedPairs({ folder, since }) {
  const pairs = [];
  for (const name of listDir(folder).filter((entry) => entry.endsWith('.jsonl'))) {
    const id = name.slice(0, -'.jsonl'.length);
    const parent = path.join(folder, name);
    const found = sessionAgents({ folder, id, since }).map((file) => sizedPair({ file, parent }));
    pairs.push(...found.filter(Boolean));
  }
  return pairs;
}

function p90(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  return sorted[Math.ceil(sorted.length * 0.9) - 1];
}

function sizedBudget({ group, target }) {
  const underShare = group.filter((pair) => pair.peak < target).length / group.length;
  if (group.length >= SIZED_MIN_PAIRS && underShare >= SIZED_KEEP_SHARE) return `KEEP ${SIZED_KEEP_BUDGET}`;
  return String(target - p90(group.map((pair) => pair.peak - pair.estimate)));
}

function sizedReport({ folder, since, target }) {
  const pairs = sizedPairs({ folder, since });
  const lines = pairs.map((pair) => `${pair.type} ${pair.estimate} ${pair.peak}`);
  const types = [...new Set(pairs.map((pair) => pair.type))];
  for (const type of types) {
    lines.push(`budget ${type} ${sizedBudget({ group: pairs.filter((pair) => pair.type === type), target })}`);
  }
  return lines;
}

const LEAD_PEAK_FLOOR = 72279;

function resultBytes(content) {
  if (typeof content === 'string') return Buffer.byteLength(content);
  if (!Array.isArray(content)) return 0;
  return content.reduce((sum, part) => sum + Buffer.byteLength(part.text ?? ''), 0);
}

function toolUsage(file) {
  const calls = new Map();
  const stats = new Map();
  const readCounts = new Map();
  const blocks = contextSeries(file).flatMap((point) => point.entry.message?.content ?? []).filter((block) => typeof block === 'object');
  for (const block of blocks) {
    if (block.type === 'tool_use') calls.set(block.id, block.name);
    if (block.type === 'tool_use' && block.name === 'Read') readCounts.set(block.input?.file_path, (readCounts.get(block.input?.file_path) ?? 0) + 1);
    if (block.type !== 'tool_result') continue;
    const name = calls.get(block.tool_use_id) ?? 'unknown';
    const row = stats.get(name) ?? { bytes: 0, calls: 0 };
    row.bytes += resultBytes(block.content);
    row.calls += 1;
    stats.set(name, row);
  }
  const repeatedReads = [...readCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  return { stats, repeatedReads };
}

function agentTranscripts({ folder, since }) {
  const found = [];
  for (const name of listDir(folder).filter((entry) => entry.endsWith('.jsonl'))) {
    const id = name.slice(0, -'.jsonl'.length);
    found.push({ type: 'session', id, file: path.join(folder, name) });
    for (const file of sessionAgents({ folder, id, since })) {
      const metaFile = file.replace(/\.jsonl$/, '.meta.json');
      const type = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')).agentType : 'unknown';
      found.push({ type, id, file });
    }
  }
  return found;
}

function addTotals({ totals, type, usage }) {
  for (const [tool, row] of usage.stats) {
    const key = `${type} ${tool}`;
    const total = totals.get(key) ?? { bytes: 0, calls: 0, repeatedReads: 0 };
    total.bytes += row.bytes;
    total.calls += row.calls;
    if (tool === 'Read') total.repeatedReads += usage.repeatedReads;
    totals.set(key, total);
  }
}

function leadLine({ id, file, usage }) {
  const peak = Math.max(0, ...contextSeries(file).map((point) => point.tokens ?? 0));
  if (peak <= LEAD_PEAK_FLOOR) return null;
  const parts = [...usage.stats].map(([tool, row]) => `${tool}=${row.bytes}`);
  return `lead ${id} peak=${peak} repeatedReads=${usage.repeatedReads} ${parts.join(' ')}`.trim();
}

function toolsReport({ folder, since }) {
  const totals = new Map();
  const lines = [];
  for (const { type, id, file } of agentTranscripts({ folder, since })) {
    const usage = toolUsage(file);
    if (type === 'session') lines.push(leadLine({ id, file, usage }));
    addTotals({ totals, type, usage });
  }
  const rows = [...totals].map(([key, total]) => `${key} bytes=${total.bytes} calls=${total.calls} repeatedReads=${total.repeatedReads}`);
  return [...rows, ...lines.filter(Boolean)];
}

const U2_MIN_RUNS = 500;
const U2_OVER_SHARE_CEILING = 0.104;
const U2_COST_RISE_CEILING = 0.005;
const U2_CAPPED_TYPES = ['orchestrator', 'general-purpose', 'claude', 'solve-hard', 'fix-review', 'review-branch', 'locate-code', 'find-open-points'];
const CAP_DENY_TEXT = 'exo result cap:';

function isCappedType(type) {
  return U2_CAPPED_TYPES.includes(String(type).replace(/^exo:/, ''));
}

function denyAndRetryTurns(file) {
  const readPaths = new Map();
  const denied = new Set();
  const turns = { denyTurns: 0, retries: 0 };
  const blocks = contextSeries(file).flatMap((point) => point.entry.message?.content ?? []).filter((block) => typeof block === 'object');
  for (const block of blocks) {
    if (block.type === 'tool_use' && block.name === 'Read') {
      readPaths.set(block.id, block.input?.file_path);
      turns.retries += Number(denied.delete(block.input?.file_path));
    }
    if (block.type !== 'tool_result' || !resultText(block.content).includes(CAP_DENY_TEXT)) continue;
    turns.denyTurns += 1;
    denied.add(readPaths.get(block.tool_use_id));
  }
  return turns;
}

function resultText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => part.text ?? '').join('');
}

function runCost(series) {
  const totals = sumCounts(series.filter((point) => point.tokens !== null).map((point) => usageCounts(point.entry.message.usage)));
  return totals.weightedInput + totals.output;
}

function u2Run({ file, since }) {
  const metaFile = file.replace(/\.jsonl$/, '.meta.json');
  if (!fs.existsSync(metaFile)) return null;
  const type = JSON.parse(fs.readFileSync(metaFile, 'utf8')).agentType;
  if (!isCappedType(type)) return null;
  const series = contextSeries(file);
  const peak = Math.max(0, ...series.map((point) => point.tokens ?? 0));
  return { type, capped: fs.statSync(file).mtimeMs >= since, peak, cost: runCost(series), ...denyAndRetryTurns(file) };
}

function u2Runs({ folder, since }) {
  const runs = [];
  for (const name of listDir(folder).filter((entry) => entry.endsWith('.jsonl'))) {
    const id = name.slice(0, -'.jsonl'.length);
    const found = sessionAgents({ folder, id, since: 0 }).map((file) => u2Run({ file, since }));
    runs.push(...found.filter(Boolean));
  }
  return runs;
}

function mean(numbers) {
  if (numbers.length === 0) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function u2TypeLines({ type, runs, target }) {
  const capped = runs.filter((run) => run.capped);
  const overShare = capped.filter((run) => run.peak >= target).length / capped.length;
  const cost = mean(capped.map((run) => run.cost));
  const baseline = mean(runs.filter((run) => !run.capped).map((run) => run.cost));
  const rise = baseline === null || baseline === 0 ? null : cost / baseline - 1;
  const keep = overShare <= U2_OVER_SHARE_CEILING && rise !== null && rise < U2_COST_RISE_CEILING;
  const sum = (key) => capped.reduce((total, run) => total + run[key], 0);
  const riseText = rise === null ? 'none' : `${(rise * 100).toFixed(2)}%`;
  return [
    `${type} n=${capped.length} over=${(overShare * 100).toFixed(1)}% denyTurns=${sum('denyTurns')} retries=${sum('retries')} cost=${Math.round(cost)} rise=${riseText}`,
    `${keep ? 'KEEP' : 'UNCAP'} ${type}`
  ];
}

function u2Report({ folder, since, target }) {
  const runs = u2Runs({ folder, since });
  const cappedCount = runs.filter((run) => run.capped).length;
  if (cappedCount < U2_MIN_RUNS) return [`PENDING n=${cappedCount} of ${U2_MIN_RUNS}`];
  const types = [...new Set(runs.filter((run) => run.capped).map((run) => run.type))];
  return types.flatMap((type) => u2TypeLines({ type, runs: runs.filter((run) => run.type === type), target }));
}

const RESUMED_MIN_RUNS = 10;
const NOTIFICATION_TEXT = '<task-notification>';

function launchesAsync(entry) {
  const blocks = entry.message?.content;
  if (!Array.isArray(blocks)) return false;
  return blocks.some((block) => block.type === 'tool_use' && block.name === 'Agent' && runsInBackground(block.input));
}

function isNotification(entry) {
  if (entry.type !== 'user') return false;
  return resultText(entry.message?.content).includes(NOTIFICATION_TEXT);
}

function resumeOutcome(file) {
  const entries = contextSeries(file).map((point) => point.entry);
  const launch = entries.findIndex(launchesAsync);
  if (launch < 0) return null;
  const ended = entries.findIndex((entry, index) => index > launch && entry.type === 'assistant' && entry.message?.stop_reason === 'end_turn');
  if (ended < 0) return null;
  const notified = entries.findIndex((entry, index) => index > ended && isNotification(entry));
  const resumed = notified >= 0 && entries.slice(notified + 1).some((entry) => entry.type === 'assistant');
  return { resumed };
}

function sessionKind(file) {
  const first = contextSeries(file)[0]?.entry;
  return first?.entrypoint === 'cli' ? 'interactive' : '-p';
}

function sessionResumedRuns({ folder, id, since }) {
  const kind = sessionKind(path.join(folder, `${id}.jsonl`));
  const outcomes = sessionAgents({ folder, id, since }).filter(isOrchestrator).map(resumeOutcome);
  return outcomes.filter(Boolean).map((outcome) => ({ kind, ...outcome }));
}

function resumedRuns({ folder, since }) {
  const ids = listDir(folder).filter((entry) => entry.endsWith('.jsonl')).map((name) => name.slice(0, -'.jsonl'.length));
  return ids.flatMap((id) => sessionResumedRuns({ folder, id, since }));
}

function resumedVerdict(group) {
  if (group.length < RESUMED_MIN_RUNS) return `PENDING n=${group.length} of ${RESUMED_MIN_RUNS}`;
  return group.every((run) => run.resumed) ? 'W1' : 'W2';
}

function resumedReport({ folder, since }) {
  const runs = resumedRuns({ folder, since });
  return ['interactive', '-p'].map((kind) => {
    const group = runs.filter((run) => run.kind === kind);
    const resumed = group.filter((run) => run.resumed).length;
    return `${kind} resumed=${resumed} of ${group.length} ${resumedVerdict(group)}`;
  });
}

const values = parseFlags(process.argv.slice(2), { since: 'value', folder: 'value', summary: 'boolean', verdict: 'value', sized: 'boolean', tools: 'boolean', resumed: 'boolean' }, { usage: USAGE });
const folder = values.folder ?? transcriptFolder(fs.realpathSync(process.cwd()));
const target = agentContextTarget();
const rows = contextPeaks({ folder, since: sinceMs(values.since) });
if (values.verdict !== undefined && !['u4', 'u8', 'u2'].includes(values.verdict)) throw new Error(`--verdict '${values.verdict}' is not u4, u8 or u2`);
if (values.sized) {
  console.log(sizedReport({ folder, since: sinceMs(values.since), target }).join('\n'));
  process.exit(0);
}
if (values.resumed) {
  console.log(resumedReport({ folder, since: sinceMs(values.since) }).join('\n'));
  process.exit(0);
}
if (values.tools) {
  console.log(toolsReport({ folder, since: sinceMs(values.since) }).join('\n'));
  process.exit(0);
}
if (values.verdict === 'u2') {
  console.log(u2Report({ folder, since: sinceMs(values.since), target }).join('\n'));
  process.exit(0);
}
if (values.verdict === 'u8') {
  console.log(u8Report({ folder, since: sinceMs(values.since), target }).join('\n'));
  process.exit(0);
}
if (values.verdict === 'u4') {
  console.log(u4Verdict(rows));
  process.exit(0);
}
if (values.summary) {
  for (const row of peakSummary(rows, target)) {
    console.log(`${row.agentType} n=${row.n} peak p50=${row.peakP50} p90=${row.peakP90} output p50=${row.outputP50} over=${(row.overShare * 100).toFixed(0)}%`);
  }
  process.exit(0);
}
for (const { agentType, label, peak } of rows) console.log(`${agentType} ${label} ${peak}${peak >= target ? ' over' : ''}`);
console.log(`over target (${target}): ${rows.filter((row) => row.peak >= target).length}`);
