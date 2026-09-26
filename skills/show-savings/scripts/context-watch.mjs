#!/usr/bin/env node
// Tells the main session and the user when its context has reached the
// `context` setting, because the model gets no token
// count and the 1M window compacts only near its end. Before every tool call it
// reads the input, cache read and cache creation tokens of the last main-thread
// assistant turn; the notice goes out once per step, the threshold and each
// further STEP_THOUSANDS above it, and again after the figure falls back below
// the last notified step, as a compaction or /clear makes it. While the last exo
// skill the main thread loaded is a plan skill, the advice is to keep working. A
// delegate carries `agent_id` and holds a context of its own, so it is never
// measured.
//
// It runs inside the delegate-budget.mjs hook, which parses the PreToolUse input
// on every tool and calls watch() when the call carries no `agent_id`; run as a
// file, it reads that same hook JSON from stdin:
//
//   node context-watch.mjs
//
// It never decides a permission. A fault never blocks the tool call: a missing
// or torn transcript prints nothing, and any error exits 0 with nothing on stdout.

import fs, { realpathSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { SCHEMA, settingValue } from '#settings-store';
import { readHotSession, updateHotSession } from './record.mjs';
import { contextTokens, parsedEntry, readText } from './transcript-tail.mjs';

// The notice repeats once per this many thousand tokens above the threshold.
const STEP_THOUSANDS = 25;
// The transcript tail the skill search reads first, widened fourfold per miss.
const SKILL_TAIL_BYTES = 256 * 1024;
const SKILL_PREFIX = 'exo:';
const COMMAND_NAME = /<command-name>\/(exo:[^<\s]+)<\/command-name>/g;

// The resolution already reads an invalid stored value as the default; a lookup
// that fails outright, such as on a project file that is not JSON, does the same.
function thresholdThousands() {
  try {
    return settingValue('context');
  } catch {
    return SCHEMA.context.default;
  }
}

// Handoff is user-invoked, and the session hook points the fresh session at its file.
const HANDOFF_ADVICE = 'finish the current step, then tell the user to run `/exo:save-session` followed by `/clear`; an orchestrating run whose state lives in its own run file writes that file first and names it to the user';
// A plan run keeps its state in the plan file and the commits, so a compaction loses nothing.
const PLAN_ADVICE = 'keep working; the state lives in the plan file and the commits, and the harness compacts on its own';
const PLAN_SKILLS = new Set(['exo:run-plan']);

function mainSessionTokens(transcriptPath) {
  if (!fs.existsSync(transcriptPath)) return null;
  const descriptor = fs.openSync(transcriptPath, 'r');
  try {
    return contextTokens(descriptor, fs.fstatSync(descriptor).size, (entry) => entry.isSidechain !== true);
  } finally {
    fs.closeSync(descriptor);
  }
}

// The exo skills one main-thread entry loads, in order: a Skill tool call by the
// model, or a slash command the user typed, which the transcript records as a
// `<command-name>` tag in the user message.
function loadedSkills(entry) {
  if (entry?.isSidechain === true) return [];
  const content = entry?.message?.content;
  if (entry?.type === 'assistant' && Array.isArray(content)) {
    return content
      .filter((block) => block?.type === 'tool_use' && block.name === 'Skill' && typeof block.input?.skill === 'string')
      .map((block) => block.input.skill)
      .filter((skill) => skill.startsWith(SKILL_PREFIX));
  }
  if (entry?.type !== 'user') return [];
  const texts = typeof content === 'string' ? [content] : Array.isArray(content) ? content.filter((block) => block?.type === 'text').map((block) => block.text) : [];
  return texts.flatMap((text) => [...String(text).matchAll(COMMAND_NAME)].map((match) => match[1]));
}

// The last exo skill the main thread loaded, or null when it loaded none.
function activeSkill(transcriptPath) {
  const descriptor = fs.openSync(transcriptPath, 'r');
  try {
    const size = fs.fstatSync(descriptor).size;
    for (let want = SKILL_TAIL_BYTES; ; want *= 4) {
      const start = Math.max(size - want, 0);
      const lines = readText(descriptor, start, size - start).split('\n');
      const firstWhole = start === 0 ? 0 : 1;
      for (let index = lines.length - 1; index >= firstWhole; index -= 1) {
        if (!lines[index].includes('"Skill"') && !lines[index].includes('<command-name>/exo:')) continue;
        const skills = loadedSkills(parsedEntry(lines[index]));
        if (skills.length > 0) return skills[skills.length - 1];
      }
      if (start === 0) return null;
    }
  } finally {
    fs.closeSync(descriptor);
  }
}

// The step a figure has reached, in thousands of tokens, or null under the threshold.
function reachedStep(tokens, threshold) {
  const thousands = tokens / 1000;
  if (thousands < threshold) return null;
  return threshold + STEP_THOUSANDS * Math.floor((thousands - threshold) / STEP_THOUSANDS);
}

// True when this call is the first to reach `step`. The stored step follows the
// figure down as well as up, so a figure under it resets the watch; `warned`
// never resets, because route-skills' next-stage.mjs reads it as "a notice fired
// this session" to recommend stopping. The unlocked read keeps an unchanged
// step, the case on nearly every call, off the lock.
function claimStep(sessionId, step) {
  if ((readHotSession(sessionId)?.contextWatch?.notifiedStep ?? null) === step) return false;
  let claimed = false;
  updateHotSession(sessionId, (session) => {
    if ((session.contextWatch?.notifiedStep ?? null) === step) return false;
    session.contextWatch = { notifiedStep: step, warned: session.contextWatch?.warned === true || step !== null };
    claimed = step !== null;
    return true;
  });
  return claimed;
}

export function watch(hookInput) {
  if (typeof hookInput.agent_id === 'string') return;
  if (typeof hookInput.session_id !== 'string' || typeof hookInput.transcript_path !== 'string') return;
  const tokens = mainSessionTokens(hookInput.transcript_path);
  if (tokens === null) return;
  const threshold = thresholdThousands();
  if (!claimStep(hookInput.session_id, reachedStep(tokens, threshold))) return;
  const advice = PLAN_SKILLS.has(activeSkill(hookInput.transcript_path)) ? PLAN_ADVICE : HANDOFF_ADVICE;
  const notice = `exo: context ${Math.round(tokens / 1000)}k tokens, past ${threshold}k: ${advice}`;
  const output = { hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: notice }, systemMessage: notice };
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    watch(JSON.parse(fs.readFileSync(0, 'utf8')));
  } catch (error) {
    console.error(`context-watch: ${error.message}`);
  }
}
