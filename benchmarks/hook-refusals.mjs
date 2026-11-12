#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { GUARD_RULES } from '../lib/guard-rules.mjs';
import { isMain } from '../lib/script-flags.mjs';

const DAY_MS = 86_400_000;
const HOOK_ERROR = /hook.*(?:error|cancel)/i;
const CUT = /\[output cut at (\d+) bytes/;

const textOf = (content) => (Array.isArray(content) ? content.map((part) => part?.text ?? '').join('\n') : String(content ?? ''));

function ruleIdOf(text) {
  const row = GUARD_RULES.find((entry) => entry.rule && text.includes(entry.rule.split('{')[0]));
  return row?.id ?? 'other';
}

function transcriptFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { recursive: true })
    .filter((name) => String(name).endsWith('.jsonl'))
    .map((name) => path.join(root, String(name)));
}

function readEntries(file, since) {
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((entry) => entry && (entry.timestamp ?? '9') >= since);
}

function newSummary() {
  return { files: 0, calls: {}, refusals: { total: 0, byRule: {}, byTool: {} }, cuts: 0, hookErrors: {}, falsePositiveCandidates: [] };
}

const bump = (table, key) => {
  table[key] = (table[key] ?? 0) + 1;
};

function addEntry(summary, entry, uses, refused) {
  if (entry.type === 'attachment' && HOOK_ERROR.test(entry.attachment?.type ?? '')) {
    bump(summary.hookErrors, entry.attachment.command ?? entry.attachment.hookName ?? 'unknown');
    return;
  }
  for (const block of Array.isArray(entry.message?.content) ? entry.message.content : []) {
    if (block.type === 'tool_use') {
      bump(summary.calls, block.name);
      uses.push({ id: block.id, name: block.name, input: block.input });
    }
    if (block.type === 'tool_result') addResult(summary, block, uses, refused);
  }
}

function addResult(summary, block, uses, refused) {
  const text = textOf(block.content);
  if (CUT.test(text)) summary.cuts += 1;
  if (!block.is_error || !/Do instead:/.test(text)) return;
  const index = uses.findIndex((use) => use.id === block.tool_use_id);
  const use = uses[index];
  const rule = ruleIdOf(text);
  summary.refusals.total += 1;
  bump(summary.refusals.byRule, rule);
  bump(summary.refusals.byTool, use?.name ?? 'unknown');
  if (use) refused.push({ index, rule });
}

function flagRetries(summary, uses, refused) {
  for (const { index, rule } of refused) {
    const use = uses[index];
    const next = uses[index + 1];
    if (next?.name === use.name && JSON.stringify(next.input) === JSON.stringify(use.input)) {
      summary.falsePositiveCandidates.push({ rule, tool: use.name, input: use.input });
    }
  }
}

export function scanTranscripts({ root = path.join(os.homedir(), '.claude', 'projects'), days = 1, now = Date.now() } = {}) {
  const summary = newSummary();
  const since = new Date(now - days * DAY_MS).toISOString();
  for (const file of transcriptFiles(root)) {
    if (fs.statSync(file).mtimeMs < now - days * DAY_MS) continue;
    summary.files += 1;
    const uses = [];
    const refused = [];
    for (const entry of readEntries(file, since)) addEntry(summary, entry, uses, refused);
    flagRetries(summary, uses, refused);
  }
  const total = Object.values(summary.calls).reduce((sum, count) => sum + count, 0);
  return { days, ...summary, refusalRate: total === 0 ? 0 : summary.refusals.total / total };
}

if (isMain(import.meta.url)) {
  const flag = process.argv.indexOf('--days');
  const days = flag === -1 ? 1 : Number(process.argv[flag + 1]);
  process.stdout.write(`${JSON.stringify(scanTranscripts({ days }), null, 1)}\n`);
}
