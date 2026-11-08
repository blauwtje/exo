import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { readJsonOrNull } from './basics.mjs';
import { denyReason } from './guard-rules.mjs';
import { AGENT_HARD_RATIO, softLimit, contextLimit, agentContextTarget, dispatchBytesPerToken, fetchTokens, searchLineBytes, toolSchemaBytes, resultCapBytes, orchestratorResultCapBytes } from './context-limits.mjs';

const TAIL_BYTES = 256 * 1024;

export function parseLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

export function usageTokens(entry) {
  const usage = entry?.type === 'assistant' ? entry.message?.usage : null;
  if (!usage) return null;
  const sum = (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
  return Number.isFinite(sum) && sum > 0 ? sum : null;
}

const entryTokens = (line) => usageTokens(parseLine(line));

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

export function transcriptOf(input) {
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

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);
const COORDINATOR_TYPES = new Set(['orchestrator', 'task-runner']);
const COORDINATION_TOOLS = new Set(['Agent', 'Task', 'SendMessage', 'TaskStop', 'Monitor']);
const INTAKE_TOOLS = /^(Read|Grep|Glob|WebFetch|WebSearch|Skill|Agent|Task|ToolSearch|NotebookEdit|mcp__.*)$/;
const CHECKPOINT = 'node ${CLAUDE_PLUGIN_ROOT}/skills/build/scripts/checkpoint.mjs';
const runsCheckpoint = (input) => input.tool_name === 'Bash' && /(?:^|[\s/])skills\/build\/scripts\/checkpoint\.mjs(?:\s|$)/.test(input.tool_input?.command ?? '');

export function agentHardLimit(target) {
  return Math.round(target * AGENT_HARD_RATIO);
}

const keepsCoordinating = (input) => COORDINATION_TOOLS.has(input.tool_name) && COORDINATOR_TYPES.has(hookAgentType(input));

function leadDecision(input, tokens) {
  const loopFile = process.env.EXO_RUN_HANDOFF ?? '';
  const hardLimit = contextLimit();
  const used = `Context use is ${Math.round(tokens / 1000)}k tokens.`;
  if (tokens >= hardLimit) {
    if (input.tool_name === 'Write' || runsCheckpoint(input)) return null;
    const task = (process.env.EXO_RUN_TASK ?? '').split('/').pop() || '<n>';
    return { deny: denyReason('context-lead', `${used} Over the ${hardLimit / 1000}k hard limit; the handoff file is ${loopFile} and the last line is \`Task ${task}: HANDOFF\``, { checkpoint: CHECKPOINT }) };
  }
  if (tokens < softLimit(hardLimit)) return null;
  return { additionalContext: `${used} Finish your current step, then land the task as soon as its proof passes; if you cannot, run \`${CHECKPOINT}\` before you write the handoff so the work survives a stop.` };
}

function agentDecision(input, tokens) {
  const target = agentContextTarget();
  const hard = agentHardLimit(target);
  const used = `Context use is ${Math.round(tokens / 1000)}k tokens.`;
  if (tokens >= hard) {
    if (WRITE_TOOLS.has(input.tool_name) || input.tool_name === 'TaskStop' || runsCheckpoint(input)) return null;
    firstWarning(input.agent_id, 1);
    return { deny: denyReason('context-hard', `${used} Over the ${hard / 1000}k hard limit`, { checkpoint: CHECKPOINT }) };
  }
  if (tokens >= target && INTAKE_TOOLS.test(input.tool_name ?? '') && !keepsCoordinating(input)) {
    firstWarning(input.agent_id, 1);
    return { deny: denyReason('context-target', `${used} Over the ${target / 1000}k target`) };
  }
  if (tokens < softLimit(target)) {
    fs.rmSync(levelFile(input.agent_id), { force: true });
    return null;
  }
  if (!firstWarning(input.agent_id, 1)) return null;
  return { additionalContext: `${used} exo context limit: at ${target / 1000}k new reads, searches, fetches, skills and agents are refused, at ${hard / 1000}k every tool except Write, Edit and \`${CHECKPOINT}\`. Finish the edit in hand, run \`${CHECKPOINT}\` so the work is committed, write the result file your brief names as a handover and return.` };
}

export function contextDecision(hookInput) {
  const input = hookInput ?? {};
  const isAgent = Boolean(input.agent_id);
  if (!isAgent && (process.env.EXO_RUN_HANDOFF ?? '') === '') return null;
  const tokens = contextTokens(transcriptOf(input));
  if (tokens === null) return null;
  return isAgent ? agentDecision(input, tokens) : leadDecision(input, tokens);
}

export function persistedReadDecision(hookInput) {
  const input = hookInput ?? {};
  if (input.agent_id || input.tool_name !== 'Read' || typeof input.transcript_path !== 'string') return null;
  const file = input.tool_input?.file_path;
  if (typeof file !== 'string' || input.tool_input.limit !== undefined) return null;
  const results = path.join(input.transcript_path.replace(/\.jsonl$/, ''), 'tool-results');
  if (path.dirname(path.resolve(file)) !== results) return null;
  return { deny: denyReason('persisted-read') };
}

export const CAPPED_TYPES = ['orchestrator', 'general-purpose', 'claude', 'review-branch', 'research-worker'];

const UNCAPPED_READ_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.ipynb']);
const DEFAULT_READ_LINES = 2000;
const READ_CHUNK_BYTES = 64 * 1024;

export function resultCapFor(hookInput) {
  const type = hookAgentType(hookInput);
  if (!CAPPED_TYPES.includes(type)) return null;
  return type === 'orchestrator' ? orchestratorResultCapBytes() : resultCapBytes();
}

const INTAKE_STEER = 'grep -n the file for what you need, then read only that line range';

export const CAPPED_MODES = new Set(['bypassPermissions', 'auto']);

const thousands = (tokens) => `${Math.round(tokens / 1000)}k`;

function roomDeny(id, brings, bytes, left) {
  return denyReason(id, `${brings} about ${thousands(bytes / dispatchBytesPerToken())} tokens and ${thousands(left)} are left of your ${thousands(agentContextTarget())} target`);
}

function tokensLeft(hookInput) {
  if (!hookInput?.agent_id) return null;
  const tokens = contextTokens(transcriptOf(hookInput));
  return tokens === null ? null : agentContextTarget() - tokens;
}

export function intakeBound(hookInput, roomFrom = Infinity) {
  const cap = resultCapFor(hookInput);
  const left = tokensLeft(hookInput);
  const room = left === null ? Infinity : Math.round(Math.max(left * dispatchBytesPerToken(), resultCapBytes()));
  if (room < Math.min(cap ?? Infinity, roomFrom)) return { bytes: room, left, room: true };
  return cap === null ? null : { bytes: cap, left, room: false };
}

export function bashIntakeBound(hookInput) {
  const target = agentContextTarget();
  return intakeBound(hookInput, (target - softLimit(target)) * dispatchBytesPerToken());
}

export function intakeCutLine(bound, log) {
  if (!bound.room) return `[output cut at ${bound.bytes} bytes; full log: ${log}]`;
  return `[output cut at ${bound.bytes} bytes, the room left of your context target; full log: ${log}; ${INTAKE_STEER} with sed -n]`;
}

function readCutNote(bound, first, fitting) {
  const shown = `lines ${first}-${first + fitting - 1}`;
  const rest = `continue from offset ${first + fitting}, or ${INTAKE_STEER} with offset and limit`;
  if (!bound.room) return `exo result cap: this Read was cut to ${shown} (${bound.bytes} bytes); ${rest}.`;
  return `exo intake bound: this Read was cut to ${shown} (${bound.bytes} bytes), the room left of your context target; ${rest}.`;
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
  const bound = intakeBound(input);
  if (bound === null || (bound.left !== null && bound.left <= 0)) return null;
  const cap = bound.bytes;
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
  if (fitting === 0) return { deny: denyReason('result-line', `line ${first} alone is over ${cap} bytes`) };
  const cut = { updatedInput: { ...input.tool_input, offset: first, limit: fitting }, additionalContext: readCutNote(bound, first, fitting) };
  return cut;
}

const GREP_DEFAULT_LINES = 250;
const TOOL_SEARCH_DEFAULT_RESULTS = 5;
const GLOB_RESULT_FILES = 100;

const LIMITED_SEARCHES = new Map([
  ['Grep', {
    field: 'head_limit',
    fallback: GREP_DEFAULT_LINES,
    itemBytes: () => searchLineBytes(),
    unit: 'lines',
    next: (toolInput, shown) => `continue with offset ${(Number(toolInput.offset) || 0) + shown}`,
    narrow: 'narrow the pattern, path or glob'
  }],
  ['ToolSearch', {
    field: 'max_results',
    fallback: TOOL_SEARCH_DEFAULT_RESULTS,
    itemBytes: () => toolSchemaBytes(),
    unit: 'tools',
    skips: (toolInput) => /^select:/.test(toolInput.query ?? ''),
    narrow: 'load a tool you know by name with select:<name>'
  }]
]);

const FIXED_SEARCHES = new Map([
  ['Glob', { bytes: () => GLOB_RESULT_FILES * searchLineBytes(), row: 'intake-glob' }],
  ['WebSearch', { bytes: () => fetchTokens() * dispatchBytesPerToken(), row: 'intake-websearch' }]
]);

const boundLabel = (bound) => (bound.room ? 'exo intake bound' : 'exo result cap');
const boundRoom = (bound) => (bound.room ? ', the room left of your context target' : '');

function searchCut(input, bound, rule, fitting) {
  const toolInput = input.tool_input ?? {};
  const rest = [rule.next?.(toolInput, fitting), rule.narrow].filter(Boolean).join(', or ');
  return {
    updatedInput: { ...toolInput, [rule.field]: fitting },
    additionalContext: `${boundLabel(bound)}: this ${input.tool_name} was cut to ${fitting} ${rule.unit} (about ${bound.bytes} bytes)${boundRoom(bound)}; ${rest}.`
  };
}

function limitedSearch(input, bound, rule) {
  const toolInput = input.tool_input ?? {};
  if (rule.skips?.(toolInput)) return null;
  const asked = Number(toolInput[rule.field] ?? rule.fallback);
  const fitting = Math.max(1, Math.floor(bound.bytes / rule.itemBytes()));
  if (asked > 0 && asked <= fitting) return null;
  return searchCut(input, bound, rule, fitting);
}

function fixedSearch(input, bound, rule) {
  const bytes = rule.bytes();
  if (!bound.room || bytes <= bound.bytes) return null;
  return { deny: roomDeny(rule.row, `a ${input.tool_name} can bring`, bytes, bound.left) };
}

export function searchCapDecision(hookInput) {
  const input = hookInput ?? {};
  const limited = LIMITED_SEARCHES.get(input.tool_name);
  const fixed = FIXED_SEARCHES.get(input.tool_name);
  if (!limited && !fixed) return null;
  const bound = intakeBound(input);
  if (bound === null || (bound.left !== null && bound.left <= 0)) return null;
  return limited ? limitedSearch(input, bound, limited) : fixedSearch(input, bound, fixed);
}

export function contextFields(decision) {
  if (!decision) return null;
  if (decision.deny) return { permissionDecision: 'deny', permissionDecisionReason: decision.deny };
  if (!decision.updatedInput) return { additionalContext: decision.additionalContext };
  return { updatedInput: decision.updatedInput, additionalContext: decision.additionalContext };
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
  const value = readJsonOrNull(metaFile)?.[field];
  return typeof value === 'string' && value !== '' ? value : null;
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
