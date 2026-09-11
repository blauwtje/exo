// The overhead exo adds to a session, booked entry by entry while the ledger
// reads a transcript. Exo text in context is weighted once as a cache write
// when it enters and as a cache read on every later API call in that
// transcript; an API call whose only tool calls load exo skills counts whole;
// exo's own hook runs count their duration. The read guard's hook runs leave
// no transcript entry, so their time is not booked.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from './ledger.mjs';
import { CACHE_1H_RATE, CACHE_READ_RATE, sumCounts } from './token-weights.mjs';

const PLUGIN_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CHARS_PER_TOKEN = 4;
const SKILL_PREFIX = 'exo:';
const LISTING_LINE_PREFIX = `- ${SKILL_PREFIX}`;
const SKILL_BODY_PREFIX = `Base directory for this skill: ${PLUGIN_ROOT}`;
const SESSION_HOOK_HEADING = '# Using exo';

let footprintCache = null;

function textTokens(text) {
  return text.length / CHARS_PER_TOKEN;
}

// What the plugin ships, read once per process: the hook commands exactly as
// hooks.json names them, which the transcript repeats, and the agent
// descriptions the main context lists on every call.
function pluginFootprint() {
  if (footprintCache !== null) return footprintCache;
  const hookCommands = new Set();
  const config = readJson(path.join(PLUGIN_ROOT, 'hooks', 'hooks.json'), { hooks: {} });
  for (const groups of Object.values(config.hooks)) {
    for (const group of groups) {
      for (const hook of group.hooks) hookCommands.add(hook.command);
    }
  }
  const agentsDirectory = path.join(PLUGIN_ROOT, 'agents');
  const agentFiles = fs.existsSync(agentsDirectory) ? fs.readdirSync(agentsDirectory) : [];
  let agentTokens = 0;
  for (const name of agentFiles.filter((file) => file.endsWith('.md'))) {
    const agentFile = fs.readFileSync(path.join(agentsDirectory, name), 'utf8');
    const description = agentFile.match(/^description: (.*)$/m);
    if (description) agentTokens += textTokens(description[1]);
  }
  footprintCache = { hookCommands, agentTokens };
  return footprintCache;
}

function messageText(message) {
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((block) => (typeof block.text === 'string' ? block.text : '')).join('');
}

// The exo share of an entry that puts text into context: the listing's exo
// lines, the session hook's context, or an exo skill body.
function injectedTokens(entry) {
  const attachment = entry.attachment;
  if (entry.type === 'attachment' && attachment?.type === 'skill_listing' && typeof attachment.content === 'string') {
    const exoLines = attachment.content.split('\n').filter((line) => line.startsWith(LISTING_LINE_PREFIX));
    return textTokens(exoLines.join('\n'));
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

function exoHookMs(entry, hookCommands) {
  const attachment = entry.attachment;
  if (entry.type === 'attachment' && attachment?.type === 'hook_success' && hookCommands.has(attachment.command)) {
    return attachment.durationMs ?? 0;
  }
  if (entry.type !== 'system' || entry.subtype !== 'stop_hook_summary' || !Array.isArray(entry.hookInfos)) return 0;
  const exoHooks = entry.hookInfos.filter((info) => hookCommands.has(info.command));
  return exoHooks.reduce((sum, info) => sum + (info.durationMs ?? 0), 0);
}

// One response streams as one line per content block, so a call is known to
// load only exo skills once its last block is read; a call with any other
// tool call does work of its own and is not overhead.
function bookSkillCall(overhead, transcript, entry) {
  const message = entry.message;
  if (transcript.openCall?.id !== message.id) {
    transcript.openCall = { id: message.id, otherTool: false, start: transcript.lastTimestamp };
  }
  const openCall = transcript.openCall;
  const toolCalls = Array.isArray(message.content) ? message.content.filter((block) => block.type === 'tool_use') : [];
  for (const toolCall of toolCalls) {
    const skill = toolCall.input?.skill;
    const loadsExoSkill = toolCall.name === 'Skill' && typeof skill === 'string' && skill.startsWith(SKILL_PREFIX);
    if (!loadsExoSkill) openCall.otherTool = true;
    // The call's read of the exo text is already booked; its whole usage replaces that read.
    const contextRead = transcript.contextTokens * CACHE_READ_RATE;
    if (loadsExoSkill) overhead.skillCalls[message.id] ??= { mixed: false, start: openCall.start, end: null, contextRead };
  }
  const skillCall = overhead.skillCalls[message.id];
  if (skillCall === undefined) return;
  skillCall.mixed = openCall.otherTool;
  skillCall.end = entry.timestamp ?? skillCall.end;
}

export function emptyOverhead() {
  return { tokens: 0, hookMs: 0, transcripts: {}, skillCalls: {} };
}

// A call is new when its id differs from the open call's, since one call's
// lines are consecutive; usageById cannot tell, because a re-read transcript
// finds every id there already. Only the main transcript lists the agents; a
// compaction empties the injected text, never that list.
export function bookOverhead(session, entry, file, mainTranscript) {
  const overhead = session.overhead;
  const footprint = pluginFootprint();
  const baseTokens = file === mainTranscript ? footprint.agentTokens : 0;
  if (overhead.transcripts[file] === undefined) {
    overhead.transcripts[file] = { contextTokens: baseTokens, lastTimestamp: null, openCall: null };
    overhead.tokens += baseTokens * CACHE_1H_RATE;
  }
  const transcript = overhead.transcripts[file];
  const injected = injectedTokens(entry);
  overhead.tokens += injected * CACHE_1H_RATE;
  transcript.contextTokens += injected;
  if (entry.type === 'system' && entry.subtype === 'compact_boundary') transcript.contextTokens = baseTokens;
  overhead.hookMs += exoHookMs(entry, footprint.hookCommands);
  const message = entry.message;
  if (entry.type === 'assistant' && message?.id && message.usage) {
    if (transcript.openCall?.id !== message.id) overhead.tokens += transcript.contextTokens * CACHE_READ_RATE;
    bookSkillCall(overhead, transcript, entry);
  }
  if (typeof entry.timestamp === 'string') transcript.lastTimestamp = entry.timestamp;
}

// Weighted tokens and milliseconds, in the units of the session's own totals.
export function overheadTotals(session) {
  const overhead = session.overhead;
  if (!overhead) return { tokens: 0, time: 0 };
  let tokens = overhead.tokens;
  let time = overhead.hookMs;
  for (const [id, skillCall] of Object.entries(overhead.skillCalls)) {
    if (skillCall.mixed) continue;
    const usage = session.usageById?.[id];
    if (usage) {
      const counts = sumCounts([usage]);
      tokens += counts.weightedInput + counts.output - (skillCall.contextRead ?? 0);
    }
    if (skillCall.start && skillCall.end) time += Date.parse(skillCall.end) - Date.parse(skillCall.start);
  }
  return { tokens, time };
}
