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

const SWITCHES = {
  '--smoke': { mode: 'smoke' },
  '--full': { mode: 'full' },
  '--confirm': { confirm: true },
  '--dry-run': { dryRun: true },
  '--stock-baseline': { stockBaseline: true },
};

const commaList = (value) => value.split(',');
const identity = (value) => value;

const VALUE_FLAGS = {
  '--tasks': ['tasks', commaList],
  '--tier': ['tier', identity],
  '--arms': ['arms', commaList],
  '--runs': ['runs', Number],
  '--model': ['model', identity],
  '--concurrency': ['concurrency', Number],
  '--max-total-usd': ['maxTotalUsd', parseSpendCap],
  '--out': ['out', identity],
  '--effort': ['effort', identity],
  '--before-plugin': ['beforePlugin', identity],
};

function defaultOptions() {
  return { mode: 'custom', tasks: null, tier: null, arms: DEFAULT_ARMS, runs: 1, model: 'haiku', concurrency: 2, maxTotalUsd: null, confirm: false, out: null, effort: null, dryRun: false, beforePlugin: null, stockBaseline: false };
}

function readFlags(argv) {
  const options = defaultOptions();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (Object.hasOwn(SWITCHES, flag)) {
      Object.assign(options, SWITCHES[flag]);
      continue;
    }
    if (!Object.hasOwn(VALUE_FLAGS, flag)) throw new Error(`unknown flag ${flag}`);
    const [key, convert] = VALUE_FLAGS[flag];
    index += 1;
    options[key] = convert(argv[index]);
  }
  return options;
}

function applyStockBaseline(options) {
  if (!options.stockBaseline) return;
  Object.assign(options, { mode: 'stock', tasks: VALUE_QUICK_TASKS, arms: ['baseline'], runs: STOCK_RUNS, model: 'sonnet' });
}

function applyValueQuick(options, argv) {
  if (options.tier !== 'value' || options.mode !== 'custom' || options.tasks !== null) return;
  Object.assign(options, { mode: 'quick', tasks: VALUE_QUICK_TASKS, concurrency: 1 });
  if (!argv.includes('--arms')) options.arms = ['exo'];
  if (!argv.includes('--model')) options.model = 'sonnet';
  if (options.maxTotalUsd === null) options.maxTotalUsd = QUICK_CAP_USD;
}

function applyFullDefaults(options, argv) {
  options.tasks = options.tasks ?? [...TEMPLATE_TASKS, ...SAFE_TASKS].map((task) => task.id);
  if (!argv.includes('--runs')) options.runs = FULL_RUNS;
}

function resolveTasks(options, argv) {
  if (options.tier !== null) options.tasks = options.tasks ?? tierTasks(options.tier).map((task) => task.id);
  if (options.mode === 'smoke') options.tasks = options.tasks ?? SMOKE_TASKS;
  if (options.mode === 'full') applyFullDefaults(options, argv);
  if (options.tasks === null) throw new Error('name --tasks or --tier, or pick --smoke or --full');
  if (options.tasks.length === 0) throw new Error(`tier ${options.tier} has no tasks`);
}

function checkModel(options) {
  if (!(options.model in MODELS)) throw new Error(`unknown model ${options.model}; one of ${Object.keys(MODELS).join(', ')}`);
}

function resolveArms(options) {
  const problem = beforePluginProblem(options.beforePlugin, options.arms);
  if (problem !== null) throw new Error(problem);
  if (options.beforePlugin !== null) options.beforePlugin = resolveDirectory(options.beforePlugin);
  options.armTable = withBeforeArm(ARMS, options.beforePlugin);
  for (const arm of options.arms) if (!(arm in options.armTable)) throw new Error(`unknown arm ${arm}`);
}

export function parseArguments(argv) {
  const options = readFlags(argv);
  applyStockBaseline(options);
  applyValueQuick(options, argv);
  resolveTasks(options, argv);
  checkModel(options);
  resolveArms(options);
  return options;
}
