import fs from 'node:fs';
import path from 'node:path';
import { contextSeries } from '#context-series';

export function carriedCalls(previous, entry, sameTurn) {
  return sameTurn ? [...previous.calls, ...callsOf(entry)] : callsOf(entry);
}

export const callsOf = (entry) => (entry.message?.content ?? []).filter((block) => block.type === 'tool_use');

const TEMP_ROOT = /\/(?:private\/)?var\/folders\/[^\s"'/]+\/[^\s"'/]+\/T\/exo-sweep-[^\s"'/]+/g;
const SKILL_FILE = /skills\/[\w./-]+/g;

function readLabel(call) {
  const input = call.input ?? {};
  if (call.name === 'Skill') return `Skill ${input.skill}`;
  if (call.name === 'Agent') return `Agent ${input.subagent_type}`;
  if (call.name === 'Read') return String(input.file_path).replace(TEMP_ROOT, '');
  const command = String(input.command ?? '').replaceAll(TEMP_ROOT, '<tmp>');
  const files = [...new Set(command.match(SKILL_FILE) ?? [])];
  if (files.length > 0) return `${call.name} ${files.join(' ')}`;
  return `${call.name} ${command.split(/[\s;&|]+/).filter(Boolean).slice(0, 2).join(' ')}`;
}

function resultSizes(entries) {
  const sizes = new Map();
  for (const { entry } of entries) {
    const blocks = Array.isArray(entry.message?.content) ? entry.message.content : [];
    for (const block of blocks.filter((item) => item.type === 'tool_result')) {
      sizes.set(block.tool_use_id, JSON.stringify(block.content ?? '').length);
    }
  }
  return sizes;
}

export function sessionReads(file) {
  const series = contextSeries(file);
  const sizes = resultSizes(series);
  const reads = [];
  let previous = null;
  for (const { tokens, entry } of series) {
    if (tokens === null) continue;
    const id = entry.message?.id;
    const sameTurn = id !== undefined && id === previous?.id;
    const calls = carriedCalls(previous, entry, sameTurn);
    if (!sameTurn && previous) reads.push(...apportion(previous, tokens, sizes));
    previous = { tokens, id, calls };
  }
  return reads;
}

function apportion(previous, tokens, sizes) {
  const growth = Math.max(0, tokens - previous.tokens);
  const total = previous.calls.reduce((sum, call) => sum + (sizes.get(call.id) ?? 0), 0);
  return previous.calls.map((call) => {
    const share = total === 0 ? 1 / previous.calls.length : (sizes.get(call.id) ?? 0) / total;
    return { label: readLabel(call), tokens: Math.round(growth * share) };
  });
}

function readTotals(file) {
  const totals = new Map();
  for (const read of sessionReads(file)) totals.set(read.label, (totals.get(read.label) ?? 0) + read.tokens);
  return totals;
}

export function extraReads(sessionFiles, otherFiles) {
  const known = new Set(otherFiles.flatMap((file) => [...readTotals(file).keys()]));
  const entries = sessionFiles.flatMap((file) => [...readTotals(file)]).filter(([label]) => !known.has(label));
  const extra = new Map();
  for (const [label, tokens] of entries) extra.set(label, [...(extra.get(label) ?? []), tokens]);
  return [...extra].map(([label, counts]) => ({ label, tokens: median(counts), sessions: counts.length }));
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function readLines(folder) {
  const names = fs.readdirSync(folder).filter((name) => name.endsWith('.jsonl')).sort();
  return names.flatMap((name) => sessionReads(path.join(folder, name)).map((read) => `Read: ${read.label} ${read.tokens}`));
}
