// benchmarks/cell-usage.mjs
// What a cell's session spent across every transcript, the main thread and
// each subagent, saved as <cell>/usage.json. The result JSON's usage block
// holds the main thread only, so a subagent on another model would drop out
// of the tokens metric; score.mjs reads this file and never a transcript.

import fs from 'node:fs';
import path from 'node:path';
import { configDirectory } from '#config-directory';
import { sumCounts, usageCounts } from '#token-weights';

const SESSION_ID = /^[\w-]+$/;
// The session hook's context opens with this heading while exo is loaded.
const EXO_HEADING = '# Using exo';

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
  const files = [transcriptPath];
  const delegatesDirectory = path.join(transcriptPath.replace(/\.jsonl$/, ''), 'subagents');
  if (!fs.existsSync(delegatesDirectory)) return files;
  for (const name of fs.readdirSync(delegatesDirectory).sort()) {
    if (name.endsWith('.jsonl')) files.push(path.join(delegatesDirectory, name));
  }
  return files;
}

// The usage per API call of a transcript and its subagents, keyed by message
// id with the model beside the counts; the format is internal to the harness,
// so a line that does not parse is skipped. One response is one line per
// content block and a streaming response repeats its id with a growing output
// count: the last line per id wins. Null when the transcript is missing.
export function transcriptCalls(transcriptPath) {
  if (!fs.existsSync(transcriptPath)) return null;
  const calls = {};
  for (const file of transcriptFiles(transcriptPath)) {
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
      calls[message.id] = { ...usageCounts(message.usage), model: message.model };
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
    const meta = JSON.parse(fs.readFileSync(path.join(subagents, name), 'utf8'));
    types.push(meta.agentType ?? 'unknown');
  }
  return types;
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
    if (content.some((text) => typeof text === 'string' && text.includes(EXO_HEADING))) return true;
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
    subagents: subagentTypes(transcript),
    leadPeakTokens: leadPeakTokens(transcript)
  };
  fs.writeFileSync(path.join(cellDirectory, 'usage.json'), `${JSON.stringify(usage, null, 2)}\n`);
  return usage;
}
