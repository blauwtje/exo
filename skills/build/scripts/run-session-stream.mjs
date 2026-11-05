import { sumCounts, usageCounts } from '#token-weights';
import { realpathOr } from './run-session-paths.mjs';

const denialText = (denial) => denial.tool_input?.command ?? `${denial.tool_name} ${JSON.stringify(denial.tool_input ?? {})}`;
export const deniedFields = (parsed) => ({ denied: parsed.denials.map(denialText), refused: parsed.refusals.map(denialText) });

export function parseStream(text) {
  const events = [];
  for (const line of text.split(/\r?\n/)) {
    try {
      const event = JSON.parse(line);
      if (event !== null && typeof event === 'object') events.push(event);
    } catch {
    }
  }
  const init = events.find((event) => event.type === 'system' && event.subtype === 'init') ?? null;
  const results = events.filter((event) => event.type === 'result');
  const final = results.at(-1) ?? null;
  const denials = new Map();
  for (const result of results) {
    for (const denial of result.permission_denials ?? []) {
      if (!denials.has(denial.tool_use_id)) denials.set(denial.tool_use_id, denial);
    }
  }
  const ruleDenied = new Set(events.filter((event) => event.type === 'system' && event.subtype === 'permission_denied').map((event) => event.tool_use_id));
  const calledIds = new Set(events.filter((event) => event.type === 'assistant').flatMap((event) => event.message?.content ?? []).filter((block) => block?.type === 'tool_use').map((block) => block.id));
  const isRefusal = (denial) => calledIds.has(denial.tool_use_id) && !ruleDenied.has(denial.tool_use_id);
  const peakContext = Math.max(0, ...events.filter((event) => event.type === 'assistant').map((event) => {
    const usage = event.message?.usage ?? {};
    return (Number(usage.input_tokens) || 0) + (Number(usage.cache_read_input_tokens) || 0) + (Number(usage.cache_creation_input_tokens) || 0);
  }));
  const usageByCall = new Map();
  events.filter((event) => event.type === 'assistant' && event.message?.usage).forEach((event, index) => {
    usageByCall.set(event.message.id ?? index, event.message.usage);
  });
  // why: stream assistant events carry a partial output count; the result events' usage holds the real one.
  const resultOutput = results.reduce((sum, result) => sum + (Number(result.usage?.output_tokens) || 0), 0);
  const weightedTokens = sumCounts([...usageByCall.values()].map((usage) => ({ ...usageCounts(usage), output: 0 }))).weightedInput + resultOutput;
  const sumField = (field) => {
    const values = [...usageByCall.values()].map((usage) => usage[field]).filter((value) => typeof value === 'number');
    return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0);
  };
  const firstCreation = events.find((event) => event.type === 'assistant' && event.message?.usage)?.message.usage.cache_creation_input_tokens;
  const costs = results.map((result) => result.total_cost_usd).filter((cost) => typeof cost === 'number');
  return {
    init,
    final,
    resultText: typeof final?.result === 'string' ? final.result : '',
    subtype: typeof final?.subtype === 'string' ? final.subtype : null,
    turns: results.reduce((sum, result) => sum + (Number(result.num_turns) || 0), 0),
    cost: costs.at(-1) ?? 0,
    peakContext,
    model: typeof init?.model === 'string' ? init.model : null,
    weightedTokens,
    cacheRead: sumField('cache_read_input_tokens'),
    cacheWrite: sumField('cache_creation_input_tokens'),
    firstCacheWrite: typeof firstCreation === 'number' ? firstCreation : null,
    sessionId: init?.session_id ?? final?.session_id ?? null,
    hooks: events.filter((event) => event.type === 'system' && event.subtype === 'hook_started').length,
    denials: [...denials.values()].filter((denial) => !isRefusal(denial)),
    refusals: [...denials.values()].filter(isRefusal)
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
