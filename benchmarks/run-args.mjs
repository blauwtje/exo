import { beforePluginProblem, resolveDirectory, withBeforeArm } from './plugin-copies.mjs';
import { ARMS, CALIBRATION_TASKS, DEFAULT_ARMS, GIT_TASKS, MODELS, SAFE_TASKS, SMOKE_TASKS, TEMPLATE_TASKS, VALUE_QUICK_TASKS } from './tasks.mjs';
import { loadValueTasks, parseSpendCap } from './value.mjs';

const FULL_RUNS = 4;
const STOCK_RUNS = 3;
const QUICK_CAP_USD = 1;
export const TIERS = { template: TEMPLATE_TASKS, safe: SAFE_TASKS, git: GIT_TASKS, calibration: CALIBRATION_TASKS };

export function tierTasks(tier) {
  if (tier === 'value') return loadValueTasks();
  if (!(tier in TIERS)) throw new Error(`unknown tier ${tier}; one of ${[...Object.keys(TIERS), 'value'].join(', ')}`);
  return TIERS[tier];
}

export function parseArguments(argv) {
  const options = { mode: 'custom', tasks: null, tier: null, arms: DEFAULT_ARMS, runs: 1, model: 'haiku', concurrency: 2, maxTotalUsd: null, confirm: false, out: null, effort: null, dryRun: false, beforePlugin: null, stockBaseline: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => argv[++index];
    if (flag === '--smoke') options.mode = 'smoke';
    else if (flag === '--full') options.mode = 'full';
    else if (flag === '--confirm') options.confirm = true;
    else if (flag === '--tasks') options.tasks = value().split(',');
    else if (flag === '--tier') options.tier = value();
    else if (flag === '--arms') options.arms = value().split(',');
    else if (flag === '--runs') options.runs = Number(value());
    else if (flag === '--model') options.model = value();
    else if (flag === '--concurrency') options.concurrency = Number(value());
    else if (flag === '--max-total-usd') options.maxTotalUsd = parseSpendCap(value());
    else if (flag === '--out') options.out = value();
    else if (flag === '--effort') options.effort = value();
    else if (flag === '--dry-run') options.dryRun = true;
    else if (flag === '--before-plugin') options.beforePlugin = value();
    else if (flag === '--stock-baseline') options.stockBaseline = true;
    else throw new Error(`unknown flag ${flag}`);
  }
  if (options.stockBaseline) Object.assign(options, { mode: 'stock', tasks: VALUE_QUICK_TASKS, arms: ['baseline'], runs: STOCK_RUNS, model: 'sonnet' });
  if (options.tier === 'value' && options.mode === 'custom' && options.tasks === null) {
    const given = (flag) => argv.includes(flag);
    Object.assign(options, { mode: 'quick', tasks: VALUE_QUICK_TASKS, concurrency: 1 });
    if (!given('--arms')) options.arms = ['exo'];
    if (!given('--model')) options.model = 'sonnet';
    if (options.maxTotalUsd === null) options.maxTotalUsd = QUICK_CAP_USD;
  }
  if (options.tier !== null) options.tasks = options.tasks ?? tierTasks(options.tier).map((task) => task.id);
  if (options.mode === 'smoke') options.tasks = options.tasks ?? SMOKE_TASKS;
  if (options.mode === 'full') {
    options.tasks = options.tasks ?? [...TEMPLATE_TASKS, ...SAFE_TASKS].map((task) => task.id);
    if (!argv.includes('--runs')) options.runs = FULL_RUNS;
  }
  if (options.tasks === null) throw new Error('name --tasks or --tier, or pick --smoke or --full');
  if (options.tasks.length === 0) throw new Error(`tier ${options.tier} has no tasks`);
  if (!(options.model in MODELS)) throw new Error(`unknown model ${options.model}; one of ${Object.keys(MODELS).join(', ')}`);
  const problem = beforePluginProblem(options.beforePlugin, options.arms);
  if (problem !== null) throw new Error(problem);
  if (options.beforePlugin !== null) options.beforePlugin = resolveDirectory(options.beforePlugin);
  options.armTable = withBeforeArm(ARMS, options.beforePlugin);
  for (const arm of options.arms) if (!(arm in options.armTable)) throw new Error(`unknown arm ${arm}`);
  return options;
}
