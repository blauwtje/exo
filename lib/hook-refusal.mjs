import process from 'node:process';
import { denyReason, guardKind, rulePart } from './guard-rules.mjs';
import { EVIDENCE_RULES } from './evidence-rules.mjs';
import { firstNote, refusalText } from './refusal-memory.mjs';

const FIXED_RULES = ['context-hard', 'context-lead', 'run-no-wait'];

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

const deny = (reason) => ({ hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: reason } });

function kindOrNull(id) {
  try {
    return guardKind(id);
  } catch {
    return null;
  }
}

const warn = (reason) => ({ hookSpecificOutput: { additionalContext: reason } });

const repeats = (id) => EVIDENCE_RULES.some((row) => row.id === id && row.repeat);

function refuse(id, reason, hookInput = null) {
  const kind = kindOrNull(id);
  if (kind === null) return null;
  if (kind === 'hard') return deny(reason);
  if (hookInput && !repeats(id) && !firstNote(hookInput, id)) return null;
  return warn(reason);
}

const ruleDeny = (rule, reason, params) => ({ rule, deny: denyReason(rule, reason, params) });

const refuseFields = (id, reason, hookInput) => refuse(id, reason, hookInput)?.hookSpecificOutput ?? null;

export { refuse, refuseFields, ruleDeny, warn };
