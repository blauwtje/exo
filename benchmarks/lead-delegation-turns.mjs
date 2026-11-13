import { isExoPath } from '../lib/live-shells.mjs';

export const MAX_WRITES = 2;
export const CONTEXT_FLOOR = 50_000;
const AGENT_TOOLS = new Set(['Agent', 'Task']);
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const DESIGN_REFERENCE = 'design-ui.md';

export function parseStream(text) {
  return text.split('\n').filter(Boolean).flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

function leadBlocks(events, type) {
  return events
    .filter((event) => event.type === type && !event.parent_tool_use_id)
    .flatMap((event) => event.message?.content ?? []);
}

function isProductFile(file) {
  return !isExoPath(file) && !file.split('/').includes('.claude');
}

const isResult = (event) => event.type === 'result';
const isBashWrite = (event) => event.type === 'lead_bash_write';

function toolCalls(events) {
  return leadBlocks(events, 'assistant').filter((block) => block.type === 'tool_use');
}

function productWrites(calls, bashLines) {
  const written = calls
    .filter((call) => WRITE_TOOLS.has(call.name))
    .map((call) => call.input?.file_path ?? call.input?.notebook_path);
  const bashed = bashLines.flatMap((event) => event.files ?? []);
  return new Set([...written, ...bashed].filter((file) => typeof file === 'string' && isProductFile(file)));
}

function contextSize(events) {
  const usage = events.find((event) => event.type === 'assistant' && !event.parent_tool_use_id)?.message?.usage;
  if (!usage) return null;
  return (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
}

const belowFloor = (context) => context !== null && context < CONTEXT_FLOOR;

function splitTurns(events) {
  const cut = events.filter(isResult).length >= 2 ? events.findIndex(isResult) + 1 : 0;
  const early = events.slice(0, cut);
  const earlyIds = new Set(toolCalls(early).map((call) => call.id));
  const bash = events.filter(isBashWrite);
  const inEarly = (line) => line.tool_use_id !== undefined && earlyIds.has(line.tool_use_id);
  return {
    history: cut > 0,
    early: { calls: toolCalls(early), bash: bash.filter(inEarly) },
    late: events.slice(cut).filter((event) => !isBashWrite(event)),
    lateBash: bash.filter((line) => !inEarly(line))
  };
}

export function scoreStream(events) {
  const { history, early, late, lateBash } = splitTurns(events);
  const calls = toolCalls(late);
  const designReads = calls.filter((call) => call.name === 'Read' && String(call.input?.file_path).endsWith(DESIGN_REFERENCE));
  const failedIds = new Set(leadBlocks(events, 'user').filter((block) => block.type === 'tool_result' && block.is_error).map((block) => block.tool_use_id));
  const results = events.filter(isResult);
  const last = results.at(-1);
  const agents = calls.filter((call) => AGENT_TOOLS.has(call.name)).length;
  const writes = productWrites(calls, lateBash).size;
  const context = history ? contextSize(late) : null;
  const denials = results.reduce((sum, result) => sum + (result.permission_denials?.length ?? 0), 0);
  return {
    agents,
    writes,
    readDesignUi: designReads.some((call) => !failedIds.has(call.id)),
    denials,
    cost: last?.total_cost_usd ?? 0,
    capped: last?.subtype === 'error_max_budget_usd',
    context,
    void: belowFloor(context) || denials > 0 || results.length === 0 || results.some((item) => item.api_error_status) || productWrites(early.calls, early.bash).size > 0,
    pass: agents >= 1 && writes <= MAX_WRITES
  };
}

export function verdictOf(score) {
  if (score.void) return 'VOID';
  const verdict = score.pass ? 'PASS' : 'FAIL';
  return score.capped ? `${verdict} CAPPED` : verdict;
}
