import { parseLine } from '#basics';
import { realpathOr } from './run-session-paths.mjs';

const CACHE_READ_RATE = 0.1;
const CACHE_5M_RATE = 1.25;
const CACHE_1H_RATE = 2;

const COUNT_KEYS = ['input', 'cacheRead', 'cache5m', 'cache1h', 'output'];

function usageCounts(usage) {
  const creation = usage.cache_creation;
  return {
    input: usage.input_tokens ?? 0,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    cache5m: creation ? (creation.ephemeral_5m_input_tokens ?? 0) : (usage.cache_creation_input_tokens ?? 0),
    cache1h: creation ? (creation.ephemeral_1h_input_tokens ?? 0) : 0,
    output: usage.output_tokens ?? 0
  };
}

function sumCounts(countsList) {
  const totals = Object.fromEntries(COUNT_KEYS.map((key) => [key, 0]));
  for (const counts of countsList) {
    for (const key of COUNT_KEYS) totals[key] += counts[key] ?? 0;
  }
  totals.raw = totals.input + totals.cacheRead + totals.cache5m + totals.cache1h + totals.output;
  totals.weightedInput = totals.input
    + totals.cacheRead * CACHE_READ_RATE
    + totals.cache5m * CACHE_5M_RATE
    + totals.cache1h * CACHE_1H_RATE;
  return totals;
}

const denialText = (denial) => denial.tool_input?.command ?? `${denial.tool_name} ${JSON.stringify(denial.tool_input ?? {})}`;
export const deniedFields = (parsed) => ({ denied: parsed.denials.map(denialText), refused: parsed.refusals.map(denialText) });

function splitDenials(events, results) {
  const denials = new Map();
  for (const denial of results.flatMap((result) => result.permission_denials ?? [])) {
    if (!denials.has(denial.tool_use_id)) denials.set(denial.tool_use_id, denial);
  }
  const ruleDenied = new Set(events.filter((event) => event.type === 'system' && event.subtype === 'permission_denied').map((event) => event.tool_use_id));
  const calledIds = new Set(events.filter((event) => event.type === 'assistant').flatMap((event) => event.message?.content ?? []).filter((block) => block?.type === 'tool_use').map((block) => block.id));
  const isRefusal = (denial) => calledIds.has(denial.tool_use_id) && !ruleDenied.has(denial.tool_use_id);
  return {
    denials: [...denials.values()].filter((denial) => !isRefusal(denial)),
    refusals: [...denials.values()].filter(isRefusal)
  };
}

function usageFigures(events, results) {
  const peakContext = Math.max(0, ...events.filter((event) => event.type === 'assistant').map((event) => {
    const usage = event.message?.usage ?? {};
    return (Number(usage.input_tokens) || 0) + (Number(usage.cache_read_input_tokens) || 0) + (Number(usage.cache_creation_input_tokens) || 0);
  }));
  const usageByCall = new Map();
  events.filter((event) => event.type === 'assistant' && event.message?.usage).forEach((event, index) => {
    usageByCall.set(event.message.id ?? index, event.message.usage);
  });
  const resultOutput = results.reduce((sum, result) => sum + (Number(result.usage?.output_tokens) || 0), 0);
  const weightedTokens = sumCounts([...usageByCall.values()].map((usage) => ({ ...usageCounts(usage), output: 0 }))).weightedInput + resultOutput;
  const sumField = (field) => {
    const values = [...usageByCall.values()].map((usage) => usage[field]).filter((value) => typeof value === 'number');
    return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0);
  };
  const firstCreation = events.find((event) => event.type === 'assistant' && event.message?.usage)?.message.usage.cache_creation_input_tokens;
  return {
    peakContext,
    weightedTokens,
    cacheRead: sumField('cache_read_input_tokens'),
    cacheWrite: sumField('cache_creation_input_tokens'),
    inputTokens: sumField('input_tokens'),
    firstCacheWrite: typeof firstCreation === 'number' ? firstCreation : null
  };
}

export function parseStream(text) {
  const events = text.split(/\r?\n/).map(parseLine).filter((event) => event !== null && typeof event === 'object');
  const init = events.find((event) => event.type === 'system' && event.subtype === 'init') ?? null;
  const results = events.filter((event) => event.type === 'result');
  const final = results.at(-1) ?? null;
  const costs = results.map((result) => result.total_cost_usd).filter((cost) => typeof cost === 'number');
  return {
    init,
    final,
    resultText: typeof final?.result === 'string' ? final.result : '',
    subtype: typeof final?.subtype === 'string' ? final.subtype : null,
    turns: results.reduce((sum, result) => sum + (Number(result.num_turns) || 0), 0),
    cost: costs.at(-1) ?? 0,
    costKnown: costs.length > 0,
    model: typeof init?.model === 'string' ? init.model : null,
    sessionId: init?.session_id ?? final?.session_id ?? null,
    hooks: events.filter((event) => event.type === 'system' && event.subtype === 'hook_started').length,
    ...usageFigures(events, results),
    ...splitDenials(events, results)
  };
}

export function exoError(init, pluginRoot) {
  if (init === null) return null;
  const error = (init.plugin_errors ?? []).find((entry) => /^exo(@|$)/.test(String(entry.plugin ?? '')));
  if (error !== undefined) return error.message ?? error.type ?? 'plugin error';
  const entry = (init.plugins ?? []).find((plugin) => plugin.name === 'exo');
  if (entry === undefined) return 'no exo plugin in the init event';
  if (realpathOr(entry.path) !== realpathOr(pluginRoot)) return `exo loads from ${entry.path}, not ${pluginRoot}`;
  return null;
}
