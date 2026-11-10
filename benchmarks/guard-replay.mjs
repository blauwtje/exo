#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { GUARD_RULES } from '../lib/guard-rules.mjs';

const BASE_REF = '70bcb0c7';
const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), '..');

export const FAMILIES = {
  stash: { tool: 'Bash', hook: 'dispatch-bash.mjs', subagent: true, firstLive: null, pattern: /Subagents share the stash|git stash is denied|runs no git stash/i, key: 'command' },
  'comment-write': { tool: 'Write', hook: 'dispatch-edit.mjs', subagent: false, firstLive: null, pattern: /comment/i, key: 'content' },
  'lacks-reads': { tool: 'Agent', hook: 'agent-effort.mjs', subagent: false, firstLive: '2026-11-05T16:33', pattern: /lacks a `?Reads:`? line|brief lacks/i, key: 'prompt' }
};

const flagValue = (args, name) => {
  const at = args.indexOf(name);
  return at < 0 ? null : args[at + 1];
};

const resultText = (block) => (typeof block.content === 'string' ? block.content : JSON.stringify(block.content || ''));

function listJsonl(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const here = entries.filter((entry) => entry.name.endsWith('.jsonl')).map((entry) => path.join(dir, entry.name));
  const nested = entries.filter((entry) => entry.isDirectory()).flatMap((entry) => listJsonl(path.join(dir, entry.name)));
  return [...here, ...nested];
}

function parseLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function blocksOf(file) {
  const records = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(parseLine).filter(Boolean);
  const cli = records.some((record) => record.entrypoint === 'cli');
  if (!cli) return [];
  const withContent = records.filter((record) => Array.isArray(record.message?.content));
  return withContent.flatMap((record) => record.message.content.map((block) => ({ block, time: record.timestamp })));
}

function hitsFor(block, context) {
  if (block.type !== 'tool_result' || !block.is_error) return [];
  const use = context.uses.get(block.tool_use_id);
  if (!use) return [];
  const text = resultText(block);
  const applies = ([, family]) => use.name === family.tool && family.pattern.test(text) && (!family.subagent || context.isSubagent);
  return context.families.filter(applies).map(([id]) => ({ id, input: use.input, time: use.time }));
}

function refusalsIn(file, families) {
  const context = { uses: new Map(), families, isSubagent: file.split(path.sep).includes('subagents') };
  const found = [];
  for (const { block, time } of blocksOf(file)) {
    if (block.type === 'tool_use') context.uses.set(block.id, { name: block.name, input: block.input, time });
    found.push(...hitsFor(block, context));
  }
  return found;
}

function cutCorpus(seen, families) {
  const corpus = {};
  for (const [id, family] of families) {
    const hits = [...seen.get(id).values()];
    const observed = hits.map((hit) => hit.time).sort()[0] ?? null;
    const firstLive = family.firstLive ? new Date(family.firstLive).toISOString() : observed;
    const inputs = hits.filter((hit) => !firstLive || hit.time >= firstLive).map((hit) => hit.input);
    corpus[id] = { firstLive, inputs };
  }
  return corpus;
}

function keepEarliest(kept, hit) {
  const key = String(hit.input?.[FAMILIES[hit.id].key] ?? JSON.stringify(hit.input));
  const earlier = kept.get(hit.id).get(key);
  if (!earlier || hit.time < earlier.time) kept.get(hit.id).set(key, hit);
}

export function extract(projectsDir, only) {
  const families = Object.entries(FAMILIES).filter(([id]) => !only || id === only);
  const kept = new Map(families.map(([id]) => [id, new Map()]));
  const hits = listJsonl(projectsDir).flatMap((file) => refusalsIn(file, families));
  for (const hit of hits) keepEarliest(kept, hit);
  return cutCorpus(kept, families);
}

const ruleIdOf = (text) => GUARD_RULES.find((row) => row.rule && text.includes(row.rule))?.id;

function refusalTexts(file, since) {
  const isRefusal = ({ block, time }) => block.type === 'tool_result' && block.is_error && !(since && time < since);
  return blocksOf(file).filter(isRefusal).map(({ block }) => resultText(block));
}

export function countRefusals(projectsDir, since) {
  const counts = {};
  const texts = listJsonl(projectsDir).flatMap((file) => refusalTexts(file, since));
  for (const id of texts.map(ruleIdOf).filter(Boolean)) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}

function treeDir(spec, label) {
  if (spec === 'HEAD') return ROOT;
  if (spec) return path.resolve(spec);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `guard-replay-${label}-`));
  const archive = spawnSync('git', ['-C', ROOT, 'archive', BASE_REF], { maxBuffer: 1 << 28 });
  spawnSync('tar', ['-x', '-C', dir], { input: archive.stdout });
  const modules = path.join(ROOT, 'node_modules');
  if (fs.existsSync(modules)) fs.symlinkSync(modules, path.join(dir, 'node_modules'));
  return dir;
}

function classify(run) {
  if (run.status !== 0 && run.status !== 2) return 'error';
  const out = parseLine(run.stdout || '{}') || {};
  const decision = out.hookSpecificOutput || {};
  if (decision.permissionDecision === 'deny' || run.status === 2) return 'deny';
  return decision.updatedInput ? 'rewrite' : 'pass';
}

function replayOne(setup, input) {
  const { tree, family, cwd } = setup;
  const payload = {
    hook_event_name: 'PreToolUse',
    tool_name: family.tool,
    tool_input: input,
    cwd,
    session_id: 'guard-replay',
    permission_mode: 'bypassPermissions',
    ...(family.subagent ? { agent_id: 'guard-replay-worker', agent_type: 'general-purpose' } : {})
  };
  const run = spawnSync('node', [path.join(tree, 'hooks', family.hook)], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    cwd,
    env: { ...process.env, CLAUDE_PROJECT_DIR: cwd, CLAUDE_PLUGIN_ROOT: tree },
    timeout: 15000
  });
  return classify(run);
}

export function replay(tree, familyId, inputs) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-replay-cwd-'));
  spawnSync('git', ['init', '-q'], { cwd });
  const setup = { tree, family: FAMILIES[familyId], cwd };
  const tally = { deny: 0, rewrite: 0, pass: 0, error: 0 };
  for (const input of inputs) tally[replayOne(setup, input)]++;
  return tally;
}

const fmt = (tally) => Object.entries(tally).map(([name, count]) => `${name}=${count}`).join(' ');

export function report(corpus, options) {
  const lines = [];
  for (const [id, entry] of Object.entries(corpus)) {
    if (options.only && id !== options.only) continue;
    lines.push(`${id}: firstLive=${entry.firstLive} unique=${entry.inputs.length}`);
    lines.push(`  base      ${fmt(replay(options.baseTree, id, entry.inputs))}`);
    lines.push(`  candidate ${fmt(replay(options.candidateTree, id, entry.inputs))}`);
  }
  return lines.join('\n');
}

function printCounts(args, projects) {
  const counts = countRefusals(projects, flagValue(args, '--since'));
  for (const [id, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`${id} ${count}`);
}

function main(args) {
  const projects = flagValue(args, '--projects') || path.join(os.homedir(), '.claude', 'projects');
  if (args.includes('--counts')) return printCounts(args, projects);
  const only = flagValue(args, '--family');
  if (only && !FAMILIES[only]) throw new Error(`unknown family ${only}`);
  const corpusPath = flagValue(args, '--corpus') || path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'guard-corpus-')), 'corpus.json');
  const corpus = args.includes('--reuse') ? JSON.parse(fs.readFileSync(corpusPath, 'utf8')) : extract(projects, only);
  fs.writeFileSync(corpusPath, JSON.stringify(corpus));
  const baseTree = treeDir(flagValue(args, '--base'), 'base');
  const candidateTree = treeDir(flagValue(args, '--candidate') || 'HEAD', 'candidate');
  console.log(`corpus ${corpusPath}`);
  console.log(report(corpus, { baseTree, candidateTree, only }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF) main(process.argv.slice(2));
