import { mean } from './basics.mjs';

const FAILED_LINE = /^(FAIL|UNPLANNED)/m;
const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);
const BUILD_TASK = 'exo:build-task';

function toolBlocks(entries) {
  return entries.flatMap((entry) => (Array.isArray(entry.message?.content) ? entry.message.content : []));
}

const isVerifyRun = (block) => block.type === 'tool_use' && block.name === 'Bash' && /(verify|gate)\.mjs/.test(String(block.input?.command));

const resultText = (content) => (Array.isArray(content) ? content.map((part) => part.text ?? '').join('\n') : String(content ?? ''));

export function verifyFailure(main) {
  const blocks = toolBlocks(main.entries);
  const last = blocks.filter(isVerifyRun).at(-1);
  if (!last) return 'verify gate not run';
  const result = blocks.findLast((block) => block.type === 'tool_result' && block.tool_use_id === last.id);
  if (!result || result.is_error || FAILED_LINE.test(resultText(result.content))) return 'verify gate failed';
  return null;
}

function toolUses(entries) {
  return toolBlocks(entries).filter((block) => block.type === 'tool_use');
}

export function callsBeforeFirstEdit(agent) {
  const index = toolUses(agent.entries).findIndex((block) => EDIT_TOOLS.has(block.name));
  return index < 0 ? null : index;
}

export function firstEditCalls(agents) {
  const counts = agents.filter((agent) => agent.type === BUILD_TASK).map(callsBeforeFirstEdit).filter((count) => count !== null);
  return counts.length ? mean(counts) : undefined;
}
