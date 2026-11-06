#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { UsageError, parseFlags, isMain } from '#script-flags';
import { readJsonOrNull } from '#basics';

const USAGE = [
  'usage: pr-body.mjs --sections <file> [--branch <name>] [--plan <file>] [--issue <n>] [--gate <file>] [--verdicts <file>] > <body file>',
  'sections: a file with ## Why, ## What changed (grouped by theme, each group naming its files), ## Read order, ## Risk areas and ## Follow-ups; write none for an empty one and it is dropped.',
  'proof: the PASS, FAIL, SKIP, WARN, UNRUN and SUMMARY lines of --gate are copied as they are; with no --gate there is no Proof section.',
  'issue: from --issue, a Closes #n line in the sections, an Issue: #n line in --plan, or a branch such as feat/12-title; read with gh issue view n --json body, never edited.',
  'acceptance: each checklist item (- [ ] text) is one row; --verdicts is [{"n": 1, "status": "met|unmet|unverifiable", "evidence": "test, file:line or gate check"}]; a row with no verdict or a met with no evidence shows unverifiable; no items, no table.',
  'length: within defaults.prBodyBytes in ~/.config/exo/run.json (4096); over it Follow-ups, Read order, Risk areas are cut in that order (CUT line), then exit 4 with OVER and no body: shorten Why or What changed.',
  'no diagram and no label suggestions; ship.mjs copies the labels from the issue.'
].join('\n');
export const DEFAULT_BODY_BYTES = 4096;
export const OVER_EXIT = 4;
const AUTHORED = ['Why', 'What changed', 'Read order', 'Risk areas', 'Follow-ups'];
const ORDER = ['Why', 'Acceptance', 'What changed', 'Read order', 'Risk areas', 'Proof', 'Follow-ups'];
const CUT_ORDER = ['Follow-ups', 'Read order', 'Risk areas'];
const STATUSES = ['met', 'unmet', 'unverifiable'];
const GATE_LINE = /^(PASS|FAIL|SKIP|WARN|UNRUN|UNPLANNED|SELF-HOSTED|FIX-ONLY|SUMMARY)\b/;
const EMPTY_BODY = /^(none|n\/a|-)\.?$/i;
const CLOSES = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+#(\d+)\b/i;
const CHECKLIST_ITEM = /^\s*[-*+]\s+\[[ xX]\]\s+(.+?)\s*$/;
const FENCE = /^\s*(```|~~~)/;

export function bodyBytes(home = os.homedir()) {
  const value = readJsonOrNull(path.join(home, '.config', 'exo', 'run.json'))?.defaults?.prBodyBytes;
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_BODY_BYTES;
}

export function parseSections(text) {
  const sections = new Map();
  let current = null;
  for (const line of text.split('\n')) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      current = heading[1];
      sections.set(current, []);
      continue;
    }
    if (current !== null) sections.get(current).push(line);
  }
  return new Map([...sections].map(([name, lines]) => [name, lines.join('\n').trim()]));
}

export function isEmptySection(content) {
  return content === undefined || content === '' || EMPTY_BODY.test(content);
}

export function issueFromBranch(branch) {
  const match = /(?:^|\/)(?:(?:issue|gh)-)?(\d+)(?=[-/]|$)/.exec(branch ?? '');
  return match ? Number(match[1]) : null;
}

export function issueFromPlan(planText) {
  const match = /^Issue:\s*#?(\d+)\s*$/m.exec(planText ?? '');
  return match ? Number(match[1]) : null;
}

export function issueFromCloses(text) {
  const match = CLOSES.exec(text ?? '');
  return match ? Number(match[1]) : null;
}

export function checklistItems(issueBody) {
  const items = [];
  let fenced = false;
  for (const line of String(issueBody ?? '').split('\n')) {
    if (FENCE.test(line)) {
      fenced = !fenced;
      continue;
    }
    const match = fenced ? null : CHECKLIST_ITEM.exec(line);
    if (match) items.push(match[1]);
  }
  return items;
}

function verdictFor(verdicts, item, index) {
  const wanted = item.trim().toLowerCase();
  return verdicts.find((verdict) => verdict.n === index + 1)
    ?? verdicts.find((verdict) => String(verdict.item ?? '').trim().toLowerCase() === wanted);
}

export function acceptanceRows(items, verdicts = []) {
  return items.map((item, index) => {
    const verdict = verdictFor(verdicts, item, index);
    const evidence = String(verdict?.evidence ?? '').trim();
    const stated = STATUSES.includes(verdict?.status) ? verdict.status : 'unverifiable';
    const status = stated === 'met' && evidence === '' ? 'unverifiable' : stated;
    return { item, status, evidence: evidence === '' ? 'none' : evidence };
  });
}

const cell = (text) => text.replaceAll('|', '\\|');

export function acceptanceTable(rows) {
  if (rows.length === 0) return '';
  const lines = rows.map((row) => `| ${cell(row.item)} | ${row.status} | ${cell(row.evidence)} |`);
  return ['| Criterion | Status | Evidence |', '| --- | --- | --- |', ...lines].join('\n');
}

export function proofLines(gateText) {
  return String(gateText ?? '').split('\n').filter((line) => GATE_LINE.test(line)).map((line) => line.trimEnd());
}

export function proofBlock(lines) {
  return lines.length === 0 ? '' : ['```', ...lines, '```'].join('\n');
}

export function composeBody({ authored, acceptance, proof, issue, limit }) {
  const generated = new Map([['Acceptance', acceptance], ['Proof', proof]]);
  const present = (name) => (generated.has(name) ? generated.get(name) : authored.get(name));
  const closes = issue === null ? '' : `\n\nCloses #${issue}`;
  const render = (names) => `${names.map((name) => `## ${name}\n\n${present(name)}`).join('\n\n')}${closes}\n`;
  const size = (names) => Buffer.byteLength(render(names));
  const cut = [];
  let names = ORDER.filter((name) => !isEmptySection(present(name)));
  for (const name of CUT_ORDER) {
    if (size(names) <= limit) break;
    if (!names.includes(name)) continue;
    names = names.filter((candidate) => candidate !== name);
    cut.push(name);
  }
  return { body: render(names), cut, bytes: size(names), over: size(names) > limit };
}

export function readIssueBody(issue, run = execFileSync) {
  try {
    const out = run('gh', ['issue', 'view', String(issue), '--json', 'body'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return JSON.parse(out).body ?? '';
  } catch {
    return null;
  }
}

const readText = (file) => (file ? fs.readFileSync(file, 'utf8') : '');

function readVerdicts(file) {
  if (!file) return [];
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(parsed) ? parsed : [];
}

function resolveIssue(flags, sectionsText) {
  if (flags.issue !== undefined) {
    if (!/^\d+$/.test(flags.issue)) throw new UsageError('--issue needs a number');
    return Number(flags.issue);
  }
  return issueFromCloses(sectionsText) ?? issueFromPlan(readText(flags.plan)) ?? issueFromBranch(flags.branch);
}

function report({ result, authored, issue, rows }) {
  const lines = result.cut.map((name) => `CUT ${name}`);
  const ignored = [...authored.keys()].filter((name) => !AUTHORED.includes(name));
  lines.push(...ignored.map((name) => `IGNORED ${name}`), `ISSUE ${issue ?? 'none'}`, `ROWS ${rows.length}`, `BYTES ${result.bytes}`);
  process.stderr.write(`${lines.join('\n')}\n`);
}

function main() {
  const spec = { sections: 'value', branch: 'value', plan: 'value', issue: 'value', gate: 'value', verdicts: 'value' };
  const flags = parseFlags(process.argv.slice(2), spec, { usage: USAGE });
  if (!flags.sections) throw new UsageError('--sections needs a file');
  const sectionsText = readText(flags.sections);
  const authored = parseSections(sectionsText);
  const issue = resolveIssue(flags, sectionsText);
  const issueBody = issue === null ? null : readIssueBody(issue);
  if (issue !== null && issueBody === null) process.stderr.write(`NOTE issue #${issue} unreadable, no acceptance table\n`);
  const rows = acceptanceRows(checklistItems(issueBody), readVerdicts(flags.verdicts));
  const limit = bodyBytes();
  const proof = proofBlock(proofLines(readText(flags.gate)));
  const result = composeBody({ authored, acceptance: acceptanceTable(rows), proof, issue, limit });
  report({ result, authored, issue, rows });
  if (!result.over) {
    process.stdout.write(result.body);
    return;
  }
  process.stderr.write(`OVER cap ${limit}: shorten Why or What changed\n`);
  process.exitCode = OVER_EXIT;
}

function fail(error) {
  if (!(error instanceof UsageError) && error.code !== 'ENOENT') throw error;
  process.stderr.write(`${error.message}\n${USAGE}\n`);
  process.exitCode = 2;
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (error) {
    fail(error);
  }
}
