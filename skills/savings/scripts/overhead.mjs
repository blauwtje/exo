// The overhead exo adds to a session, booked entry by entry while the ledger
// reads a transcript, as usage counts per transcript so each is priced at that
// transcript's own model. Exo text in context is written by the next API call
// and read by every later call in that transcript. An API call whose only tool
// calls load exo skills or re-issue a Read the read guard refused counts
// whole, and the tokens a refusal kept out of context come back as a credit.
// Exo's hook runs count their duration, and so does the time the API takes to
// process the exo text a call writes; the read guard's hook runs leave no
// transcript entry, so the guard times itself into the ledger.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from './ledger.mjs';
import { countsCost } from './pricing.mjs';
import { sumCounts, usageCounts } from './token-weights.mjs';

// A row booked under another version is read again from the start.
export const OVERHEAD_VERSION = 2;

const PLUGIN_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
// Measured by benchmarks/results/2026-09-11-calibration.md on Haiku 4.5: the
// 10,162 characters of exo text an exo cell adds made its first call write
// 2,513.7 ± 0.7 tokens more than a baseline cell's, and its first token came
// 92.5 ms later. File content withheld by the read guard is unmeasured at 4 bytes.
const CHARS_PER_TOKEN = 4.043;
const MS_PER_WRITTEN_TOKEN = 0.0368;
const BYTES_PER_TOKEN = 4;
const SKILL_PREFIX = 'exo:';
const LISTING_LINE_PREFIX = `- ${SKILL_PREFIX}`;
const SKILL_BODY_PREFIX = `Base directory for this skill: ${PLUGIN_ROOT}`;
const SESSION_HOOK_HEADING = '# Using exo';
const REFUSAL_PREFIX = 'exo read guard:';
const AGENT_NAME = /^[\w-]+$/;
const FRONTMATTER = /^---\n[\s\S]*?\n---\n/;

let hookCommandsCache = null;

function textTokens(text) {
  return text.length / CHARS_PER_TOKEN;
}

function emptyCounts() {
  return { input: 0, cacheRead: 0, cache5m: 0, cache1h: 0, output: 0 };
}

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

// A subagent's meta file names the agent type that ran in its transcript; an
// exo agent's body is that subagent's system prompt.
function agentPromptTokens(file) {
  const meta = readJson(file.replace(/\.jsonl$/, '.meta.json'), null);
  const agentType = meta?.agentType;
  if (typeof agentType !== 'string' || !agentType.startsWith(SKILL_PREFIX)) return 0;
  const name = agentType.slice(SKILL_PREFIX.length);
  if (!AGENT_NAME.test(name)) return 0;
  try {
    const agentFile = fs.readFileSync(path.join(PLUGIN_ROOT, 'agents', `${name}.md`), 'utf8');
    return textTokens(agentFile.replace(FRONTMATTER, ''));
  } catch {
    return 0;
  }
}

function messageText(message) {
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((block) => (typeof block.text === 'string' ? block.text : '')).join('');
}

function exoLineTokens(lines) {
  const exoLines = lines.filter((line) => typeof line === 'string' && line.startsWith(LISTING_LINE_PREFIX));
  return textTokens(exoLines.join('\n'));
}

// The exo share of an entry that puts text into context: the listings' exo
// lines, the session hook's context, or an exo skill body.
function injectedTokens(entry) {
  const attachment = entry.attachment;
  if (entry.type === 'attachment' && attachment?.type === 'skill_listing' && typeof attachment.content === 'string') {
    return exoLineTokens(attachment.content.split('\n'));
  }
  if (entry.type === 'attachment' && attachment?.type === 'agent_listing_delta' && Array.isArray(attachment.addedLines)) {
    return exoLineTokens(attachment.addedLines);
  }
  if (entry.type === 'attachment' && attachment?.type === 'hook_additional_context' && Array.isArray(attachment.content)) {
    const exoContext = attachment.content.filter((text) => typeof text === 'string' && text.includes(SESSION_HOOK_HEADING));
    return textTokens(exoContext.join(''));
  }
  if (entry.type === 'user' && entry.isMeta === true) {
    const text = messageText(entry.message);
    if (text.startsWith(SKILL_BODY_PREFIX)) return textTokens(text);
  }
  return 0;
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

// Text entered since the last call is written by the next call at the class
// that call wrote, or read when the call wrote less than the text, because a
// warm cache served it.
function enteredClass(usage, pendingTokens) {
  if (usage.cache1h + usage.cache5m < pendingTokens) return 'cacheRead';
  return usage.cache1h > 0 ? 'cache1h' : 'cache5m';
}

// A refusal's text enters context like exo text; the Read it refused is
// looked for in the next call.
function bookRefusals(overhead, transcript, entry, file) {
  for (const result of refusalResults(entry)) {
    if (overhead.refusals[result.tool_use_id] !== undefined) continue;
    transcript.pendingTokens += textTokens(result.content);
    overhead.refusals[result.tool_use_id] = { transcript: file, calls: 0, entered: null };
    transcript.refusals.push(result.tool_use_id);
    const filePath = transcript.reads[result.tool_use_id];
    if (filePath !== undefined) transcript.refused.push(filePath);
  }
}

// The first line of a call books its read of the exo text already in context
// and its write of the text entered since; every refusal still in context
// counts the call toward its credit.
function openCall(overhead, transcript, message) {
  const usage = usageCounts(message.usage);
  const entered = enteredClass(usage, transcript.pendingTokens);
  const booked = emptyCounts();
  booked.cacheRead += transcript.contextTokens;
  booked[entered] += transcript.pendingTokens;
  for (const key of Object.keys(booked)) transcript.counts[key] += booked[key];
  transcript.contextTokens += transcript.pendingTokens;
  transcript.pendingTokens = 0;
  for (const id of transcript.refusals) {
    const refusal = overhead.refusals[id];
    refusal.calls += 1;
    refusal.entered ??= entered;
  }
  if (typeof message.model === 'string') transcript.model = message.model;
  transcript.openCall = { id: message.id, start: transcript.lastTimestamp, booked, refused: transcript.refused, otherTool: false };
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
    if (loadsExoSkill || reissuesRead) overhead.calls[message.id] ??= { mixed: false, start: call.start, end: null, booked: call.booked };
  }
  const booking = overhead.calls[message.id];
  if (booking === undefined) return;
  booking.mixed = call.otherTool;
  booking.end = entry.timestamp ?? booking.end;
}

export function emptyOverhead() {
  return { version: OVERHEAD_VERSION, hookMs: 0, transcripts: {}, calls: {}, refusals: {} };
}

// A call is new when its id differs from the open call's, since one call's
// lines are consecutive; usageById cannot tell, because a re-read transcript
// finds every id there already.
export function bookOverhead(session, entry, file) {
  const overhead = session.overhead;
  if (overhead.transcripts[file] === undefined) {
    const agentTokens = agentPromptTokens(file);
    overhead.transcripts[file] = {
      model: null, agentTokens, contextTokens: 0, pendingTokens: agentTokens, counts: emptyCounts(),
      lastTimestamp: null, openCall: null, reads: {}, refused: [], refusals: []
    };
  }
  const transcript = overhead.transcripts[file];
  transcript.pendingTokens += injectedTokens(entry);
  bookRefusals(overhead, transcript, entry, file);
  // A compaction empties the injected text and ends every refusal's credit; the agent prompt stays.
  if (entry.type === 'system' && entry.subtype === 'compact_boundary') {
    transcript.contextTokens = transcript.agentTokens;
    transcript.pendingTokens = 0;
    transcript.refusals = [];
  }
  overhead.hookMs += exoHookMs(entry);
  const message = entry.message;
  if (entry.type === 'assistant' && message?.id && message.usage && isApiCall(message.usage)) {
    if (transcript.openCall?.id !== message.id) openCall(overhead, transcript, message);
    bookToolCalls(overhead, transcript, entry);
  }
  if (typeof entry.timestamp === 'string') transcript.lastTimestamp = entry.timestamp;
}

function processingMs(counts) {
  return (counts.cache5m + counts.cache1h) * MS_PER_WRITTEN_TOKEN;
}

function countsLess(usage, booked) {
  const counts = emptyCounts();
  for (const key of Object.keys(counts)) counts[key] = (usage[key] ?? 0) - (booked[key] ?? 0);
  return counts;
}

// Weighted tokens, cost and milliseconds, in the units of the session's own
// totals; cost is null when a model that booked tokens has no price.
export function overheadTotals(session) {
  const overhead = session.overhead?.version === OVERHEAD_VERSION ? session.overhead : emptyOverhead();
  const guard = session.guard ?? {};
  let time = overhead.hookMs + (guard.hookMs ?? 0);
  const priced = [];
  for (const transcript of Object.values(overhead.transcripts)) {
    priced.push({ counts: transcript.counts, model: transcript.model });
    time += processingMs(transcript.counts);
  }
  for (const [id, call] of Object.entries(overhead.calls)) {
    if (call.mixed) continue;
    // The call's read and write of the exo text are booked with its transcript already.
    const usage = session.usageById?.[id];
    if (usage) priced.push({ counts: countsLess(usage, call.booked), model: usage.model ?? session.model });
    if (call.start && call.end) time += Date.parse(call.end) - Date.parse(call.start);
  }
  for (const [id, refusal] of Object.entries(overhead.refusals)) {
    const withheld = guard.refusals?.[id]?.bytesWithheld;
    if (typeof withheld !== 'number' || refusal.calls === 0) continue;
    const tokens = withheld / BYTES_PER_TOKEN;
    const credit = emptyCounts();
    credit[refusal.entered] -= tokens;
    credit.cacheRead -= tokens * (refusal.calls - 1);
    priced.push({ counts: credit, model: overhead.transcripts[refusal.transcript]?.model ?? null });
    time += processingMs(credit);
  }
  let tokens = 0;
  let cost = 0;
  for (const { counts, model } of priced) {
    const weighted = sumCounts([counts]);
    tokens += weighted.weightedInput + weighted.output;
    const partCost = countsCost(counts, model);
    cost = cost === null || partCost === null ? null : cost + partCost;
  }
  return { tokens, cost, time };
}
