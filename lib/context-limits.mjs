import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const HARD_LIMIT = 100_000;
export const LEAD_SOFT_LIMIT = 60_000;
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

const HANDOFF_SCRIPT = fileURLToPath(new URL('../skills/save-session/scripts/handoff.mjs', import.meta.url));

function handoffPath(cwd) {
  const run = spawnSync(process.execPath, [HANDOFF_SCRIPT, 'path', '--cwd', cwd], { encoding: 'utf8' });
  const file = run.status === 0 ? run.stdout.trim() : '';
  return file === '' ? 'the path `node skills/save-session/scripts/handoff.mjs path` prints' : file;
}

export function contextDecision(hookInput) {
  const input = hookInput ?? {};
  const tokens = contextTokens(transcriptOf(input));
  if (tokens === null) return null;
  const isAgent = Boolean(input.agent_id);
  const used = `Context use is ${Math.round(tokens / 1000)}k tokens.`;

  if (tokens >= HARD_LIMIT) {
    if (input.tool_name === 'Write' || (!isAgent && input.tool_name === 'Agent')) return null;
    const deny = isAgent
      ? `${used} Over the ${HARD_LIMIT / 1000}k hard limit: end now with your report of what is done and what remains.`
      : `${used} Over the ${HARD_LIMIT / 1000}k hard limit: write your hand-off with Write to ${handoffPath(input.cwd ?? process.cwd())}, following the sections of skills/save-session/SKILL.md, then dispatch one fresh general-purpose subagent whose prompt names that path, to resume from it and carry the run to its end, and pass on its final report.`;
    return { deny };
  }
  if (tokens >= (isAgent ? AGENT_SOFT_LIMIT : LEAD_SOFT_LIMIT)) {
    const additionalContext = isAgent
      ? `${used} Finish your current step, then end with your report of what is done and what remains.`
      : `${used} Finish your current step, then send each larger remaining step to a fresh subagent.`;
    return { additionalContext };
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
