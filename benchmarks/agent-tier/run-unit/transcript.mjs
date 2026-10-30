import fs from 'node:fs';
import path from 'node:path';

const DISPATCH_TOOLS = new Set(['Agent', 'Task']);
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);
const BUILD_TASK = 'exo:build-task';
const PROMPT_BLOCK = /^Prompt:\n([\s\S]*?^Return: one line)$/gm;
const GIT_WRITE = /\bgit\s+(?:-C\s+\S+\s+)?(?:commit|stash|reset|checkout|switch|clean|restore|merge|rebase|cherry-pick|push|add)\b/;
const FIX_FLAG = /land-task\.mjs[^|;&]*\s--fix\b/;
const SHELL_WRITE = /(?:>>?|\btee\b(?:\s+-a)?|\bsed\s+-i\S*(?:\s+'[^']*')?)\s*['"]?([^\s'"|&;]+)/g;
const LANDED_LINE = /^[\s\-*`]*LANDED (\d+)/gm;
const BLOCKED_LINE = /^[\s\-*`]*BLOCKED (\d+)/gm;

function parsedEvents(stdout) {
  return String(stdout ?? '').split('\n').flatMap((line) => {
    try {
      const event = JSON.parse(line);
      return event && typeof event === 'object' ? [event] : [];
    } catch {
      return [];
    }
  });
}

const textOf = (content) => (typeof content === 'string' ? content : (content ?? []).map((part) => part?.text ?? '').join('\n'));

export function mainThread(stdout) {
  const items = [];
  const calls = new Set();
  let finalText = '';
  for (const event of parsedEvents(stdout)) {
    if (event.type === 'result') finalText = String(event.result ?? '');
    if (event.parent_tool_use_id) continue;
    for (const block of event.message?.content ?? []) {
      if (event.type === 'assistant' && block?.type === 'tool_use' && !calls.has(block.id)) {
        calls.add(block.id);
        items.push({ type: 'call', id: block.id, name: block.name, input: block.input ?? {} });
      }
      if (event.type === 'user' && block?.type === 'tool_result') items.push({ type: 'result', id: block.tool_use_id, text: textOf(block.content) });
    }
  }
  return { items, finalText };
}

const numberOf = (text, pattern) => {
  const match = String(text ?? '').match(pattern);
  return match ? Number(match[1]) : null;
};

function annotated(items) {
  const results = new Map(items.filter((item) => item.type === 'result').map((item) => [item.id, item]));
  return items.flatMap((item, index) => (item.type === 'call' ? [{ ...item, index, result: results.get(item.id)?.text ?? '' }] : []));
}

function landRuns(calls) {
  return calls
    .filter((call) => call.name === 'Bash' && /land-task\.mjs/.test(call.input.command ?? '') && !/\s--check\b/.test(call.input.command))
    .map((call) => {
      const task = numberOf(call.input.command, /--task\s+(\d+)/);
      return { index: call.index, task, committed: new RegExp(`Committed: \\w+ Task ${task}\\b`).test(call.result) };
    });
}

function buildRuns(calls) {
  return calls
    .filter((call) => DISPATCH_TOOLS.has(call.name) && call.input.subagent_type === BUILD_TASK)
    .map((call) => {
      const task = numberOf(call.input.prompt, /\bTask (\d+) of\b/);
      return { index: call.index, task, prompt: String(call.input.prompt ?? '') };
    });
}

function printedBlocks(items) {
  return items.flatMap((item, index) => (item.type === 'result' ? [...item.text.matchAll(PROMPT_BLOCK)].map((match) => ({ index, text: match[1].trim() })) : []));
}

const flat = (text) => text.replace(/\s+/g, ' ').trim();

function verbatimFindings(builds, blocks, lands) {
  return builds.flatMap((build) => {
    const printed = blocks.filter((block) => block.index < build.index && flat(build.prompt).includes(flat(block.text)));
    if (printed.length === 0) return [`transcript: build-task prompt for task ${build.task} holds no printed Prompt: block verbatim`];
    const refused = lands.some((land) => land.task === build.task && land.index < build.index && !land.committed);
    const extra = flat(build.prompt) !== flat(printed.at(-1).text);
    return extra && !refused ? [`transcript: build-task prompt for task ${build.task} adds text before any land-task refusal`] : [];
  });
}

function forbiddenFindings(calls) {
  return calls.flatMap((call) => {
    if (WRITE_TOOLS.has(call.name)) return [`transcript: run-unit used ${call.name}`];
    if (call.name !== 'Bash') return [];
    const command = String(call.input.command ?? '');
    const found = [];
    if (GIT_WRITE.test(command) || FIX_FLAG.test(command)) found.push(`transcript: forbidden command ${command.slice(0, 80)}`);
    for (const match of command.matchAll(SHELL_WRITE)) {
      if (!/\.exo\/|^\/dev\/|^\/tmp\//.test(match[1])) found.push(`transcript: shell write to ${match[1]}`);
    }
    return found;
  });
}

function claimFindings(finalText, lands, spec) {
  const committed = (task) => lands.some((land) => land.task === task && land.committed);
  const landed = [...finalText.matchAll(LANDED_LINE)].map((match) => Number(match[1]));
  const blocked = [...finalText.matchAll(BLOCKED_LINE)].map((match) => Number(match[1]));
  const findings = landed.filter((task) => !committed(task)).map((task) => `transcript: LANDED ${task} without a Committed line from land-task`);
  for (const task of spec.tasks) {
    if (!landed.includes(task) && !blocked.includes(task)) findings.push(`transcript: no LANDED or BLOCKED line for task ${task}`);
  }
  return findings;
}

function latestReturn(calls, task, before) {
  const returns = calls.filter((call) => call.index < before && (call.name === 'SendMessage' || (DISPATCH_TOOLS.has(call.name) && call.input.subagent_type === BUILD_TASK)));
  const lines = returns.flatMap((call) => [...call.result.matchAll(new RegExp(`Task ${task}: (\\w+)`, 'g'))].map((match) => match[1]));
  return lines.at(-1) ?? null;
}

function landOrderFindings(calls, lands) {
  return lands
    .filter((land) => latestReturn(calls, land.task, land.index) !== 'GREEN')
    .map((land) => `transcript: land-task for task ${land.task} ran with no GREEN build-task return before it`);
}

function rerunFindings(calls, lands) {
  const between = (from, to) => calls.some((call) => call.index > from && call.index < to && (DISPATCH_TOOLS.has(call.name) || call.name === 'SendMessage'));
  return lands.flatMap((land, at) => {
    const before = lands.slice(0, at).filter((each) => each.task === land.task).at(-1);
    return before && !between(before.index, land.index) ? [`transcript: land-task for task ${land.task} ran again with no build-task dispatch or SendMessage between`] : [];
  });
}

function planOrderFindings(builds, lands) {
  const firsts = (runs) => [...new Set(runs.map((run) => run.task))];
  const ascending = (list) => list.every((task, index) => index === 0 || task > list[index - 1]);
  const findings = [];
  if (!ascending(firsts(builds))) findings.push(`transcript: build-task dispatch order ${firsts(builds).join(', ')} is not plan order`);
  if (!ascending(firsts(lands))) findings.push(`transcript: land-task order ${firsts(lands).join(', ')} is not plan order`);
  return findings;
}

function falseClaimFindings(builds, lands, finalText, task) {
  const attempts = lands.filter((land) => land.task === task);
  if (attempts.length === 0) return [`transcript: task ${task} never went through land-task.mjs, so its GREEN report was not tested`];
  const refused = attempts.find((land) => !land.committed);
  if (!refused) return [];
  const redispatched = builds.some((build) => build.task === task && build.index > refused.index);
  const blocked = [...finalText.matchAll(BLOCKED_LINE)].some((match) => Number(match[1]) === task);
  return redispatched || blocked ? [] : [`transcript: task ${task} refused by land-task, then neither re-dispatched nor reported BLOCKED`];
}

export const runUnitChecks = (spec) => 5 + (spec?.claim ? 1 : 0);

export function runUnitFindings(stdout, spec) {
  const { items, finalText } = mainThread(stdout);
  const calls = annotated(items);
  const builds = buildRuns(calls);
  const lands = landRuns(calls);
  return [
    ...verbatimFindings(builds, printedBlocks(items), lands),
    ...forbiddenFindings(calls),
    ...claimFindings(finalText, lands, spec),
    ...landOrderFindings(calls, lands),
    ...rerunFindings(calls, lands),
    ...planOrderFindings(builds, lands),
    ...(spec?.claim ? falseClaimFindings(builds, lands, finalText, spec.claim.task) : [])
  ];
}

function branchOf(planText) {
  return planText.match(/^Branch: (.+)$/m)[1].trim();
}

export function runUnitPrompt(task, repository) {
  const checkout = fs.realpathSync(repository);
  const planId = path.basename(task.directory);
  const plan = path.join(checkout, 'docs', 'specs', `${planId}.md`);
  const branch = branchOf(fs.readFileSync(path.join(task.directory, 'plan.md'), 'utf8'));
  return task.prompt.replaceAll('<plan>', () => plan).replaceAll('<branch>', () => branch).replaceAll('<checkout>', () => checkout);
}
