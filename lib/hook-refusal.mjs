import process from 'node:process';
import { rulePart } from './guard-rules.mjs';
import { refusalText } from './refusal-memory.mjs';

export const FIXED_RULES = ['context-hard', 'context-lead', 'run-no-wait'];

const ROUTE = /Do instead: ([\s\S]+?)\.?$/;
const remembered = new WeakSet();

const isFixed = (reason) => FIXED_RULES.some((id) => reason.startsWith(rulePart(id)));

export function rememberedReason(hookInput, reason, guard) {
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
