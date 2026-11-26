#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import { configDirectory } from '#config-directory';
import { isMain, parseFlags, UsageError, USAGE_EXIT } from '#script-flags';

const FAMILIES = ['fable', 'opus', 'sonnet', 'haiku'];
const READ_ONLY_BASH = /^(cat|head|tail|ls|rg|grep|find|wc|sed\s+-n|git\s+(status|diff|log|show|branch))(\s|$)/;
const AGENT_TOOLS = new Set(['Agent', 'Task']);
const SYNTHETIC = '<synthetic>';
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const USAGE = 'Usage: model-usage.mjs [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--projects <dir>]';

function familyOf(model) {
  return FAMILIES.find((family) => model.includes(family)) ?? 'other';
}

function isReadOnly(command) {
  return READ_ONLY_BASH.test(command.trim());
}

function inWindow(timestamp, { since, until }) {
  if (typeof timestamp !== 'string') return false;
  const day = timestamp.slice(0, 10);
  return (since === undefined || day >= since) && (until === undefined || day <= until);
}

function jsonlFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return jsonlFiles(full);
    return entry.name.endsWith('.jsonl') ? [full] : [];
  });
}

async function* entriesOf(file) {
  const lines = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const line of lines) {
    try {
      yield JSON.parse(line);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }
}

function readMeta(file) {
  try {
    return JSON.parse(fs.readFileSync(file.replace(/\.jsonl$/, '.meta.json'), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return {};
  }
}

function blocksOf(entry) {
  const content = entry.message?.content;
  return Array.isArray(content) ? content : [];
}

async function scanFile(file, window, agentCalls) {
  const scan = {
    subagent: file.includes(`${path.sep}subagents${path.sep}`),
    headless: false,
    messages: new Map(),
    tools: new Map(),
  };
  for await (const entry of entriesOf(file)) {
    if (entry.entrypoint === 'sdk-cli') scan.headless = true;
    if (entry.type !== 'assistant' || !entry.message) continue;
    for (const block of blocksOf(entry)) {
      if (block.type === 'tool_use' && AGENT_TOOLS.has(block.name)) {
        agentCalls.set(block.id, { agentType: block.input?.subagent_type, model: block.input?.model });
      }
    }
    const { id, model, usage } = entry.message;
    if (!inWindow(entry.timestamp, window) || !model || model === SYNTHETIC) continue;
    const family = familyOf(model);
    const input = (usage?.input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0);
    const output = usage?.output_tokens ?? 0;
    const key = id ?? entry.uuid ?? `unkeyed-${scan.messages.size}`;
    const seen = scan.messages.get(key) ?? { family, input: 0, output: 0 };
    scan.messages.set(key, { family, input: Math.max(seen.input, input), output: Math.max(seen.output, output) });
    for (const block of blocksOf(entry)) {
      if (block.type === 'tool_use') scan.tools.set(block.id, { family, name: block.name, command: block.input?.command });
    }
  }
  return scan;
}

function kindOf(scan) {
  if (scan.subagent) return 'subagent';
  return scan.headless ? 'headless' : 'main';
}

function emptyRow(fields) {
  return { ...fields, sessions: 0, toolCalls: 0, bash: 0, readOnlyBash: 0, inputTokens: 0, outputTokens: 0 };
}

function kindRows(scans) {
  const rows = new Map();
  const rowOf = (kind, family) => {
    const key = `${kind}/${family}`;
    if (!rows.has(key)) rows.set(key, emptyRow({ kind, family }));
    return rows.get(key);
  };
  for (const scan of scans) {
    const kind = kindOf(scan);
    const families = new Set();
    for (const { family, input, output } of scan.messages.values()) {
      const row = rowOf(kind, family);
      row.inputTokens += input;
      row.outputTokens += output;
      families.add(family);
    }
    for (const { family, name, command } of scan.tools.values()) {
      const row = rowOf(kind, family);
      row.toolCalls += 1;
      if (name !== 'Bash') continue;
      row.bash += 1;
      if (isReadOnly(command ?? '')) row.readOnlyBash += 1;
    }
    for (const family of families) rowOf(kind, family).sessions += 1;
  }
  return [...rows.values()].map(({ readOnlyBash, ...row }) => ({
    ...row,
    readOnlyBashPct: row.bash === 0 ? 0 : Math.round((1000 * readOnlyBash) / row.bash) / 10,
  }));
}

function agentRows(scans, calls) {
  const rows = new Map();
  for (const { file, scan } of scans.filter(({ scan: { subagent } }) => subagent)) {
    if (scan.messages.size === 0) continue;
    const meta = readMeta(file);
    const call = calls.get(meta.toolUseId);
    const agentType = meta.agentType ?? call?.agentType ?? 'unknown';
    const asked = call?.model ?? 'none';
    const families = new Set([...scan.messages.values()].map(({ family }) => family));
    for (const ran of families) {
      const key = `${agentType}/${asked}/${ran}`;
      const row = rows.get(key) ?? { agentType, asked, ran, transcripts: 0, toolCalls: 0 };
      row.transcripts += 1;
      row.toolCalls += [...scan.tools.values()].filter(({ family }) => family === ran).length;
      rows.set(key, row);
    }
  }
  return [...rows.values()];
}

export async function usageReport(projectsDir, { since, until } = {}) {
  const calls = new Map();
  const scans = [];
  for (const file of jsonlFiles(projectsDir).sort()) {
    scans.push({ file, scan: await scanFile(file, { since, until }, calls) });
  }
  const counted = scans.filter(({ scan }) => scan.messages.size > 0);
  return {
    kinds: kindRows(counted.map(({ scan }) => scan)),
    agents: agentRows(counted, calls),
  };
}

function table(columns, rows) {
  const header = `| ${columns.join(' | ')} |\n| ${columns.map(() => '---').join(' | ')} |\n`;
  return header + rows.map((row) => `| ${columns.map((column) => row[column]).join(' | ')} |`).join('\n') + '\n';
}

export function formatReport({ kinds, agents }) {
  const kindColumns = ['kind', 'family', 'sessions', 'toolCalls', 'bash', 'readOnlyBashPct', 'inputTokens', 'outputTokens'];
  const agentColumns = ['agentType', 'asked', 'ran', 'transcripts', 'toolCalls'];
  return `${table(kindColumns, kinds)}\n${table(agentColumns, agents)}`;
}

async function main(argv) {
  const flags = parseFlags(argv, { since: 'string', until: 'string', projects: 'string' }, { usage: USAGE });
  for (const name of ['since', 'until']) {
    if (flags[name] !== undefined && !DAY.test(flags[name])) throw new UsageError(`--${name} must be YYYY-MM-DD, got '${flags[name]}'`);
  }
  const projects = flags.projects ?? path.join(configDirectory(), 'projects');
  const report = await usageReport(projects, { since: flags.since, until: flags.until });
  process.stdout.write(formatReport(report));
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(error instanceof UsageError ? USAGE_EXIT : 1);
  });
}
