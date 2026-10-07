// benchmarks/build-phases.mjs
// Splits a build cell's weighted tokens by phase from its kept transcript,
// the main thread and every subagent, so a cut can aim at the phase that
// costs most. Every API call lands in exactly one phase, so the phases sum
// to the cell's total from transcriptCalls.
//
//   node benchmarks/build-phases.mjs <project folder | transcript.jsonl>...
//
// A lead (main-thread) call takes the phase its turn is in; a subagent call
// takes its agent type's phase: build-task is `subagents`, review-branch
// `review`, fix-review `fix`. The lead's turn changes at these calls:
//   setup    the start, until the first build-task dispatch
//   wave     a build-task dispatch, until the lead has answered the last
//            build-task notification (then `other`) or a landing call comes first
//   landing  land-task.mjs, a cherry-pick, worktree removal, a diff save
//   verify   the verify skill, verify.mjs, a review or fix dispatch, and the
//            lead turns after them (the gate run, handling results)
//   retries  after a Stop-hook block, until a landing call, a build dispatch,
//            the verify skill or a review or fix dispatch
//   other    the rest; the lead's last call, the final report, always
// Known limit: a build-task that returns as a tool result, not as a task
// notification, never ends the wave; the first landing call then does.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sumCounts, usageCounts } from '#token-weights';

export const PHASES = ['setup', 'wave', 'subagents', 'landing', 'verify', 'retries', 'review', 'fix', 'other'];

const AGENT_PHASES = { 'build-task': 'subagents', 'review-branch': 'review', 'fix-review': 'fix' };
const LANDING = /\bnode\b[^|;&\n]*(?:land-task|remove-worktree)\.mjs|git (?:-C \S+ )?cherry-pick|git (?:-C \S+ )?worktree remove|\bdiff\b[^|;&]*>\s*\S*(?:\.patch|\.diff)\b/;
const NOTIFICATION = /<task-notification>.*?<tool-use-id>([^<]+)<\/tool-use-id>/g;

function parse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function agentKind(input) {
  const type = String(input?.subagent_type ?? '').replace(/^.*:/, '');
  return type === 'build-task' ? 'build' : type in AGENT_PHASES ? 'review' : null;
}

// What one lead message does to the turn's phase, or null when nothing.
function trigger(tools) {
  const found = [];
  for (const tool of tools) {
    const input = tool.input ?? {};
    if (tool.name === 'Agent' || tool.name === 'Task') {
      const kind = agentKind(input);
      if (kind === 'build') found.push({ to: 'wave', id: tool.id });
      else if (kind === 'review') found.push({ to: 'verify' });
    } else if (tool.name === 'Skill' && /(^|:)verify$/.test(input.skill ?? '')) {
      found.push({ to: 'verify' });
    } else if (tool.name === 'Bash') {
      const command = input.command ?? '';
      if (LANDING.test(command)) found.push({ to: 'landing' });
      else if (/\bnode\b[^|;&\n]*\bverify\.mjs/.test(command)) found.push({ to: 'verify', script: true });
    }
  }
  return found;
}

// The lead's phase per message id, from the main transcript in file order.
function leadPhases(mainFile) {
  const messages = new Map();
  const events = [];
  let index = 0;
  for (const line of fs.readFileSync(mainFile, 'utf8').split('\n')) {
    index += 1;
    if (line.includes('<task-notification>') || line.includes('hook_blocking_error') || line.includes('"assistant"')) {
      const entry = parse(line);
      if (entry?.type === 'assistant' && entry.message?.id) {
        const known = messages.get(entry.message.id) ?? { id: entry.message.id, index, tools: [] };
        for (const block of entry.message.content ?? []) {
          if (block.type === 'tool_use') known.tools.push(block);
        }
        messages.set(known.id, known);
      } else if (entry?.type === 'attachment' && entry.attachment?.type === 'hook_blocking_error' && entry.attachment.hookEvent === 'Stop') {
        events.push({ index, block: true });
      } else if (entry && entry.type !== 'assistant') {
        for (const found of line.matchAll(NOTIFICATION)) events.push({ index, returned: found[1] });
      }
    }
  }
  const timeline = [...messages.values(), ...events].sort((a, b) => a.index - b.index);
  const result = new Map();
  const waiting = new Set();
  let phase = 'setup';
  let answering = false;
  let last = null;
  for (const item of timeline) {
    if (item.block) {
      phase = 'retries';
    } else if (item.returned) {
      waiting.delete(item.returned);
      if (phase === 'wave' && waiting.size === 0) answering = true;
    } else {
      const first = trigger(item.tools).find((step) => !(step.script && phase === 'retries'));
      if (first) {
        phase = first.to;
        for (const tool of item.tools) if (agentKind(tool.input) === 'build') waiting.add(tool.id);
      }
      result.set(item.id, phase);
      if (answering) phase = 'other';
      answering = false;
      last = item.id;
    }
  }
  if (last !== null) result.set(last, 'other');
  return result;
}

function agentPhase(file) {
  try {
    const meta = JSON.parse(fs.readFileSync(file.replace(/\.jsonl$/, '.meta.json'), 'utf8'));
    return AGENT_PHASES[String(meta.agentType ?? '').replace(/^.*:/, '')] ?? 'other';
  } catch {
    return 'other';
  }
}

// Weighted tokens (weighted input plus output) per phase for one transcript.
// A message id repeated across files keeps its last one, as transcriptCalls does.
export function buildPhases(mainFile) {
  const calls = new Map();
  const files = [{ file: mainFile, phases: leadPhases(mainFile) }];
  const subagents = path.join(mainFile.replace(/\.jsonl$/, ''), 'subagents');
  if (fs.existsSync(subagents)) {
    for (const name of fs.readdirSync(subagents).sort()) {
      if (name.endsWith('.jsonl')) files.push({ file: path.join(subagents, name), phase: agentPhase(path.join(subagents, name)) });
    }
  }
  for (const { file, phases, phase } of files) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.includes('"assistant"')) continue;
      const entry = parse(line);
      const message = entry?.message;
      if (entry?.type !== 'assistant' || !message?.id || !message.usage) continue;
      calls.set(message.id, { counts: usageCounts(message.usage), phase: phases ? (phases.get(message.id) ?? 'other') : phase });
    }
  }
  const totals = Object.fromEntries(PHASES.map((name) => [name, 0]));
  for (const { counts, phase } of calls.values()) {
    const sum = sumCounts([counts]);
    totals[phase] += sum.weightedInput + sum.output;
  }
  return totals;
}

export function meanPhases(cells) {
  return Object.fromEntries(PHASES.map((name) => [name, cells.reduce((sum, cell) => sum + cell[name], 0) / cells.length]));
}

function transcriptOf(target) {
  if (target.endsWith('.jsonl')) return target;
  const names = fs.readdirSync(target).filter((name) => name.endsWith('.jsonl'));
  if (names.length !== 1) throw new Error(`${target}: expected one transcript, found ${names.length}`);
  return path.join(target, names[0]);
}

const sum = (phases) => Object.values(phases).reduce((total, value) => total + value, 0);

function row(label, value, total) {
  return `  ${label.padEnd(10)} ${String(Math.round(value)).padStart(9)}  ${((100 * value) / total).toFixed(1).padStart(5)}%`;
}

export function phaseReport(label, phases) {
  const total = sum(phases);
  const groups = {
    main: phases.setup + phases.wave + phases.landing + phases.retries + phases.other,
    subagents: phases.subagents,
    verify: phases.verify,
    'review+fix': phases.review + phases.fix
  };
  return [
    `${label}: ${Math.round(total)} weighted tokens`,
    ...PHASES.map((name) => row(name, phases[name], total)),
    ...Object.entries(groups).map(([name, value]) => row(name, value, total))
  ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const targets = process.argv.slice(2);
  if (targets.length === 0) {
    console.error('usage: node benchmarks/build-phases.mjs <project folder | transcript.jsonl>...');
    process.exit(2);
  }
  const cells = targets.map((target) => buildPhases(transcriptOf(target)));
  cells.forEach((cell, number) => console.log(`${phaseReport(`cell ${number + 1}`, cell)}\n`));
  console.log(phaseReport(`mean of ${cells.length} cells`, meanPhases(cells)));
}
