import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export const HARD_LIMIT = 100_000;
export const AGENT_SOFT_LIMIT = 60_000;
export const TASK_SPLIT_TOKENS = 25_000;
export const BYTES_PER_TOKEN = 2;

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

export function contextDecision(hookInput) {
  const input = hookInput ?? {};
  const isAgent = Boolean(input.agent_id);
  const loopFile = isAgent ? '' : process.env.EXO_RUN_HANDOFF ?? '';
  if (!isAgent && loopFile === '') return null;
  const tokens = contextTokens(transcriptOf(input));
  if (tokens === null) return null;
  const used = `Context use is ${Math.round(tokens / 1000)}k tokens.`;

  if (tokens >= HARD_LIMIT) {
    if (input.tool_name === 'Write') return null;
    if (isAgent) return { deny: `${used} Over the ${HARD_LIMIT / 1000}k hard limit: end now with your report of what is done and what remains.` };
    const task = (process.env.EXO_RUN_TASK ?? '').split('/').pop() || '<n>';
    return { deny: `${used} Over the ${HARD_LIMIT / 1000}k hard limit: write what is done, what remains and the files you changed, at most 25 lines, with Write to ${loopFile}, then end on the last line \`Task ${task}: HANDOFF\`. A fresh session continues from that file.` };
  }
  if (tokens >= AGENT_SOFT_LIMIT) {
    return { additionalContext: isAgent
      ? `${used} Finish your current step, then end with your report of what is done and what remains.`
      : `${used} Finish your current step, then land the task as soon as its proof passes.` };
  }
  return null;
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
