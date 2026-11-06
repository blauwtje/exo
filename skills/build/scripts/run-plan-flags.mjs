import { UsageError } from '#script-flags';
import { DEFAULT_TIMEOUT_MINUTES } from './run-plan-usage.mjs';
import { numberFlag } from './run-plan-preflight.mjs';

export const RUN_PLAN_FLAG_KINDS = {
  root: 'value', provider: 'value', 'max-iterations': 'value', timeout: 'value', model: 'value', effort: 'value',
  'max-budget-usd': 'value', 'max-run-usd': 'value', session: 'value', claude: 'value', 'plugin-dir': 'value', 'dry-run': 'boolean'
};

export function requirePlanArgument(argument) {
  if (argument === undefined || argument.startsWith('--')) throw new UsageError('the first argument names the plan file');
  return argument;
}

export function runPlanOptions(flags, defaults = {}) {
  const sessionFlag = flags.session ?? 'auto';
  if (!['auto', 'task', 'plan'].includes(sessionFlag)) throw new UsageError("flag '--session' needs auto, task or plan");
  return {
    sessionFlag,
    maxIterations: numberFlag(flags['max-iterations'], 'max-iterations', { integer: true }),
    timeoutMs: (numberFlag(flags.timeout, 'timeout') ?? DEFAULT_TIMEOUT_MINUTES) * 60_000,
    sessionCap: numberFlag(flags['max-budget-usd'], 'max-budget-usd'),
    runCap: numberFlag(flags['max-run-usd'] ?? defaults.maxRunUsd, 'max-run-usd')
  };
}
