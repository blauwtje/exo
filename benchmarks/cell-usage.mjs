// benchmarks/cell-usage.mjs
// What a cell's session spent across every transcript, the main thread and
// each subagent, saved as <cell>/usage.json. The result JSON's usage block
// holds the main thread only, so a subagent on another model would drop out
// of the tokens metric; score.mjs reads this file and never a transcript.

import fs from 'node:fs';
import path from 'node:path';
import { configDirectory } from '#config-directory';
import { sumCounts, usageCounts } from '#token-weights';
import { readJson } from './basics.mjs';
import { countsCost } from './pricing.mjs';

const SESSION_ID = /^[\w-]+$/;
// The session hook's context holds its settings line while exo is loaded, after
// any handoff or memory pointer; an older transcript holds the heading instead.
const EXO_MARKERS = ['exo settings:', '# Using exo'];

// The harness keeps a transcript at <config dir>/projects/<project slug>/<session id>.jsonl.
export function findTranscript(sessionId) {
  if (!SESSION_ID.test(sessionId)) return null;
  const projects = path.join(configDirectory(), 'projects');
  let slugs;
  try {
    slugs = fs.readdirSync(projects);
  } catch {
    return null;
  }
  for (const slug of slugs) {
    const candidate = path.join(projects, slug, `${sessionId}.jsonl`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function transcriptFiles(transcriptPath) {
  const files = [{ file: transcriptPath, role: 'main' }];
  const delegatesDirectory = path.join(transcriptPath.replace(/\.jsonl$/, ''), 'subagents');
  if (!fs.existsSync(delegatesDirectory)) return files;
  for (const name of fs.readdirSync(delegatesDirectory).sort()) {
    if (!name.endsWith('.jsonl')) continue;
    const metaFile = path.join(delegatesDirectory, name.replace(/\.jsonl$/, '.meta.json'));
    const meta = fs.existsSync(metaFile) ? readJson(metaFile) : {};
    files.push({ file: path.join(delegatesDirectory, name), role: meta.agentType ?? 'unknown' });
  }
  return files;
}

function parsedLines(file) {
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

// The usage per API call of a transcript and its subagents, keyed by message
// id with the model beside the counts; the format is internal to the harness,
// so a line that does not parse is skipped. One response is one line per
// content block and a streaming response repeats its id with a growing output
// count: the last line per id wins. Null when the transcript is missing.
export function transcriptCalls(transcriptPath) {
  if (!fs.existsSync(transcriptPath)) return null;
  const calls = {};
  for (const { file, role } of transcriptFiles(transcriptPath)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.includes('"assistant"')) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const message = entry?.message;
      if (entry?.type !== 'assistant' || !message?.id || !message.usage) continue;
      calls[message.id] = { ...usageCounts(message.usage), model: message.model, role };
    }
  }
  return calls;
}

function subagentTypes(transcriptPath) {
  const subagents = path.join(transcriptPath.replace(/\.jsonl$/, ''), 'subagents');
  if (!fs.existsSync(subagents)) return [];
  const types = [];
  for (const name of fs.readdirSync(subagents).sort()) {
    if (!name.endsWith('.meta.json')) continue;
    const meta = readJson(path.join(subagents, name));
    types.push(meta.agentType ?? 'unknown');
  }
  return types;
}

const CHARACTERS_PER_TOKEN = 4;

function resultCharacters(content) {
  if (typeof content === 'string') return content.length;
  if (!Array.isArray(content)) return 0;
  return content.reduce((total, part) => total + (typeof part?.text === 'string' ? part.text.length : 0), 0);
}

function readResultCharacters(file) {
  const readIds = new Set();
  let characters = 0;
  const blocks = parsedLines(file).flatMap((entry) => (Array.isArray(entry?.message?.content) ? entry.message.content : []));
  for (const block of blocks) {
    if (block?.type === 'tool_use' && block.name === 'Read') readIds.add(block.id);
    if (block?.type === 'tool_result' && readIds.has(block.tool_use_id)) characters += resultCharacters(block.content);
  }
  return characters;
}

function readResultTokens(transcriptPath) {
  const tokens = {};
  for (const { file, role } of transcriptFiles(transcriptPath)) {
    tokens[role] = (tokens[role] ?? 0) + Math.ceil(readResultCharacters(file) / CHARACTERS_PER_TOKEN);
  }
  return tokens;
}

function roleCost(calls) {
  let total = 0;
  for (const [model, counts] of Object.entries(countsByModel(calls))) {
    const cost = countsCost(counts, model);
    if (cost === null) return null;
    total += cost;
  }
  return total;
}

function byRoleUsage(calls, readTokens) {
  const grouped = {};
  for (const call of Object.values(calls)) {
    grouped[call.role] = grouped[call.role] ?? [];
    grouped[call.role].push(call);
  }
  const byRole = {};
  for (const role of new Set([...Object.keys(grouped), ...Object.keys(readTokens)])) {
    const roleCalls = grouped[role] ?? [];
    byRole[role] = {
      counts: sumCounts(roleCalls),
      costUsd: roleCost(roleCalls),
      estimatedReadTokens: readTokens[role] ?? 0
    };
  }
  return byRole;
}

// Whether the session hook handed the model exo's rules in this session.
export function exoLoaded(sessionId) {
  const transcriptPath = findTranscript(sessionId);
  if (transcriptPath === null) return null;
  for (const line of fs.readFileSync(transcriptPath, 'utf8').split('\n')) {
    if (!line.includes('hook_additional_context')) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const content = entry?.attachment?.content;
    if (!Array.isArray(content)) continue;
    if (content.some((text) => typeof text === 'string' && EXO_MARKERS.some((marker) => text.includes(marker)))) return true;
  }
  return false;
}

function countsByModel(calls) {
  const grouped = {};
  for (const counts of Object.values(calls)) {
    const model = counts.model ?? 'unknown';
    grouped[model] = grouped[model] ?? [];
    grouped[model].push(counts);
  }
  return Object.fromEntries(Object.entries(grouped).map(([model, list]) => [model, sumCounts(list)]));
}

// The largest context one main-thread message read or wrote: input plus cache
// read plus both cache writes, output left out. Subagents sit in their own
// files, so the main transcript alone is the lead.
function leadPeakTokens(transcriptPath) {
  let peak = 0;
  for (const line of fs.readFileSync(transcriptPath, 'utf8').split('\n')) {
    if (!line.includes('"assistant"')) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry?.type !== 'assistant' || !entry.message?.usage) continue;
    const counts = usageCounts(entry.message.usage);
    peak = Math.max(peak, counts.input + counts.cacheRead + counts.cache5m + counts.cache1h);
  }
  return peak;
}

// Returns the written usage, or null when the session's transcript is gone.
export function writeCellUsage(cellDirectory, sessionId) {
  const transcript = findTranscript(sessionId);
  if (transcript === null) return null;
  const calls = transcriptCalls(transcript);
  // sweep.mjs reads the transcript back for its flow checks, so its path rides along.
  const usage = {
    transcript,
    counts: sumCounts(Object.values(calls)),
    byModel: countsByModel(calls),
    byRole: byRoleUsage(calls, readResultTokens(transcript)),
    subagents: subagentTypes(transcript),
    leadPeakTokens: leadPeakTokens(transcript)
  };
  fs.writeFileSync(path.join(cellDirectory, 'usage.json'), `${JSON.stringify(usage, null, 2)}\n`);
  return usage;
}

// A cell killed on timeout can cut the ledger's last line short; that line is
// dropped so the complete lines still count. A broken line before it still throws.
function readLedger(ledgerFile) {
  const lines = fs.readFileSync(ledgerFile, 'utf8').split('\n').filter((line) => line.trim() !== '');
  return lines.flatMap((line, index) => {
    try {
      return [JSON.parse(line)];
    } catch (error) {
      if (index === lines.length - 1) return [];
      throw error;
    }
  });
}

// A run arm has no single session: every id in the run's sessions.jsonl counts,
// each message once, and costUsd sums the ledger. `missingHooks` lists the build
// sessions in which no exo hook ran, `missingTranscripts` the ledger sessions
// whose transcript is gone; `counts` is then null, not a low sum. Null when the
// ledger is missing.
export function writeRunUsage(cellDirectory, ledgerFile) {
  if (ledgerFile === null || !fs.existsSync(ledgerFile)) return null;
  const sessions = readLedger(ledgerFile);
  const calls = {};
  const subagents = [];
  const readTokens = {};
  let missingTranscripts = 0;
  for (const { sessionId } of sessions) {
    const transcript = typeof sessionId === 'string' ? findTranscript(sessionId) : null;
    if (transcript === null) {
      missingTranscripts += 1;
      continue;
    }
    Object.assign(calls, transcriptCalls(transcript));
    subagents.push(...subagentTypes(transcript));
    for (const [role, tokens] of Object.entries(readResultTokens(transcript))) readTokens[role] = (readTokens[role] ?? 0) + tokens;
  }
  const usage = {
    transcript: null,
    counts: missingTranscripts > 0 ? null : sumCounts(Object.values(calls)),
    byModel: countsByModel(calls),
    byRole: missingTranscripts > 0 ? null : byRoleUsage(calls, readTokens),
    subagents,
    leadPeakTokens: null,
    costUsd: sessions.reduce((total, session) => total + (session.costUsd ?? 0), 0),
    sessions: sessions.length,
    missingTranscripts,
    missingHooks: sessions.filter((session) => ['task', 'plan'].includes(session.kind) && !(session.hooks > 0)).length
  };
  fs.writeFileSync(path.join(cellDirectory, 'usage.json'), `${JSON.stringify(usage, null, 2)}\n`);
  return usage;
}
