import process from 'node:process';
import { claudeArgs } from './run-session-args.mjs';
import { denyRules } from './run-session-rules.mjs';
import { planPrompt } from './run-prompts.mjs';

export function printDryRun(settings) {
  const { provider, cap, timeoutMs, chosen, order, sandbox, root, claude, sessionCap, pluginDir, taskAllow, tailAllow, planPath, plan, buildPrompt } = settings;
  const { model, effort } = provider;
  const first = order[0];
  process.stdout.write([
    `Provider: ${provider.name}`,
    `Model: ${model}`,
    `Effort: ${provider.asked} -> ${effort}`,
    'Env:', ...provider.shown.map(([variable, value]) => `  ${variable}=${value}`),
    `Caps: ${cap} iterations, ${timeoutMs / 60_000} minutes per session, ${provider.contextBudget} tokens of context per task`,
    `Session: ${chosen.mode}`,
    `Order: ${order.length === 0 ? 'every task has landed' : order.map((number) => `Task ${number}`).join(', ')}`,
    sandbox.enabled
      ? `Sandbox: on, writes in ${root}, network: ${sandbox.allowedDomains.length === 0 ? 'none' : sandbox.allowedDomains.join(', ')}`
      : `Sandbox: off (${sandbox.reason})`,
    `Spawn: ${[claude.command, ...claude.prefix].join(' ')} ${claudeArgs({ model, effort, budget: sessionCap === undefined ? undefined : String(sessionCap), allow: ['<allow>'], settings: sandbox.enabled ? '<sandbox settings>' : null, pluginDir, deny: denyRules({ planPath }) }).join(' ')}`,
    'Allow:', ...taskAllow.map((rule) => `  ${rule}`),
    'Allow in the tail:', ...tailAllow.filter((rule) => !taskAllow.includes(rule)).map((rule) => `  ${rule}`),
    'Deny:', ...denyRules({ planPath }).map((rule) => `  ${rule}`),
    `First prompt: ${first === undefined ? 'none: every task has landed, the script runs the review tail' : chosen.mode === 'plan' ? planPrompt({ plan, planPath, numbers: order, root, sandbox: sandbox.enabled }) : buildPrompt(first)}`,
    ''
  ].join('\n'));
}
