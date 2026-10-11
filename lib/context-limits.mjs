// Context size of the calling session or agent, read from the tail of its own
// transcript, and what a PreToolUse hook should do about it: stay silent, warn
// to hand off, or refuse the tool.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const HARD_LIMIT = 100_000;
export const LEAD_SOFT_LIMIT = 60_000;
export const AGENT_SOFT_LIMIT = 50_000;
export const TASK_SPLIT_TOKENS = 25_000;
export const BYTES_PER_TOKEN = 4;

const TAIL_BYTES = 256 * 1024;

function entryTokens(line) {
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    return null;
  }
  const usage = entry?.type === 'assistant' ? entry.message?.usage : null;
  if (!usage) return null;
  const sum = (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
  return Number.isFinite(sum) && sum > 0 ? sum : null;
}

// Tokens of the last assistant entry's usage, or null when the file, an entry
// or its usage is missing.
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
    if (start > 0) lines.shift(); // first line is cut mid-entry
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

// Same rule as skills/save-session/scripts/handoff.mjs handoffFile.
function handoffPath(cwd) {
  const git = (...args) => spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  const common = git('rev-parse', '--path-format=absolute', '--git-common-dir');
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (common.status !== 0 || branch.status !== 0) return '<git common dir>/exo/handoff/<branch>.md';
  return path.join(common.stdout.trim(), 'exo', 'handoff', `${branch.stdout.trim()}.md`);
}

export function contextDecision(hookInput) {
  const input = hookInput ?? {};
  const tokens = contextTokens(transcriptOf(input));
  if (tokens === null) return null;
  const isAgent = Boolean(input.agent_id);
  const used = `Context use is ${Math.round(tokens / 1000)}k tokens.`;

  if (tokens >= HARD_LIMIT) {
    if (input.tool_name === 'Write') return null;
    const deny = isAgent
      ? `${used} Over the ${HARD_LIMIT / 1000}k hard limit: end now with your report of what is done and what remains.`
      : `${used} Over the ${HARD_LIMIT / 1000}k hard limit: write your hand-off with Write to ${handoffPath(input.cwd ?? process.cwd())} and stop.`;
    return { deny };
  }
  if (tokens >= (isAgent ? AGENT_SOFT_LIMIT : LEAD_SOFT_LIMIT)) {
    const additionalContext = isAgent
      ? `${used} Finish your current step, then end with your report of what is done and what remains.`
      : `${used} Finish your current step, write a hand-off with exo:save-session and stop.`;
    return { additionalContext };
  }
  return null;
}

function peakOf(file) {
  let peak = 0;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) peak = Math.max(peak, entryTokens(line) ?? 0);
  return peak;
}

// One `{ label, peak }` row per session transcript in `folder` modified at or
// after `since` (ms) and per subagent transcript beside it, highest peak first.
// Sessions without a usage entry are left out.
export function contextPeaks({ folder, since }) {
  const rows = [];
  const add = (label, file) => {
    try {
      if (fs.statSync(file).mtimeMs < since) return;
      const peak = peakOf(file);
      if (peak > 0) rows.push({ label, peak });
    } catch { /* unreadable transcript: not reported */ }
  };
  let names;
  try {
    names = fs.readdirSync(folder);
  } catch {
    return rows;
  }
  for (const name of names.filter((entry) => entry.endsWith('.jsonl'))) {
    const id = name.slice(0, -'.jsonl'.length);
    add(`session ${id}`, path.join(folder, name));
    const subagents = path.join(folder, id, 'subagents');
    let agents = [];
    try { agents = fs.readdirSync(subagents); } catch { /* no subagents */ }
    for (const agent of agents.filter((entry) => /^agent-.*\.jsonl$/.test(entry))) {
      add(`agent ${agent.slice('agent-'.length, -'.jsonl'.length)} (session ${id})`, path.join(subagents, agent));
    }
  }
  return rows.sort((a, b) => b.peak - a.peak);
}
