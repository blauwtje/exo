import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';

export const CONTEXT_LIMIT = 80_000;
export const SOFT_RATIO = 0.75;
export const TASK_SPLIT_TOKENS = 15_000;
export const BYTES_PER_TOKEN = 4;

const TAIL_BYTES = 256 * 1024;
const CATALOG = new URL('./run-providers.json', import.meta.url);

const isLimit = (value) => Number.isInteger(value) && value > 0;

function readLimit(file, key = 'contextLimit') {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8')).defaults?.[key];
    return isLimit(value) ? value : null;
  } catch {
    return null;
  }
}

export function softLimit(limit) {
  return Math.round(limit * SOFT_RATIO);
}

export function contextLimit() {
  return CONTEXT_LIMIT;
}

export function capHeadroomTokens(home = os.homedir()) {
  return readLimit(path.join(home, '.config', 'exo', 'run.json'), 'capHeadroomTokens') ?? readLimit(CATALOG, 'capHeadroomTokens') ?? 50;
}

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
    return false;
  }
}

export function contextDecision(hookInput) {
  const input = hookInput ?? {};
  const isAgent = Boolean(input.agent_id);
  const loopFile = isAgent ? '' : process.env.EXO_RUN_HANDOFF ?? '';
  const tokens = contextTokens(transcriptOf(input));
  if (tokens === null) return null;
  const hardLimit = contextLimit();
  const used = `Context use is ${Math.round(tokens / 1000)}k tokens.`;

  if (!isAgent && loopFile === '') {
    const hard = tokens >= hardLimit;
    if (!hard && tokens < softLimit(hardLimit)) {
      fs.rmSync(levelFile(input.session_id ?? 'main'), { force: true });
      return null;
    }
    if (!firstWarning(input.session_id ?? 'main', hard ? 2 : 1)) return null;
    return { additionalContext: hard
      ? `${used} Over the ${hardLimit / 1000}k limit: stop at the next stopping point, run exo:save-session, and tell the user to start a fresh session.`
      : `${used} Finish the current step, send further reading and edits to subagents, keep progress in \`.exo/<topic>/progress.md\`, and at a stopping point run exo:save-session, then continue in a fresh session.` };
  }

  if (tokens >= hardLimit) {
    if (input.tool_name === 'Write') return null;
    if (isAgent) return { deny: `${used} exo context limit: over the ${hardLimit / 1000}k hard limit, so every tool except Write is refused. Write is still allowed: Write the result file your brief names with what is done, what remains and the files you changed, then reply with its path. A fresh agent continues from it.` };
    const task = (process.env.EXO_RUN_TASK ?? '').split('/').pop() || '<n>';
    return { deny: `${used} Over the ${hardLimit / 1000}k hard limit: write what is done, what remains and the files you changed, at most 25 lines, with Write to ${loopFile}, then end on the last line \`Task ${task}: HANDOFF\`. A fresh session continues from that file.` };
  }
  if (tokens >= softLimit(hardLimit)) {
    return { additionalContext: isAgent
      ? `${used} exo context limit: at ${hardLimit / 1000}k your tools are refused except Write. Finish the edit in hand, write the result file your brief names with what is done, what remains and the files you changed, and return; a fresh agent continues the rest.`
      : `${used} Finish your current step, then land the task as soon as its proof passes.` };
  }
  return null;
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

export function contextFields(decision) {
  if (!decision) return null;
  return decision.deny
    ? { permissionDecision: 'deny', permissionDecisionReason: decision.deny }
    : { additionalContext: decision.additionalContext };
}

function peakOf(file) {
  let peak = 0;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) peak = Math.max(peak, entryTokens(line) ?? 0);
  return peak;
}

function agentType(metaFile) {
  try {
    const type = JSON.parse(fs.readFileSync(metaFile, 'utf8')).agentType;
    return typeof type === 'string' && type !== '' ? type : 'subagent';
  } catch {
    return 'subagent';
  }
}

export function contextPeaks({ folder, since }) {
  const rows = [];
  const add = (label, file) => {
    try {
      if (fs.statSync(file).mtimeMs < since) return;
      const peak = peakOf(file);
      if (peak > 0) rows.push({ label, peak });
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
    add(`session ${id}`, path.join(folder, name));
    const subagents = path.join(folder, id, 'subagents');
    let agents = [];
    try { agents = fs.readdirSync(subagents); } catch { }
    for (const agent of agents.filter((entry) => /^agent-.*\.jsonl$/.test(entry))) {
      const agentId = agent.slice('agent-'.length, -'.jsonl'.length);
      add(`${agentType(path.join(subagents, `agent-${agentId}.meta.json`))} ${agentId} (session ${id})`, path.join(subagents, agent));
    }
  }
  return rows.sort((a, b) => b.peak - a.peak);
}

export function subagentStartNote() {
  const hard = contextLimit();
  return `exo sets a context limit on every subagent. From ${softLimit(hard) / 1000}k tokens a note from the exo hook arrives next to a tool result and asks you to hand over; it comes from this setup, so follow it. Past ${hard / 1000}k every tool except Write is refused. Hand over by writing the result file your brief names with what is done, what remains and the files you changed, then reply with its path; a fresh agent continues from it.`;
}
