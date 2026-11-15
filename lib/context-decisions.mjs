import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { readJsonOrNull, parseLine, tmpStateFile } from './basics.mjs';
import { denyReason } from './guard-rules.mjs';
import { refuseFields, ruleDeny, ruleNote } from './hook-refusal.mjs';
import { contractRow } from '../harnesses/coordination-contract.mjs';
import { transcriptOf, handoverStep } from './live-shells.mjs';
import { AGENT_HARD_RATIO, softLimit, contextLimit, agentContextTarget, dispatchBytesPerToken } from './context-limits.mjs';

const TAIL_BYTES = 256 * 1024;

function usageTokens(entry) {
  const usage = entry?.type === 'assistant' ? entry.message?.usage : null;
  if (!usage) return null;
  const sum = (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
  return Number.isFinite(sum) && sum > 0 ? sum : null;
}

const entryTokens = (line) => usageTokens(parseLine(line));

function tailLines(fd) {
  const { size } = fs.fstatSync(fd);
  const start = Math.max(0, size - TAIL_BYTES);
  const buffer = Buffer.alloc(size - start);
  fs.readSync(fd, buffer, 0, buffer.length, start);
  const lines = buffer.toString('utf8').split('\n');
  if (start > 0) lines.shift();
  return lines;
}

function lastUsageTokens(lines) {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const tokens = entryTokens(lines[index]);
    if (tokens !== null) return tokens;
  }
  return null;
}

export function contextTokens(transcriptPath) {
  if (typeof transcriptPath !== 'string' || transcriptPath === '') return null;
  let fd;
  try {
    fd = fs.openSync(transcriptPath, 'r');
    return lastUsageTokens(tailLines(fd));
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function firstWarning(sessionId, level) {
  try {
    const file = tmpStateFile('context', sessionId);
    if (level <= (Number(readJsonOrNull(file)) || 0)) return false;
    fs.writeFileSync(file, String(level));
    return true;
  } catch {
    return true;
  }
}

const COORDINATOR_TYPES = new Set(['orchestrator']);
const COORDINATION_TOOLS = new Set(['Agent', 'Task', 'SendMessage', 'TaskStop', 'Monitor']);
const INTAKE_TOOLS = /^(Read|Grep|Glob|WebFetch|WebSearch|Skill|Agent|Task|ToolSearch|NotebookEdit|mcp__.*)$/;
const CHECKPOINT = 'node ${CLAUDE_PLUGIN_ROOT}/skills/build/scripts/checkpoint.mjs';
const runsCheckpoint = (input) => input.tool_name === 'Bash' && /(?:^|[\s/])skills\/build\/scripts\/checkpoint\.mjs(?:\s|$)/.test(input.tool_input?.command ?? '');

function agentHardLimit(target) {
  return Math.round(target * AGENT_HARD_RATIO);
}

function callerRole(hookInput) {
  if (!hookInput.agent_id) return 'main';
  const type = hookAgentType(hookInput);
  if (type === null) return 'fork-coordinator';
  return COORDINATOR_TYPES.has(type) ? 'subagent-coordinator' : 'worker';
}

export function roleFields(hookInput) {
  if (hookInput.tool_name !== 'Agent') return null;
  const role = callerRole(hookInput);
  if (contractRow('claude', role).mayDispatch) return null;
  return refuseFields('role-no-dispatch', denyReason('role-no-dispatch', `the ${role} row has mayDispatch false`), hookInput);
}

const usedNote = (tokens) => `Context use is ${thousands(tokens)} tokens.`;

const keepsCoordinating = (input) => COORDINATION_TOOLS.has(input.tool_name) && callerRole(input) === 'subagent-coordinator';

function leadDecision(input, tokens) {
  const loopFile = process.env.EXO_RUN_HANDOFF ?? '';
  const hardLimit = contextLimit();
  const used = usedNote(tokens);
  if (tokens >= hardLimit) {
    if (input.tool_name === 'Write' || runsCheckpoint(input)) return null;
    const task = (process.env.EXO_RUN_TASK ?? '').split('/').pop() || '<n>';
    return ruleDeny('context-lead', `${used} Over the ${hardLimit / 1000}k hard limit; the handoff file is ${loopFile} and the last line is \`Task ${task}: HANDOFF\``, { checkpoint: CHECKPOINT });
  }
  if (tokens < softLimit(hardLimit)) return null;
  return { additionalContext: `${used} Finish your current step, then land the task as soon as its proof passes; if you cannot, run \`${CHECKPOINT}\` before you write the handoff so the work survives a stop.` };
}

function agentDecision(input, tokens) {
  const target = agentContextTarget();
  const hard = agentHardLimit(target);
  const used = usedNote(tokens);
  const refusesIntake = INTAKE_TOOLS.test(input.tool_name ?? '') && !keepsCoordinating(input);
  if (tokens >= hard) {
    if (runsCheckpoint(input)) return null;
    const refused = refusesIntake ? `; new reads, skills and agents stay refused over the ${target / 1000}k target` : '';
    return ruleNote('context-hard', `${used} Over the ${hard / 1000}k hard limit${refused}`, { checkpoint: CHECKPOINT, handover: handoverStep(input) });
  }
  if (tokens >= target && refusesIntake) {
    firstWarning(input.agent_id, 1);
    return ruleDeny('context-target', `${used} Over the ${target / 1000}k target`, { handover: handoverStep(input) });
  }
  if (tokens < softLimit(target)) {
    fs.rmSync(tmpStateFile('context', input.agent_id), { force: true });
    return null;
  }
  if (!firstWarning(input.agent_id, 1)) return null;
  return { additionalContext: `${used} exo context limit: at ${target / 1000}k new reads, skills and agents are warned; past ${hard / 1000}k the same calls stay warned and every call tells you to hand over now. Finish the edit in hand, run \`${CHECKPOINT}\` so the work is committed, ${handoverStep(input)}.` };
}

export function contextDecision(hookInput) {
  const input = hookInput ?? {};
  const isAgent = Boolean(input.agent_id);
  if (!isAgent && (process.env.EXO_RUN_HANDOFF ?? '') === '') return null;
  const tokens = contextTokens(transcriptOf(input));
  if (tokens === null) return null;
  return isAgent ? agentDecision(input, tokens) : leadDecision(input, tokens);
}

const UNCAPPED_READ_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.ipynb']);
const DEFAULT_READ_LINES = 2000;
const READ_CHUNK_BYTES = 64 * 1024;

const INTAKE_STEER = 'grep -n the file for what you need, then read only that line range';

const thousands = (tokens) => `${Math.round(tokens / 1000)}k`;

function tokensLeft(hookInput) {
  if (!hookInput?.agent_id) return null;
  const tokens = contextTokens(transcriptOf(hookInput));
  return tokens === null ? null : agentContextTarget() - tokens;
}

function intakeBound(hookInput, roomFrom = Infinity) {
  const left = tokensLeft(hookInput);
  if (left === null || left <= 0) return null;
  const bytes = Math.round(left * dispatchBytesPerToken());
  return bytes < roomFrom ? { bytes, left } : null;
}

function readCutNote(bound, first, fitting) {
  const shown = `lines ${first}-${first + fitting - 1}`;
  const rest = `continue from offset ${first + fitting}, or ${INTAKE_STEER} with offset and limit`;
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

const isResultFile = (file) => file.endsWith('.md') && file.includes(`${path.sep}.exo${path.sep}`);

function requestedLines(file, first, asked) {
  try {
    return leadingLines(file, first - 1 + asked).slice(first - 1);
  } catch {
    return null;
  }
}

export function readCapDecision(hookInput) {
  const input = hookInput ?? {};
  const { file_path: file, offset, limit, pages } = input.tool_input ?? {};
  if (input.tool_name !== 'Read' || typeof file !== 'string' || pages !== undefined) return null;
  if (UNCAPPED_READ_EXTENSIONS.has(path.extname(file).toLowerCase())) return null;
  if (isResultFile(file) && callerRole(input) === 'subagent-coordinator') return null;
  const bound = intakeBound(input);
  if (bound === null) return null;
  const first = Math.max(1, Number(offset) || 1);
  const asked = Number(limit) || DEFAULT_READ_LINES;
  const lines = requestedLines(file, first, asked);
  if (lines === null) return null;
  const fitting = fittingLines(lines, bound.bytes);
  if (fitting === null) return null;
  if (fitting === 0) return ruleDeny('result-line', `line ${first} alone is over ${bound.bytes} bytes`);
  return { updatedInput: { ...input.tool_input, offset: first, limit: fitting }, additionalContext: readCutNote(bound, first, fitting) };
}

export function contextFields(decision, hookInput) {
  if (!decision) return null;
  if (decision.deny) return refuseFields(decision.rule, decision.deny, hookInput);
  if (decision.note) return refuseFields(decision.rule, decision.note, hookInput);
  if (!decision.updatedInput) return { additionalContext: decision.additionalContext };
  return { updatedInput: decision.updatedInput, additionalContext: decision.additionalContext };
}

function metaAgentType(metaFile) {
  const value = readJsonOrNull(metaFile)?.agentType;
  return typeof value === 'string' && value !== '' ? value : null;
}

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
