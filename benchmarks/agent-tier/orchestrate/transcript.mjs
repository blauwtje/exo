import path from 'node:path';
import { escaped, idPattern, ownedLines } from './grade.mjs';

const DISPATCH_TOOLS = new Set(['Agent', 'Task']);
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);
const TEST_RUN = /\b(?:npm\s+(?:run\s+)?test|npm\s+t|node\s+--test)\b/;
const READ_VERB = /\b(?:cat|grep|rg|sed|head|tail|awk|nl|less|bat)\b/;
const RESULT_PATH = /\.exo\/orchestrate\/result\.md$/;
const RESULT_REDIRECT = /(?:>>?|\btee\b(?:\s+-a)?)\s*['"]?\S*\.exo\/orchestrate\/result\.md/;
const REOPENED = /\bBLOCKED\b|\breopen/i;

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

export function mainMessages(stdout) {
  const messages = new Map();
  for (const event of parsedEvents(stdout)) {
    if (event.type !== 'assistant' || event.parent_tool_use_id) continue;
    const id = event.message?.id;
    if (!id) continue;
    const calls = (event.message.content ?? []).filter((block) => block?.type === 'tool_use').map(({ name, input }) => ({ name, input: input ?? {} }));
    messages.set(id, [...(messages.get(id) ?? []), ...calls]);
  }
  return [...messages.values()].map((calls, index) => ({ index, calls }));
}

const markersOf = (id, files) => [id, ...(files?.[id] ? [path.basename(files[id])] : [])];

function firstAt(text, markers) {
  const hits = markers.map((marker) => text.search(idPattern(marker))).filter((at) => at >= 0);
  return hits.length === 0 ? null : Math.min(...hits);
}

export function partOf(call, { ids, files, first }) {
  const text = `${call.input.description ?? ''}\n${call.input.prompt ?? ''}`;
  const named = ids.map((id) => ({ id, at: firstAt(text, markersOf(id, files)) })).filter((hit) => hit.at !== null);
  if (named.some((hit) => hit.id === first)) return first;
  named.sort((left, right) => left.at - right.at);
  return named[0]?.id ?? null;
}

function dispatches(messages, parts) {
  return messages.flatMap(({ index, calls }) => calls
    .filter((call) => DISPATCH_TOOLS.has(call.name))
    .map((call) => ({ index, part: partOf(call, parts) })));
}

function phaseFindings(messages, { parallel, dependent, files }) {
  const sent = dispatches(messages, { ids: [...parallel, dependent], files, first: dependent });
  const independent = sent.filter((each) => parallel.includes(each.part));
  const together = messages.some(({ index }) => new Set(independent.filter((each) => each.index === index).map((each) => each.part)).size >= 2);
  const findings = together ? [] : [`transcript: no message dispatches two of ${parallel.join(', ')} at once`];
  const later = sent.filter((each) => each.part === dependent).map((each) => each.index);
  if (later.length === 0) return [...findings, `transcript: ${dependent} never dispatched`];
  const lastIndependent = Math.max(-1, ...independent.map((each) => each.index));
  if (Math.min(...later) <= lastIndependent) findings.push(`transcript: ${dependent} dispatched before or with its prerequisites`);
  return findings;
}

function readsFile(call, file) {
  if (call.name === 'Read') return String(call.input.file_path ?? '').endsWith(file);
  if (call.name === 'Grep') return String(call.input.path ?? '').endsWith(file) || String(call.input.path ?? '').endsWith(file.split('/')[0]);
  if (call.name !== 'Bash') return false;
  const command = String(call.input.command ?? '');
  const named = command.includes(file) || command.includes(`${file.split('/')[0]}/*`);
  return named && READ_VERB.test(command) && !new RegExp(`>\\s*['"]?\\S*${escaped(file)}`).test(command);
}

function verifies(call, file) {
  return (call.name === 'Bash' && TEST_RUN.test(String(call.input.command ?? ''))) || readsFile(call, file);
}

function writesResult(call) {
  if (WRITE_TOOLS.has(call.name)) return RESULT_PATH.test(String(call.input.file_path ?? ''));
  return call.name === 'Bash' && RESULT_REDIRECT.test(String(call.input.command ?? ''));
}

const firstIndex = (messages, test) => messages.find(({ calls }) => calls.some(test))?.index ?? null;
const lastIndex = (messages, test) => messages.findLast(({ calls }) => calls.some(test))?.index ?? null;

function claimFindings(messages, resultText, { claim, next, files }) {
  const ids = [claim, next];
  const file = files[claim];
  const sent = dispatches(messages, { ids, files, first: next });
  const checked = firstIndex(messages, (call) => verifies(call, file));
  const nextSent = sent.find((each) => each.part === next)?.index ?? null;
  const finalWrite = lastIndex(messages, writesResult);
  const deadlines = [nextSent, finalWrite].filter((index) => index !== null);
  const findings = [];
  if (checked === null || deadlines.some((deadline) => checked >= deadline)) findings.push(`transcript: ${claim} claim not checked (npm test or ${file}) before ${next} dispatch or the final verdict`);
  const redispatched = sent.some((each) => each.part === claim);
  const owned = resultText === null ? [] : ownedLines(resultText, ids)[claim];
  const flagged = owned.some((entry) => REOPENED.test(entry.line));
  if (!redispatched && !flagged) findings.push(`transcript: ${claim} neither re-dispatched nor flagged BLOCKED or reopened in the result file`);
  return findings;
}

export function transcriptChecks(spec) {
  return (spec?.phases ? 2 : 0) + (spec?.claim ? 2 : 0);
}

export function transcriptFindings(stdout, resultText, spec) {
  const messages = mainMessages(stdout);
  return [
    ...(spec?.phases ? phaseFindings(messages, spec.phases) : []),
    ...(spec?.claim ? claimFindings(messages, resultText, spec.claim) : [])
  ];
}
