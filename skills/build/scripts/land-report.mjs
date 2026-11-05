import { mcpToolCall } from '#mcp-tool-call';
import { LandingError, ReportMissingError } from './land-errors.mjs';
import { escapeRegExp } from './land-commit-block.mjs';

const ANY_OUTCOME_LINE = /^\s*(?:[-*]\s+)?(?:`([^`]+)`|(.+)):\s*(.*?)\s*$/;
const REPORT_FIELDS = new Set(['Landed', 'Proof', 'Unresolved']);
export const PROOF_TIMEOUT_MS = 540_000;
export const PROOF_TAIL_LINES = 20;
const RED_FIELD_LINE = /^\s*(?:[-*]\s+)?(?:Test first|Red):/;
function provedCommand(task, lines, reportPath) {
  if (task.proof !== null) return task.proof.replace(/^`(.*)`$/, '$1');
  for (const line of lines) {
    const match = line.match(ANY_OUTCOME_LINE);
    const command = match?.[1] ?? match?.[2];
    if (command !== undefined && match[3] !== '' && !REPORT_FIELDS.has(command)) return command;
  }
  throw new LandingError(`Task ${task.number}: no Proof: command, and the build report has no "<test>: pass" line${expectedLayout(task, reportPath)}`);
}

const FAILED_OUTCOME = /^fail(?:ed|s|ing)?\b/i;
const BARE_FAILED_OUTCOME = /^fail(?:ed)?(?:\s*\(.*\))?$/i;
const PROOF_FIELD_LINE = /^\s*(?:[-*]\s+)?Proof:\s*(.*)$/;
const SECTION_END_LINE = /^\s*(?:[-*]\s+)?(?:Landed|Unresolved|Report|Choice):/;

function proofSectionOf(lines) {
  const start = lines.findIndex((line) => PROOF_FIELD_LINE.test(line));
  const section = start === -1 ? lines : [lines[start].match(PROOF_FIELD_LINE)[1], ...lines.slice(start + 1)];
  const end = section.findIndex((line, index) => (start === -1 || index > 0) && SECTION_END_LINE.test(line));
  return end === -1 ? section : section.slice(0, end);
}

function refuseFailedCommand(task, lines) {
  for (const line of proofSectionOf(lines)) {
    const match = line.match(ANY_OUTCOME_LINE);
    const command = match?.[1] ?? match?.[2];
    if (command === undefined || REPORT_FIELDS.has(command)) continue;
    const failing = match[1] === undefined ? BARE_FAILED_OUTCOME : FAILED_OUTCOME;
    if (!failing.test(match[3])) continue;
    throw new LandingError(`Task ${task.number}: the build report lists "${command}: ${match[3]}" under Proof, no clear pass`);
  }
}

function expectedLayout(task, reportPath, command = null) {
  const written = command ?? (task.proof === null ? '<test command>' : task.proof.replace(/^`(.*)`$/, '$1'));
  const outcome = mcpProofOf(task) === null ? 'pass' : 'deferred';
  return `\nExpected under Proof: in ${reportPath}:\n${written}: ${outcome}`;
}

function reportLinesOf(task, reportText, reportPath) {
  if (reportText === null) {
    const wanted = task.proof === null ? 'a test for the Success criterion' : `"${task.proof}"`;
    throw new ReportMissingError(`Task ${task.number}: no build report at '${reportPath}' to prove ${wanted}${expectedLayout(task, reportPath)}`);
  }
  const lines = reportText.replace(/\r\n/g, '\n').split('\n');
  const kept = [];
  let redIndent = null;
  for (const line of lines) {
    const indent = line.length - line.trimStart().length;
    if (redIndent !== null && line.trim() !== '' && indent > redIndent) continue;
    redIndent = RED_FIELD_LINE.test(line) ? indent : null;
    if (redIndent === null) kept.push(line);
  }
  return kept;
}

function outcomesOf(command, lines) {
  const outcomeLine = new RegExp(`^(\\s*)(?:[-*]\\s+)?(?:Proof:\\s*)?\`?${escapeRegExp(command)}\`?:\\s*(.*?)\\s*$`);
  return lines.flatMap((line, index) => {
    const match = line.match(outcomeLine);
    return match === null ? [] : [{ outcome: match[2].toLowerCase(), indent: match[1].length, index }];
  });
}

export function mcpProofOf(task) {
  if (task.proof === null) return null;
  return mcpToolCall(task.proof.replace(/^`(.*)`$/, '$1'));
}

export function deferredProofOf(task, call, reportText, reportPath) {
  const lines = reportLinesOf(task, reportText, reportPath);
  const written = provedCommand(task, lines, reportPath);
  const outcomes = [...new Set([written, call])].flatMap((command) => outcomesOf(command, lines).map((entry) => ({ ...entry, command })));
  if (outcomes.length === 0) {
    throw new LandingError(`Task ${task.number}: the build report has no "${written}: deferred" line${expectedLayout(task, reportPath, written)}`);
  }
  const undeferred = outcomes.find(({ outcome }) => !/^deferred\b/.test(outcome));
  if (undeferred !== undefined) {
    throw new LandingError(`Task ${task.number}: the build report reads "${undeferred.command}: ${undeferred.outcome}", yet only the session runs an MCP tool Proof; report it deferred`);
  }
  refuseFailedCommand(task, lines);
  return call;
}

export function proofCommandOf(task, reportText, reportPath) {
  const lines = reportLinesOf(task, reportText, reportPath);
  const command = provedCommand(task, lines, reportPath);
  refuseFailedCommand(task, lines);
  return command;
}
