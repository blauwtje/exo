import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';

export const SOFT_RATIO = 0.75;
export const TASK_SPLIT_TOKENS = 15_000;
export const BYTES_PER_TOKEN = 4;
export const REVIEW_SHARD_RATIO = 0.25;

const TAIL_BYTES = 256 * 1024;
const CATALOG = new URL('./run-providers.json', import.meta.url);

const isPositiveNumber = (value) => Number.isFinite(value) && value > 0;

function readDefault(file, key, accepts) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8')).defaults?.[key];
    return isPositiveNumber(value) && accepts(value) ? value : null;
  } catch {
    return null;
  }
}

function contextDefault(key, home, accepts = isPositiveNumber) {
  return readDefault(path.join(home, '.config', 'exo', 'run.json'), key, accepts) ?? readDefault(CATALOG, key, accepts);
}

export function softLimit(limit) {
  return Math.round(limit * SOFT_RATIO);
}

export function contextLimit(home = os.homedir()) {
  return contextDefault('contextLimit', home, Number.isInteger);
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

export function orchestratorWorkers(home = os.homedir()) {
  return contextDefault('orchestratorWorkers', home);
}

export function resultCapBytes(home = os.homedir()) {
  return contextDefault('resultCapBytes', home);
}

export function orchestratorResultCapBytes(home = os.homedir()) {
  return contextDefault('orchestratorResultCapBytes', home);
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

function parseLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function usageTokens(entry) {
  const usage = entry?.type === 'assistant' ? entry.message?.usage : null;
  if (!usage) return null;
  const sum = (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
  return Number.isFinite(sum) && sum > 0 ? sum : null;
}

const entryTokens = (line) => usageTokens(parseLine(line));

export function contextSeries(file) {
  const entries = fs.readFileSync(file, 'utf8').split('\n').map(parseLine).filter(Boolean);
  return entries.map((entry) => ({ tokens: usageTokens(entry), entry }));
}

export function contextTokens(transcriptPath) {
  if (typeof transcriptPath !== 'string' || transcriptPath === '') return null;
  let fd;
  try {
    fd = fs.openSync(transcriptPath, 'r');
    const { size } = fs.fstatSync(fd);
    const start = Math.max(0, size - TAIL_BYTES);
    const buffer = Buffer.alloc(size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    const lines = buffer.toString('utf8').split('\n');
    if (start > 0) lines.shift();
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const tokens = entryTokens(lines[index]);
      if (tokens !== null) return tokens;
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function transcriptOf(input) {
  if (!input.agent_id) return input.transcript_path;
  if (input.agent_transcript_path) return input.agent_transcript_path;
  if (typeof input.transcript_path !== 'string') return null;
  return path.join(input.transcript_path.replace(/\.jsonl$/, ''), 'subagents', `agent-${input.agent_id}.jsonl`);
}

const levelFile = (sessionId) => path.join(os.tmpdir(), `exo-context-${String(sessionId).replace(/[^\w-]/g, '_')}`);

function firstWarning(sessionId, level) {
  try {
    const file = levelFile(sessionId);
    let last = 0;
    try { last = Number(fs.readFileSync(file, 'utf8')) || 0; } catch { }
    if (level <= last) return false;
    fs.writeFileSync(file, String(level));
    return true;
  } catch {
    return true;
  }
}

export function contextDecision(hookInput) {
  const input = hookInput ?? {};
  const isAgent = Boolean(input.agent_id);
  const loopFile = isAgent ? '' : process.env.EXO_RUN_HANDOFF ?? '';
  if (!isAgent && loopFile === '') return null;
  const tokens = contextTokens(transcriptOf(input));
  if (tokens === null) return null;
  const hardLimit = contextLimit();
  const used = `Context use is ${Math.round(tokens / 1000)}k tokens.`;

  if (tokens >= hardLimit) {
    if (input.tool_name === 'Write') return null;
    if (isAgent) return { deny: `${used} exo context limit: over the ${hardLimit / 1000}k hard limit, so every tool except Write is refused. Write is still allowed: Write the result file your brief names with what is done, what remains and the files you changed, then reply with its path. A fresh agent continues from it.` };
    const task = (process.env.EXO_RUN_TASK ?? '').split('/').pop() || '<n>';
    return { deny: `${used} Over the ${hardLimit / 1000}k hard limit: write what is done, what remains and the files you changed, at most 25 lines, with Write to ${loopFile}, then end on the last line \`Task ${task}: HANDOFF\`. A fresh session continues from that file.` };
  }
  if (tokens < softLimit(hardLimit)) {
    if (isAgent) fs.rmSync(levelFile(input.agent_id), { force: true });
    return null;
  }
  if (!isAgent) return { additionalContext: `${used} Finish your current step, then land the task as soon as its proof passes.` };
  if (!firstWarning(input.agent_id, 1)) return null;
  return { additionalContext: `${used} exo context limit: at ${hardLimit / 1000}k your tools are refused except Write. Finish the edit in hand, write the result file your brief names with what is done, what remains and the files you changed, and return.` };
}

export function persistedReadDecision(hookInput) {
  const input = hookInput ?? {};
  if (input.agent_id || input.tool_name !== 'Read' || typeof input.transcript_path !== 'string') return null;
  const file = input.tool_input?.file_path;
  if (typeof file !== 'string' || input.tool_input.limit !== undefined) return null;
  const results = path.join(input.transcript_path.replace(/\.jsonl$/, ''), 'tool-results');
  if (path.dirname(path.resolve(file)) !== results) return null;
  return { deny: 'This file holds a tool output too large to show inline; reading it whole puts that overflow back into context. Read only the lines you need with offset and limit, grep it, or hand the reading to a subagent.' };
}

export const CAPPED_TYPES = ['orchestrator', 'general-purpose', 'claude', 'solve-hard', 'fix-review', 'review-branch', 'locate-code', 'find-open-points'];

const UNCAPPED_READ_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.ipynb']);
const DEFAULT_READ_LINES = 2000;
const READ_CHUNK_BYTES = 64 * 1024;

export function resultCapFor(hookInput) {
  const type = hookAgentType(hookInput);
  if (!CAPPED_TYPES.includes(type)) return null;
  return type === 'orchestrator' ? orchestratorResultCapBytes() : resultCapBytes();
}

function leadingLines(file, count) {
  const fd = fs.openSync(file, 'r');
  const chunk = Buffer.alloc(READ_CHUNK_BYTES);
  let text = '';
  try {
    let read = fs.readSync(fd, chunk, 0, chunk.length, null);
    while (read > 0 && text.split('\n').length <= count) {
      text += chunk.toString('utf8', 0, read);
      read = fs.readSync(fd, chunk, 0, chunk.length, null);
    }
  } finally {
    fs.closeSync(fd);
  }
  return text.split('\n').slice(0, count);
}

function fittingLines(lines, cap) {
  let bytes = 0;
  let fitting = 0;
  for (const line of lines) {
    bytes += Buffer.byteLength(line) + 1;
    if (bytes > cap) return fitting;
    fitting += 1;
  }
  return null;
}

export function readCapDecision(hookInput) {
  const input = hookInput ?? {};
  const { file_path: file, offset, limit, pages } = input.tool_input ?? {};
  if (input.tool_name !== 'Read' || typeof file !== 'string' || pages !== undefined) return null;
  if (UNCAPPED_READ_EXTENSIONS.has(path.extname(file).toLowerCase())) return null;
  const cap = resultCapFor(input);
  if (cap === null) return null;
  const first = Math.max(1, Number(offset) || 1);
  const asked = Number(limit) || DEFAULT_READ_LINES;
  let lines;
  try {
    lines = leadingLines(file, first - 1 + asked).slice(first - 1);
  } catch {
    return null;
  }
  const fitting = fittingLines(lines, cap);
  if (fitting === null) return null;
  const advice = fitting === 0
    ? `line ${first} alone is over the cap, so grep the file or cut it with Bash head -c`
    : `Read again with offset ${first} and limit ${fitting}, then continue from the next offset, or grep the file`;
  return { deny: `exo result cap: this Read returns more than ${cap} bytes. ${advice}.` };
}

export function contextFields(decision) {
  if (!decision) return null;
  return decision.deny
    ? { permissionDecision: 'deny', permissionDecisionReason: decision.deny }
    : { additionalContext: decision.additionalContext };
}

function outputTokens(line) {
  const entry = parseLine(line);
  const output = entry?.type === 'assistant' ? entry.message?.usage?.output_tokens : 0;
  return Number.isFinite(output) ? output : 0;
}

function peakOf(file) {
  let peak = 0;
  let output = 0;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    peak = Math.max(peak, entryTokens(line) ?? 0);
    output += outputTokens(line);
  }
  return { peak, output };
}

function metaField(metaFile, field) {
  try {
    const value = JSON.parse(fs.readFileSync(metaFile, 'utf8'))[field];
    return typeof value === 'string' && value !== '' ? value : null;
  } catch {
    return null;
  }
}

const metaAgentType = (metaFile) => metaField(metaFile, 'agentType');

const agentType = (metaFile) => metaAgentType(metaFile) ?? 'subagent';

const withoutPrefix = (type) => type.replace(/^exo:/, '');

export function hookAgentType(hookInput) {
  if (!hookInput) return null;
  const declared = hookInput.agent_type;
  if (typeof declared === 'string' && declared !== '') return withoutPrefix(declared);
  if (!hookInput.agent_id) return null;
  const transcript = transcriptOf(hookInput);
  if (typeof transcript !== 'string' || !transcript.endsWith('.jsonl')) return null;
  const type = metaAgentType(transcript.replace(/\.jsonl$/, '.meta.json'));
  return type === null ? null : withoutPrefix(type);
}

export function contextPeaks({ folder, since }) {
  const rows = [];
  const add = ({ label, file, type, effort = null }) => {
    try {
      if (fs.statSync(file).mtimeMs < since) return;
      const { peak, output } = peakOf(file);
      if (peak > 0) rows.push({ label, agentType: type, peak, output, effort });
    } catch { }
  };
  let names;
  try {
    names = fs.readdirSync(folder);
  } catch {
    return rows;
  }
  for (const name of names.filter((entry) => entry.endsWith('.jsonl'))) {
    const id = name.slice(0, -'.jsonl'.length);
    add({ label: `session ${id}`, file: path.join(folder, name), type: 'session' });
    const subagents = path.join(folder, id, 'subagents');
    let agents = [];
    try { agents = fs.readdirSync(subagents); } catch { }
    for (const agent of agents.filter((entry) => /^agent-.*\.jsonl$/.test(entry))) {
      const agentId = agent.slice('agent-'.length, -'.jsonl'.length);
      const type = agentType(path.join(subagents, `agent-${agentId}.meta.json`));
      const effort = metaField(path.join(subagents, `agent-${agentId}.meta.json`), 'effort');
      add({ label: `${type} ${agentId} (session ${id})`, file: path.join(subagents, agent), type, effort });
    }
  }
  return rows.sort((a, b) => b.peak - a.peak);
}

export const U4_PEAK_CEILING = 90311;
export const U4_MIN_RUNS = 30;

function percentile(sorted, fraction) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

export function peakSummary(rows, target = agentContextTarget()) {
  const byType = new Map();
  for (const row of rows) byType.set(row.agentType, [...(byType.get(row.agentType) ?? []), row]);
  return [...byType].map(([type, group]) => {
    const peaks = group.map((row) => row.peak).sort((a, b) => a - b);
    const outputs = group.map((row) => row.output).sort((a, b) => a - b);
    return {
      agentType: type,
      n: group.length,
      peakP50: percentile(peaks, 0.5),
      peakP90: percentile(peaks, 0.9),
      outputP50: percentile(outputs, 0.5),
      overShare: group.filter((row) => row.peak >= target).length / group.length,
    };
  });
}

export function u4Verdict(rows) {
  const runs = rows.filter((row) => withoutPrefix(row.agentType) === 'orchestrator' && row.effort === 'high');
  if (runs.length < U4_MIN_RUNS) return `PENDING n=${runs.length} of ${U4_MIN_RUNS}`;
  const median = percentile(runs.map((row) => row.peak).sort((a, b) => a - b), 0.5);
  return `${median > U4_PEAK_CEILING ? 'DISCARD' : 'KEEP'} p50=${median} n=${runs.length}`;
}

export const savedOutputPrefix = (agentId) => `exo-bash-${agentId}-`;

export function removeSavedOutputs(agentId, directory = os.tmpdir()) {
  if (typeof agentId !== 'string' || agentId === '') return;
  const prefix = savedOutputPrefix(agentId);
  for (const name of fs.readdirSync(directory)) {
    if (name.startsWith(prefix) && name.endsWith('.log')) fs.rmSync(path.join(directory, name), { force: true });
  }
}
