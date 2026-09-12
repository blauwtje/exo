// What exo itself cost a session, booked entry by entry while the ledger reads
// a transcript. An API call whose only tool calls load exo skills or re-issue a
// Read the read guard refused is exo's own work and counts whole, at the usage
// the API reported for it and the wall time between the entry before it and its
// last line; exo's hook runs count the duration the harness records for them.
// No figure here is derived from a ratio or from a character count.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from './ledger.mjs';
import { countsCost } from './pricing.mjs';
import { sumCounts, usageCounts } from './token-weights.mjs';

// A row booked under another version is read again from the start.
export const OVERHEAD_VERSION = 3;

const PLUGIN_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SKILL_PREFIX = 'exo:';
const REFUSAL_PREFIX = 'exo read guard:';

let hookCommandsCache = null;

// The hook commands exactly as hooks.json names them, which the transcript
// repeats; read once per process.
function hookCommands() {
  if (hookCommandsCache !== null) return hookCommandsCache;
  hookCommandsCache = new Set();
  const config = readJson(path.join(PLUGIN_ROOT, 'hooks', 'hooks.json'), { hooks: {} });
  for (const groups of Object.values(config.hooks)) {
    for (const group of groups) {
      for (const hook of group.hooks) hookCommandsCache.add(hook.command);
    }
  }
  return hookCommandsCache;
}

function refusalResults(entry) {
  const content = entry.message?.content;
  if (entry.type !== 'user' || !Array.isArray(content)) return [];
  return content.filter((block) => block.type === 'tool_result' && block.is_error === true
    && typeof block.content === 'string' && block.content.startsWith(REFUSAL_PREFIX));
}

function exoHookMs(entry) {
  const attachment = entry.attachment;
  if (entry.type === 'attachment' && attachment?.type === 'hook_success' && hookCommands().has(attachment.command)) {
    return attachment.durationMs ?? 0;
  }
  if (entry.type !== 'system' || entry.subtype !== 'stop_hook_summary' || !Array.isArray(entry.hookInfos)) return 0;
  const exoHooks = entry.hookInfos.filter((info) => hookCommands().has(info.command));
  return exoHooks.reduce((sum, info) => sum + (info.durationMs ?? 0), 0);
}

// The harness writes placeholder messages without any token count; they are no API call.
function isApiCall(usage) {
  return sumCounts([usageCounts(usage)]).raw > 0;
}

// The Read the guard refused is looked for in the next call: re-issuing it is
// exo's own work, not the session's.
function bookRefusals(transcript, entry) {
  for (const result of refusalResults(entry)) {
    const filePath = transcript.reads[result.tool_use_id];
    if (filePath !== undefined) transcript.refused.push(filePath);
  }
}

// A call starts at the entry before it, which is when the harness sent it.
function openCall(transcript, message) {
  transcript.openCall = { id: message.id, start: transcript.lastTimestamp, refused: transcript.refused, otherTool: false };
  transcript.refused = [];
  transcript.reads = {};
}

// A call counts whole when every tool call in it loads an exo skill or
// re-issues a Read the guard refused just before; any other tool call is work
// of its own. One response streams as one line per content block, so each
// line may add tool calls.
function bookToolCalls(overhead, transcript, entry) {
  const message = entry.message;
  const call = transcript.openCall;
  const toolCalls = Array.isArray(message.content) ? message.content.filter((block) => block.type === 'tool_use') : [];
  for (const toolCall of toolCalls) {
    const filePath = toolCall.input?.file_path;
    if (toolCall.name === 'Read' && typeof filePath === 'string') transcript.reads[toolCall.id] = filePath;
    const skill = toolCall.input?.skill;
    const loadsExoSkill = toolCall.name === 'Skill' && typeof skill === 'string' && skill.startsWith(SKILL_PREFIX);
    const reissuesRead = toolCall.name === 'Read' && call.refused.includes(filePath);
    if (!loadsExoSkill && !reissuesRead) call.otherTool = true;
    if (loadsExoSkill || reissuesRead) overhead.calls[message.id] ??= { mixed: false, start: call.start, end: null };
  }
  const booking = overhead.calls[message.id];
  if (booking === undefined) return;
  booking.mixed = call.otherTool;
  booking.end = entry.timestamp ?? booking.end;
}

export function emptyOverhead() {
  return { version: OVERHEAD_VERSION, hookMs: 0, transcripts: {}, calls: {} };
}

// A call is new when its id differs from the open call's, since one call's
// lines are consecutive; usageById cannot tell, because a re-read transcript
// finds every id there already.
export function bookOverhead(session, entry, file) {
  const overhead = session.overhead;
  if (overhead.transcripts[file] === undefined) {
    overhead.transcripts[file] = { lastTimestamp: null, openCall: null, reads: {}, refused: [] };
  }
  const transcript = overhead.transcripts[file];
  bookRefusals(transcript, entry);
  overhead.hookMs += exoHookMs(entry);
  const message = entry.message;
  if (entry.type === 'assistant' && message?.id && message.usage && isApiCall(message.usage)) {
    if (transcript.openCall?.id !== message.id) openCall(transcript, message);
    bookToolCalls(overhead, transcript, entry);
  }
  if (typeof entry.timestamp === 'string') transcript.lastTimestamp = entry.timestamp;
}

// What exo cost this session and what its read guard kept out of context:
// weighted tokens and price for the calls that were exo's alone, their wall
// time plus exo's hook runs, and the guard's refusals with the bytes they
// withheld. costKnown is false when a call's model is missing from prices.mjs,
// because an unknown price is never guessed.
export function measuredTotals(session) {
  const overhead = session.overhead?.version === OVERHEAD_VERSION ? session.overhead : emptyOverhead();
  const guard = session.guard ?? {};
  const totals = {
    calls: 0,
    tokens: 0,
    cost: 0,
    costKnown: true,
    time: overhead.hookMs + (guard.hookMs ?? 0),
    refusals: 0,
    bytesWithheld: 0
  };
  for (const [id, call] of Object.entries(overhead.calls)) {
    if (call.mixed) continue;
    const usage = session.usageById?.[id];
    if (usage !== undefined) {
      const weighted = sumCounts([usage]);
      totals.calls += 1;
      totals.tokens += weighted.weightedInput + weighted.output;
      const callCost = countsCost(usage, usage.model ?? session.model);
      if (callCost === null) totals.costKnown = false;
      else totals.cost += callCost;
    }
    if (call.start !== null && call.end !== null) totals.time += Date.parse(call.end) - Date.parse(call.start);
  }
  for (const refusal of Object.values(guard.refusals ?? {})) {
    totals.refusals += 1;
    totals.bytesWithheld += refusal.bytesWithheld ?? 0;
  }
  return totals;
}
