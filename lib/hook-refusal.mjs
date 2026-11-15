import fs from 'node:fs';
import process from 'node:process';
import { tmpStateFile } from './basics.mjs';
import { denyReason, guardKind, guardRepeats, rulePart } from './guard-rules.mjs';
import { readHookText } from './hook-input.mjs';

const stateFile = (sessionId) => `${tmpStateFile('refusals', sessionId)}.json`;

function normalizeCall({ tool_name: tool, tool_input: input }) {
  const text = JSON.stringify(input ?? {}).replace(/\s+/g, ' ').toLowerCase();
  return `${tool}:${text}`;
}

function readHits(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function countHit({ session_id: sessionId, tool_name: tool, tool_input: input }, guard, guardText) {
  const file = stateFile(sessionId);
  const hits = readHits(file);
  const key = `${guard}|${normalizeCall({ tool_name: tool, tool_input: input })}`;
  hits[key] = (hits[key] ?? 0) + 1;
  if (hits[key] === 1) hits[`first|${key}`] = guardText;
  fs.writeFileSync(file, JSON.stringify(hits));
  return { hit: hits[key], first: hits[`first|${key}`] };
}

export function refusalText(hookInput, { guard, guardText }) {
  if (!hookInput?.session_id) return guardText;
  const { hit, first } = countHit(hookInput, guard, guardText);
  if (hit === 1) return guardText;
  if (hit === 2) return denyReason('repeat-refusal', '', { first: (first ?? guardText).replace(/\.$/, '') });
  return denyReason('repeat-stop');
}

function firstNote({ session_id: sessionId }, id) {
  if (!sessionId) return true;
  const file = stateFile(sessionId);
  const hits = readHits(file);
  const key = `note|${id}`;
  if (hits[key]) return false;
  hits[key] = 1;
  fs.writeFileSync(file, JSON.stringify(hits));
  return true;
}

const FIXED_RULES = ['context-lead', 'run-no-wait'];

const ROUTE = /Do instead: ([\s\S]+?)\.?$/;
const remembered = new WeakSet();

const isFixed = (reason) => FIXED_RULES.some((id) => reason.startsWith(rulePart(id)));

function rememberedReason(hookInput, reason, guard) {
  const text = String(reason ?? '');
  if (isFixed(text)) return text;
  return refusalText(hookInput, { guard, guardText: text, route: ROUTE.exec(text)?.[1] });
}

function rewritten(hookInput, output, guard) {
  const fields = output.hookSpecificOutput;
  if (fields?.permissionDecision === 'deny') {
    const permissionDecisionReason = rememberedReason(hookInput, fields.permissionDecisionReason, guard);
    return { ...output, hookSpecificOutput: { ...fields, permissionDecisionReason } };
  }
  if (output.decision === 'block') return { ...output, reason: rememberedReason(hookInput, output.reason, guard) };
  return output;
}

export function rememberRefusal(hookInput, output, { guard }) {
  if (!output || typeof output !== 'object' || remembered.has(output)) return output;
  const sent = rewritten(hookInput, output, guard);
  remembered.add(sent);
  return sent;
}

export function writeHookOutput(hookInput, output, guard) {
  const sent = rememberRefusal(hookInput, output, { guard });
  if (sent) process.stdout.write(`${JSON.stringify(sent)}\n`);
}

export async function runHook(guard, decide) {
  try {
    const text = await readHookText();
    const input = text.trim() === '' ? null : JSON.parse(text);
    writeHookOutput(input, input && await decide(input), guard);
  } catch {
    process.exitCode = 0;
  }
}

const deny = (reason) => ({ hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: reason } });

function kindOrNull(id) {
  try {
    return guardKind(id);
  } catch {
    return null;
  }
}

const warn = (reason) => ({ hookSpecificOutput: { additionalContext: reason } });


function refuse(id, reason, hookInput = null) {
  const kind = kindOrNull(id);
  if (kind === null) return null;
  if (kind === 'hard') return deny(reason);
  if (hookInput && !guardRepeats(id) && !firstNote(hookInput, id)) return null;
  return warn(reason);
}

const ruleDeny = (rule, reason, params) => ({ rule, deny: denyReason(rule, reason, params) });

const ruleNote = (rule, reason, params) => ({ rule, note: denyReason(rule, reason, params) });

const refuseFields = (id, reason, hookInput) => refuse(id, reason, hookInput)?.hookSpecificOutput ?? null;

export { refuse, refuseFields, ruleDeny, ruleNote, warn };
