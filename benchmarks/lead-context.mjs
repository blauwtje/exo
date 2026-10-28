import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { transcriptFolder } from '#confine-claude';
import { contextLimit, contextSeries, softLimit } from '#context-limits';
import { UsageError, isMain, parseFlags } from '#script-flags';

const USAGE = `usage: node benchmarks/lead-context.mjs [--folder <transcript folder>] [--all]

Profiles the context of each lead session from local transcripts. It reads files only and makes no model call.
Default folder: the Claude Code transcript folder of the current directory.
Each listed session shows its peak tokens, assistant turns at or above the soft and hard limit, the compaction
points (compactMetadata.preTokens of each compact_boundary entry) and the share of added context tokens per stage.
The default lists only sessions whose peak reaches the soft limit; --all lists every session.
Exit codes: 0 done, 2 bad flag or missing transcript folder.`;

const STAGES = ['spec', 'next-task', 'unit', 'merge-reviews', 'other'];
const NODE_SCRIPT = (name) => new RegExp(`\\bnode\\b[^;&|\\n]*\\b${name}\\.mjs`);
const NEXT_TASK = NODE_SCRIPT('next-task');
const MERGE_REVIEWS = NODE_SCRIPT('merge-reviews');

function stageOfCall(call) {
  if (call.name === 'Skill' && call.input?.skill === 'exo:spec') return 'spec';
  if (call.name === 'Agent' && call.input?.subagent_type === 'exo:run-unit') return 'unit';
  if (call.name !== 'Bash') return 'other';
  if (NEXT_TASK.test(call.input?.command ?? '')) return 'next-task';
  if (MERGE_REVIEWS.test(call.input?.command ?? '')) return 'merge-reviews';
  return 'other';
}

const callsOf = (entry) => (entry.message?.content ?? []).filter((block) => block.type === 'tool_use');

function stageOfCalls(calls) {
  return calls.map(stageOfCall).find((stage) => stage !== 'other') ?? 'other';
}

const TYPED_SPEC = '<command-name>/exo:spec</command-name>';
const isTypedSpec = (entry) => entry.type === 'user' && JSON.stringify(entry.message?.content ?? '').includes(TYPED_SPEC);

function growthOf(tokens, previous, typedSpec) {
  if (!previous) return { stage: 'other', added: 0 };
  if (typedSpec) return { stage: 'spec', added: tokens - previous.tokens };
  return { stage: stageOfCalls(previous.calls), added: tokens - previous.tokens };
}

function countTurn(profile, tokens) {
  profile.peak = Math.max(profile.peak, tokens);
  if (tokens >= softLimit(contextLimit())) profile.pastSoft += 1;
  if (tokens >= contextLimit()) profile.pastHard += 1;
}

export function profileSession(file) {
  const stages = Object.fromEntries(STAGES.map((stage) => [stage, 0]));
  const profile = { peak: 0, pastSoft: 0, pastHard: 0, compactions: [], stages };
  let previous = null;
  let typedSpec = false;
  for (const { tokens, entry } of contextSeries(file)) {
    if (entry.type === 'system' && entry.subtype === 'compact_boundary') profile.compactions.push(entry.compactMetadata?.preTokens ?? 'unknown');
    if (isTypedSpec(entry)) typedSpec = true;
    if (tokens === null) continue;
    const id = entry.message?.id;
    const sameTurn = id !== undefined && id === previous?.id;
    if (sameTurn) profile.peak = Math.max(profile.peak, tokens);
    else countTurn(profile, tokens);
    const { stage, added } = growthOf(tokens, previous, typedSpec);
    if (added > 0) stages[stage] += added;
    typedSpec = false;
    previous = { tokens, id, calls: sameTurn ? [...previous.calls, ...callsOf(entry)] : callsOf(entry) };
  }
  return profile;
}

function shares(stages) {
  const total = Object.values(stages).reduce((sum, tokens) => sum + tokens, 0);
  return STAGES.map((stage) => `${stage} ${total === 0 ? 0 : Math.round((stages[stage] / total) * 100)}%`).join(' ');
}

function sessionLine(id, profile) {
  const compactions = profile.compactions.length === 0 ? 'none' : profile.compactions.join(',');
  return `session ${id} peak ${profile.peak} turns>=${softLimit(contextLimit()) / 1000}k ${profile.pastSoft} turns>=${contextLimit() / 1000}k ${profile.pastHard} compactions ${compactions} ${shares(profile.stages)}`;
}

function resolveFolder(flags) {
  if (flags.folder === undefined) {
    try {
      return transcriptFolder(fs.realpathSync(process.cwd()));
    } catch (error) {
      throw new UsageError(`${error.message}; pass --folder`);
    }
  }
  return flags.folder;
}

export function report({ folder, all }) {
  const names = fs.readdirSync(folder).filter((name) => name.endsWith('.jsonl')).sort();
  const profiles = names.map((name) => [name.slice(0, -'.jsonl'.length), profileSession(path.join(folder, name))]);
  const listed = profiles
    .filter(([, profile]) => profile.peak > 0 && (all || profile.peak >= softLimit(contextLimit())))
    .sort((a, b) => b[1].peak - a[1].peak);
  const added = Object.fromEntries(STAGES.map((stage) => [stage, profiles.reduce((sum, [, profile]) => sum + profile.stages[stage], 0)]));
  const compactions = profiles.reduce((sum, [, profile]) => sum + profile.compactions.length, 0);
  return [
    ...listed.map(([id, profile]) => sessionLine(id, profile)),
    `totals sessions ${profiles.length} listed ${listed.length} compactions ${compactions}`,
    `shares ${shares(added)}`
  ];
}

function main(argv) {
  const flags = parseFlags(argv, { folder: 'string', all: 'boolean' }, { usage: USAGE });
  const folder = resolveFolder(flags);
  if (!fs.existsSync(folder)) throw new UsageError(`no transcript folder at '${folder}'; pass --folder`);
  console.log(report({ folder, all: flags.all === true }).join('\n'));
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof UsageError ? `${error.message}\n${USAGE}` : error);
    process.exit(error instanceof UsageError ? 2 : 1);
  }
}
