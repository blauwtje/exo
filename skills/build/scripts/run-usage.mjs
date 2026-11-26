#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { configDirectory } from '#config-directory';
import { isMain, parseFlags, UsageError, USAGE_EXIT } from '#script-flags';
import { jsonlFiles, entriesOf, messageUsage } from '../../../evals/model-usage.mjs';

const USAGE = 'Usage: run-usage.mjs --session <id> --since <ISO time> [--projects <dir>]';

async function transcriptUsage(file, since) {
  const messages = new Map();
  let first;
  let last;
  for await (const entry of entriesOf(file)) {
    const time = Date.parse(entry.timestamp);
    if (Number.isNaN(time) || time < since) continue;
    first = Math.min(first ?? time, time);
    last = Math.max(last ?? time, time);
    const used = messageUsage(entry);
    if (!used) continue;
    const seen = messages.get(used.key) ?? { input: 0, output: 0 };
    messages.set(used.key, { input: Math.max(seen.input, used.input), output: Math.max(seen.output, used.output) });
  }
  const sum = (field) => [...messages.values()].reduce((total, message) => total + message[field], 0);
  return { kept: first !== undefined, first, last, input: sum('input'), output: sum('output'), minutes: first === undefined ? 0 : Math.round((last - first) / 600) / 100 };
}

function sessionFiles(projects, session) {
  const lead = [];
  const helpers = [];
  for (const project of fs.readdirSync(projects, { withFileTypes: true })) {
    if (!project.isDirectory()) continue;
    const directory = path.join(projects, project.name);
    const file = path.join(directory, `${session}.jsonl`);
    if (fs.existsSync(file)) lead.push(file);
    const subagents = path.join(directory, session, 'subagents');
    if (fs.existsSync(subagents)) helpers.push(...jsonlFiles(subagents).filter((name) => path.basename(name).startsWith('agent-')).sort());
  }
  return { lead, helpers };
}

function unionMinutes(usages) {
  let total = 0;
  let end = -Infinity;
  for (const { first, last } of [...usages].sort((a, b) => a.first - b.first)) {
    total += Math.max(0, last - Math.max(first, end));
    end = Math.max(end, last);
  }
  return total / 60000;
}

function line(label, { input, output }, tail) {
  return `${label}: ${input} input, ${output} output tokens, ${tail}`;
}

async function main(argv) {
  const flags = parseFlags(argv, { session: 'string', since: 'string', projects: 'string' }, { usage: USAGE });
  if (flags.session === undefined || flags.since === undefined) throw new UsageError(USAGE);
  const since = Date.parse(flags.since);
  if (Number.isNaN(since)) throw new UsageError(`--since must be an ISO time, got '${flags.since}'`);
  const projects = flags.projects ?? path.join(configDirectory(), 'projects');
  const { lead, helpers } = sessionFiles(projects, flags.session);
  if (lead.length === 0) throw new UsageError(`no session file for id '${flags.session}' under ${projects}`);
  const leads = await Promise.all(lead.map((file) => transcriptUsage(file, since)));
  const helperUsages = [];
  for (const file of helpers) helperUsages.push({ file, ...(await transcriptUsage(file, since)) });
  const keptHelpers = helperUsages.filter((usage) => usage.kept);
  const sum = (items, field) => items.reduce((total, item) => total + item[field], 0);
  const out = [
    ...leads.map((usage) => line('Lead', usage, `${usage.minutes} min`)),
    ...keptHelpers.map((usage) => line(`Helper ${path.basename(usage.file)}`, usage, `${usage.minutes} min`)),
  ];
  const all = [...leads, ...keptHelpers];
  const round = (value) => Math.round(value * 100) / 100;
  out.push(line('Total', { input: sum(all, 'input'), output: sum(all, 'output') }, `lead ${round(sum(leads, 'minutes'))} min, helpers ${round(unionMinutes(keptHelpers))} min`));
  process.stdout.write(`${out.join('\n')}\n`);
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(error instanceof UsageError ? USAGE_EXIT : 1);
  });
}
