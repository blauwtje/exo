// Guards build's *Done* verdict: a report that claims Done needs a test or
// product run that went green after the build turn's last edit. An edit is a
// Write, Edit, MultiEdit or NotebookEdit call, or a Bash call that lands or
// merges work: land-task.mjs, or git merge, cherry-pick, apply, am, pull or
// rebase. A run qualifies when it is a test runner, a verify.mjs run, a start
// script, or a call a `Proof: <command or MCP tool> -> <result>` line names, and
// went green: no tool error, no nonzero `Exit code` and no failing count. When
// the project's package.json, the hook cwd's, else the one at the root of the
// git checkout holding the cwd, names a `bin` or `scripts.start`, only a product
// run qualifies: a test runner or verify.mjs run never does, named or not. A
// named call whose output holds the Proof's quote also qualifies, so an
// intended error exit can prove; a named call never qualifies when its command
// names input this session wrote. Commands match after dropping a leading
// `cd <dir> &&`, every `2>&1`, a trailing `| tail`, `head`, `grep` or `tee`
// filter, quotes and extra whitespace; a quote matches as a substring of the
// output after the same cleanup. A Done report blocks first when a Proof's
// quote contradicts every call of its command: a success claim for a failed
// run, or a labeled count, such as `pass 6` against `pass 5`, the output never
// shows. A report that claims no Done passes with a qualifying run, a Proof
// line or an `Unverified: <reason>` line.
//
//   node proof-check.mjs stop   Stop hook: stdin is the hook JSON
//
// The report judged is the Stop input's `last_assistant_message`, else the
// transcript's last text row. Silent unless the exo:build skill was called
// since the last message the human typed, so it never fires for a later
// unrelated turn. Only that build call's turn is checked. After BLOCK_CEILING
// blocks in one build turn a report that would block ends the turn with a
// systemMessage naming what stayed unverified, never as Done, so this never
// loops. Also silent while a background task the session launched has not
// notified, since the turn then ends to wait. A hook failure never blocks the
// turn.

import fs from 'node:fs';
import path from 'node:path';
import { hasPendingBackgroundTask } from '#background-tasks';
import { readHookText } from '#hook-input';
import { isMain } from '#script-flags';
import { mcpToolCall } from '#mcp-tool-call';
import { packageEntryPoints } from '#package-entry-point';

const BUILD_SKILL = /(^|:)build$/i;
const TEST_RUNNER = /^(npm(?:\s+run)?\s+test\S*|pnpm\s+test\S*|yarn\s+test\S*|bun\s+test\S*|node\s+--test\b|jest\b|vitest\b|mocha\b|pytest\b|go\s+test\b|cargo\s+test\b)/i;
const VERIFY_RUN = /^node\s+\S*\bverify\.mjs\b/;
const START_RUN = /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?start\b/i;
// A Bash call that changes the checkout: it lands a task or merges commits.
const BASH_EDIT = /\bland-task\.mjs\b|\bgit\s+(?:-C\s+\S+\s+)?(?:merge|cherry-pick|apply|am|pull|rebase)(?![\w-])/;
const FILE_EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const EXIT_FAILURE = /(^|\n)Exit code [1-9]/;
const ANSI_ESCAPE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`, 'g');
// A labeled count, label first (`pass 5`, `fail: 0`, `FAIL=0`) unless the
// number labels the next word (`Tests: 1 failed`), else number first (`4 passed`).
const LABELED_COUNT = /\b([A-Za-z]+)\b[\s:=]*(\d+(?:\.\d+)?)(?!\.?\d)(?!\s+[A-Za-z]+\b(?![\s:=]*\d))|(\d+(?:\.\d+)?)\s+([A-Za-z]+)\b/g;
const SUCCESS_WORD = /\b(?:pass(?:e[sd]|ing)?|ok|green|succe(?:ss(?:ful(?:ly)?)?|ed(?:ed|s)?))\b|[✓✔]/i;
// A Proof line, optionally bulleted and bold: `- **Proof:** <body>`.
const PROOF_LINE = /^\s*(?:[-*]\s+)?(?:\*\*)?Proof(?:\*\*)?:(?:\*\*)?\s*(.*)$/;
const UNVERIFIED_LINE = /^\s*(?:[-*]\s+)?(?:\*\*)?Unverified(?:\*\*)?:(?:\*\*)?\s*(\S.*)$/;
const MCP_TOOL_NAME = /^mcp__.+?__(.+)$/;
// Proof-check blocks per build turn, so a model that never backs its proofs
// cannot loop the turn forever; past it the turn ends with a systemMessage.
const BLOCK_CEILING = 5;

function entries(transcriptPath) {
  let text;
  try {
    text = fs.readFileSync(transcriptPath, 'utf8');
  } catch {
    return [];
  }
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      // A partial trailing line is skipped, never fatal.
    }
  }
  return rows;
}

function contentBlocks(entry) {
  const content = entry?.message?.content;
  return Array.isArray(content) ? content : [];
}

function textOf(entry) {
  return contentBlocks(entry)
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n');
}

// A row's text: its string content, else its text blocks joined.
function messageText(entry) {
  const content = entry.message?.content;
  return typeof content === 'string' ? content : textOf(entry);
}

function isBuildCall(block) {
  if (block?.type !== 'tool_use' || block.name !== 'Skill') return false;
  const skill = typeof block.input?.skill === 'string' ? block.input.skill : '';
  return BUILD_SKILL.test(skill);
}

// A user row the human typed, not one the harness wrote: a tool result, a
// meta row (the skill body injected after a Skill call, Stop hook feedback,
// caveats, wakeups), a compact summary or a background-task notification.
// Older rows lack the origin fields and isMeta, so their text is checked too.
function isTypedMessage(entry) {
  if (entry?.type !== 'user') return false;
  if (entry.isMeta === true || entry.isCompactSummary === true) return false;
  if (entry.origin?.kind === 'task-notification' || entry.turnOrigin === 'task_notification') return false;
  if (contentBlocks(entry).some((block) => block?.type === 'tool_result')) return false;
  const text = messageText(entry).trimStart();
  return !text.startsWith('<task-notification>') && !text.startsWith('Stop hook feedback:');
}

// Text as compared: no ANSI codes, no quote characters, single spaces.
function normalizeText(text) {
  return text.replace(ANSI_ESCAPE, '').replace(/["'`‘’“”]/g, '').replace(/\s+/g, ' ').trim();
}

// A command as compared: without leading `cd <dir> &&` steps, `2>&1` or a
// trailing `| tail`, `head`, `grep` or `tee` filter, then normalized as text.
function normalizeCommand(command) {
  return normalizeText(command
    .replace(/`/g, '')
    .replace(/^\s*(?:cd\s+(?:"[^"]*"|'[^']*'|[^\s;&|]+)\s*(?:&&|;)\s*)+/, '')
    .replace(/2>&1/g, ' ')
    .replace(/(?<!\|)\|(?!\|)\s*(?:tail|head|grep|tee)\b[\s\S]*$/, ''));
}

// Every labeled count in text as { key, value }; the key is the lowercase
// label, `pass` or `fail` for any label starting so, else without one final `s`.
function labeledCounts(text) {
  return [...normalizeText(text).matchAll(LABELED_COUNT)].map((match) => {
    const label = (match[1] ?? match[4]).toLowerCase();
    const key = label.startsWith('pass') ? 'pass' : label.startsWith('fail') ? 'fail' : label.replace(/s$/, '');
    return { key, value: Number(match[2] ?? match[3]) };
  });
}

function isFailingCount({ key, value }) {
  return value > 0 && (key === 'fail' || key.startsWith('error'));
}

// A `not ok` line, or a fail or error count above 0 on a line that is no
// passing test's name.
function hasFailingCount(output) {
  return output.split('\n').some((rawLine) => {
    const line = normalizeText(rawLine);
    if (/^not ok\b/.test(line)) return true;
    if (/^(?:[✓✔]|ok\b)/.test(line)) return false;
    return labeledCounts(line).some(isFailingCount);
  });
}

function resultTextOf(block) {
  const content = block.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.filter((part) => part?.type === 'text' && typeof part.text === 'string').map((part) => part.text).join('\n');
  }
  return '';
}

// One pass over the build turn's main-thread tool calls, numbered in order:
// `calls` holds each foreground Bash call as { seq, command, output, green }
// and each MCP call as { seq, tool, output, green }; `lastEdit` is the number
// of the last edit, or -1.
function scanTurn(rows, skillIndex) {
  const results = new Map();
  for (const entry of rows) {
    for (const block of contentBlocks(entry)) {
      if (block?.type === 'tool_result' && typeof block.tool_use_id === 'string') {
        results.set(block.tool_use_id, { text: resultTextOf(block), isError: block.is_error === true });
      }
    }
  }
  const calls = [];
  let lastEdit = -1;
  let seq = 0;
  for (let index = skillIndex + 1; index < rows.length; index += 1) {
    if (rows[index]?.isSidechain === true) continue;
    for (const block of contentBlocks(rows[index])) {
      if (block?.type !== 'tool_use' || typeof block.name !== 'string') continue;
      seq += 1;
      const command = block.name === 'Bash' && typeof block.input?.command === 'string' ? block.input.command : null;
      if (FILE_EDIT_TOOLS.has(block.name) || (command !== null && BASH_EDIT.test(command))) lastEdit = seq;
      const result = results.get(block.id);
      const output = result?.text ?? '';
      const green = result !== undefined && !result.isError && !EXIT_FAILURE.test(output) && !hasFailingCount(output);
      if (command !== null && block.input.run_in_background !== true) calls.push({ seq, command: normalizeCommand(command), output, green });
      const mcpTool = block.name.match(MCP_TOOL_NAME);
      if (mcpTool) calls.push({ seq, tool: mcpTool[1], output, green });
    }
  }
  return { calls, lastEdit };
}

// A Bash command's redirection/copy destination: `> path`, `>> path`,
// `tee [-a] path`, `cp ... path`, `mv ... path`. Best-effort text parsing,
// not a shell parser: good enough to catch a fixture the session wrote.
// A cp/mv destination is the last argument of that simple command, so its
// arguments end at the next `;`, `&`, `|` or newline.
function bashDestinationPaths(command) {
  const destinations = [];
  for (const match of command.matchAll(/(?:^|[\s;&|])>{1,2}\s*(\S+)/g)) {
    destinations.push(match[1]);
  }
  const tee = command.match(/\btee\b\s+(?:-a\s+)?(\S+)/);
  if (tee) destinations.push(tee[1]);
  for (const copyOrMove of command.matchAll(/\b(?:cp|mv)\b[ \t]+([^;&|\n]+)/g)) {
    const args = copyOrMove[1].trim().split(/\s+/).filter((arg) => !arg.startsWith('-'));
    if (args.length > 0) destinations.push(args[args.length - 1]);
  }
  return destinations.map((destination) => destination.replace(/^['"]|['"]$/g, ''));
}

// Paths the session itself wrote after the build Skill call: a Write,
// Edit, MultiEdit or NotebookEdit target, or a Bash redirection/copy
// destination. Each carries the cwd of the entry that produced it (when the
// transcript has one) so a relative path can be resolved to absolute later.
function sessionWrittenPaths(rows, startIndex) {
  const written = [];
  for (let index = startIndex + 1; index < rows.length; index += 1) {
    const cwd = rows[index]?.cwd;
    for (const block of contentBlocks(rows[index])) {
      if (block?.type !== 'tool_use') continue;
      if (['Write', 'Edit', 'MultiEdit'].includes(block.name) && typeof block.input?.file_path === 'string') {
        written.push({ path: block.input.file_path, cwd });
      } else if (block.name === 'NotebookEdit' && typeof block.input?.notebook_path === 'string') {
        written.push({ path: block.input.notebook_path, cwd });
      } else if (block.name === 'Bash' && typeof block.input?.command === 'string') {
        for (const destination of bashDestinationPaths(block.input.command)) {
          written.push({ path: destination, cwd });
        }
      }
    }
  }
  return written;
}

// True once a written path resolves absolute, joined to the cwd the
// transcript recorded for the call that wrote it.
function absoluteForm(writtenPath, cwd) {
  if (path.isAbsolute(writtenPath)) return writtenPath;
  if (!cwd) return null;
  return path.join(cwd, writtenPath);
}

// The Proof command's standalone words, split on whitespace and shell
// punctuation; a `--flag=value` word also yields `value`.
function commandTokens(command) {
  const tokens = [];
  for (const word of command.split(/[\s;&|<>()'"`]+/)) {
    if (!word) continue;
    tokens.push(word);
    const assigned = word.slice(word.indexOf('=') + 1);
    if (word.includes('=') && assigned) tokens.push(assigned);
  }
  return tokens;
}

// Only the Proof line's command counts as input; the product's own output
// naming a written path is not the issue this guards against. A token names a
// written path when it equals it as written, or both resolve to one absolute
// path, a relative token resolved against the cwd the path was written from.
function proofNamesWrittenInput(command, writtenPaths) {
  const tokens = commandTokens(command);
  return writtenPaths.some(({ path: writtenPath, cwd }) => {
    const absolute = absoluteForm(writtenPath, cwd);
    return tokens.some((token) => {
      if (token === writtenPath) return true;
      if (absolute === null) return false;
      if (path.isAbsolute(token)) return path.normalize(token) === path.normalize(absolute);
      return Boolean(cwd) && path.join(cwd, token) === path.normalize(absolute);
    });
  });
}

function claimsDone(text) {
  return text.split('\n').some((line) => {
    const trimmed = line.trim();
    return /^\**Done\b/i.test(trimmed) || /\bis done\b/i.test(trimmed);
  });
}

// Opens every block reason and the ceiling systemMessage; a Stop hook
// feedback row holding it is a proof-check block.
const FEEDBACK_MARKER = 'exo proof-check:';
const MISSING_UNVERIFIED = `${FEEDBACK_MARKER} The report has no Proof line backed by a product command this session ran and no Unverified line. Run the product's entry point or MCP tool on real input in this build turn and report one "Proof: <command or MCP tool> -> <output line>" per proof, or report "Unverified: <reason>".`;
const NO_GREEN_RUN = 'The report claims Done, but no test or product run went green after the last edit.';
const NO_GREEN_RUN_FIX = 'Run the tests, or the product\'s entry point or MCP tool on real input, after the last edit, then report "Proof: <command or MCP tool> -> <result>", or report "Unverified: <reason>" without claiming Done.';
const CONTRADICTION_FIX = 'Quote the result that run printed, or rerun it and quote the new one.';

// Splits a Proof line's body at its first `->` or `→` outside a backtick
// span, else at its first one anywhere; null when it has none.
function splitAtArrow(body) {
  let inCode = false;
  for (let index = 0; index < body.length; index += 1) {
    if (body[index] === '`') inCode = !inCode;
    if (inCode) continue;
    if (body.startsWith('->', index)) return [body.slice(0, index), body.slice(index + 2)];
    if (body[index] === '→') return [body.slice(0, index), body.slice(index + 1)];
  }
  const arrow = body.match(/->|→/);
  return arrow ? [body.slice(0, arrow.index), body.slice(arrow.index + arrow[0].length)] : null;
}

// The command of a Proof line's pre-arrow text: a leading backtick span when
// text follows it, such as a `(label)`, else the whole text.
function commandOf(beforeArrow) {
  const span = beforeArrow.trim().match(/^`([^`]+)`\s+\S/);
  return normalizeCommand(span ? span[1] : beforeArrow);
}

// Every Proof line of the report as { line, command, quote }; a line with no
// arrow is all command with an empty quote. The quote loses one wrapping pair
// of backticks.
function proofLines(text) {
  const proofs = [];
  for (const line of text.split('\n')) {
    const match = line.match(PROOF_LINE);
    if (!match) continue;
    const parts = splitAtArrow(match[1]);
    proofs.push({
      line: match[1].trim(),
      command: parts ? commandOf(parts[0]) : normalizeCommand(match[1]),
      quote: parts ? parts[1].trim().replace(/^`(.*)`$/, '$1') : ''
    });
  }
  return proofs;
}

function hasUnverifiedLine(text) {
  return text.split('\n').some((line) => UNVERIFIED_LINE.test(line));
}

// The MCP tool a Proof command names: its first word, without an `mcp:`
// prefix, or the `<tool>` of a full `mcp__<server>__<tool>` name.
function mcpToolOf(command) {
  const word = command.split(' ')[0].replace(/^mcp:/, '');
  return word.match(MCP_TOOL_NAME)?.[1] ?? word;
}

// The calls a Proof command names: Bash calls of that command unless it names
// an MCP tool, else, or with none, the calls of its MCP tool.
function matchingCalls(command, calls) {
  if (mcpToolCall(command) === null) {
    const bash = calls.filter((call) => call.command === command);
    if (bash.length > 0) return bash;
  }
  const tool = mcpToolOf(command);
  return calls.filter((call) => call.tool === tool);
}

function quoteInOutput(quote, output) {
  return normalizeText(output).includes(normalizeText(quote));
}

function isSuccessClaim(quote) {
  const counts = labeledCounts(quote);
  if (counts.some(isFailingCount)) return false;
  return SUCCESS_WORD.test(quote) || counts.some(({ key, value }) => key === 'fail' && value === 0);
}

function countsByKey(lines) {
  const byKey = new Map();
  for (const line of lines) {
    for (const { key, value } of labeledCounts(line)) byKey.set(key, [...(byKey.get(key) ?? []), value]);
  }
  return byKey;
}

// True when the quote contradicts this call: a success claim for a run that
// failed, or, when the output lacks the quote, a label both count with no
// number in common.
function contradicts(quote, call) {
  if (!call.green && isSuccessClaim(quote)) return true;
  if (quoteInOutput(quote, call.output)) return false;
  const printed = countsByKey(call.output.split('\n'));
  return [...countsByKey([quote])].some(([key, values]) => printed.has(key) && !values.some((value) => printed.get(key).includes(value)));
}

function isCheckRun(call) {
  return call.command !== undefined && [TEST_RUNNER, VERIFY_RUN, START_RUN].some((pattern) => pattern.test(call.command));
}

function isTestRun(command) {
  return command !== undefined && (TEST_RUNNER.test(command) || VERIFY_RUN.test(command));
}

// The directory whose package.json says how the project runs: the cwd when it
// holds one, else the root of the git checkout holding the cwd, else null.
function projectDirectory(cwd) {
  if (fs.existsSync(path.join(cwd, 'package.json'))) return cwd;
  for (let directory = cwd; path.dirname(directory) !== directory; directory = path.dirname(directory)) {
    if (fs.existsSync(path.join(directory, '.git'))) return directory;
  }
  return null;
}

// The entry points of the project's package.json; empty when it names none or is missing.
function projectEntryPoints(cwd) {
  const directory = projectDirectory(cwd);
  return (directory === null ? null : packageEntryPoints(directory)) ?? [];
}

// A named call qualifies once green, or holding its quote, after the last
// edit, unless the Proof command names input this session wrote.
function namesQualifyingRun(proof, lastEdit, writtenPaths) {
  if (proofNamesWrittenInput(proof.command, writtenPaths)) return false;
  const quoted = normalizeText(proof.quote) !== '';
  return proof.matching.some((call) => call.seq >= lastEdit && (call.green || (quoted && quoteInOutput(proof.quote, call.output))));
}

function proofProblem(proof, writtenPaths, entryPoints) {
  const quoted = `The Proof line "${proof.line.slice(0, 80)}"`;
  if (proof.matching.length === 0) return `${quoted} names a command or MCP tool this build turn never ran.`;
  if (entryPoints.length > 0 && isTestRun(proof.command)) return `${quoted} names a test run, not the product.`;
  if (proofNamesWrittenInput(proof.command, writtenPaths)) {
    return `${quoted} ran the product on input this session wrote, not the repository's or the user's real input.`;
  }
  return `${quoted} has no green run after the last edit.`;
}

// The block reason's opening and fix: a package with entry points needs a
// product run, else any test or product run does.
function noGreenRunText(entryPoints) {
  if (entryPoints.length === 0) return [NO_GREEN_RUN, NO_GREEN_RUN_FIX];
  const runs = entryPoints.map((entryPoint) => `\`${entryPoint}\``).join(' or ');
  return [
    `The report claims Done, but no product run went green after the last edit; this package names a bin or start script, so it needs a green run of ${runs}, and a test run does not count.`,
    `Run ${runs} on real input after the last edit, then report "Proof: <command> -> <result>", or report "Unverified: <reason>" without claiming Done.`
  ];
}

// The report's outcome: null when it may end the turn, else the block reason
// and the commands of the Proof lines that left it unproven. With entry points
// a test run never qualifies.
function verdict(report, rows, skillIndex, entryPoints) {
  const { calls, lastEdit } = scanTurn(rows, skillIndex);
  const writtenPaths = sessionWrittenPaths(rows, skillIndex);
  const proofs = proofLines(report).map((proof) => ({ ...proof, matching: matchingCalls(proof.command, calls) }));
  const counts = (command) => entryPoints.length === 0 || !isTestRun(command);
  const qualifying = calls.some((call) => call.seq >= lastEdit && call.green && isCheckRun(call) && counts(call.command))
    || proofs.some((proof) => counts(proof.command) && namesQualifyingRun(proof, lastEdit, writtenPaths));
  if (!claimsDone(report)) {
    return qualifying || proofs.length > 0 || hasUnverifiedLine(report) ? null : { reason: MISSING_UNVERIFIED, named: [] };
  }
  const contradicted = proofs.filter((proof) => proof.matching.length > 0 && proof.matching.every((call) => contradicts(proof.quote, call)));
  if (contradicted.length > 0) {
    const problems = contradicted.map((proof) => `The Proof line "${proof.line.slice(0, 80)}" quotes a result its run contradicts.`);
    return { reason: [FEEDBACK_MARKER, ...problems, CONTRADICTION_FIX].join(' '), named: contradicted.map((proof) => proof.command) };
  }
  if (qualifying) return null;
  const problems = proofs.map((proof) => proofProblem(proof, writtenPaths, entryPoints));
  const [opening, fix] = noGreenRunText(entryPoints);
  return { reason: [FEEDBACK_MARKER, opening, ...problems, fix].join(' '), named: proofs.map((proof) => proof.command) };
}

// The last assistant text in rows from the build call up to endIndex, or ''.
function lastReportBefore(rows, endIndex, skillIndex) {
  for (let index = endIndex - 1; index >= skillIndex; index -= 1) {
    if (rows[index]?.type !== 'assistant') continue;
    const text = textOf(rows[index]);
    if (text) return text;
  }
  return '';
}

// The indexes of the Stop hook feedback rows after the build call that carry a proof-check block.
function proofCheckBlockIndexes(rows, skillIndex) {
  const indexes = [];
  for (let index = skillIndex + 1; index < rows.length; index += 1) {
    if (rows[index]?.type !== 'user') continue;
    const text = messageText(rows[index]);
    if (text.trimStart().startsWith('Stop hook feedback:') && text.includes(FEEDBACK_MARKER)) indexes.push(index);
  }
  return indexes;
}

// The Stop hook output object: a block, the ceiling's systemMessage, or null to let the turn end.
export function stopHook(input) {
  if (hasPendingBackgroundTask(input.transcript_path)) return null;
  const rows = entries(input.transcript_path);
  const typedIndex = rows.findLastIndex(isTypedMessage);
  const skillIndex = rows.findLastIndex((entry) => contentBlocks(entry).some(isBuildCall));
  if (skillIndex === -1 || skillIndex < typedIndex) return null;

  // Claude Code runs the Stop hook before it appends the final reply to the
  // transcript, so the transcript's last text row is the previous reply.
  const lastMessage = input.last_assistant_message;
  const report = typeof lastMessage === 'string' && lastMessage.trim() ? lastMessage : lastReportBefore(rows, rows.length, skillIndex);
  if (!report) return null;
  const outcome = verdict(report, rows, skillIndex, projectEntryPoints(input.cwd || process.cwd()));
  if (outcome === null) return null;
  if (proofCheckBlockIndexes(rows, skillIndex).length < BLOCK_CEILING) return { decision: 'block', reason: outcome.reason };
  const named = outcome.named.length > 0 ? `Unverified: ${outcome.named.join(', ')} (no matching call after ${BLOCK_CEILING} blocks)` : `no Proof line backs its Done claim after ${BLOCK_CEILING} blocks`;
  return { systemMessage: `${FEEDBACK_MARKER} report not verified; ${named}` };
}

export function stopOutput(input) {
  const output = stopHook(input);
  return output === null ? '' : `${JSON.stringify(output)}\n`;
}

const OUTPUTS = { stop: stopOutput };

if (isMain(import.meta.url)) {
  const command = process.argv[2];
  const output = OUTPUTS[command];
  if (output === undefined) {
    process.stderr.write("proof-check: the first argument is 'stop'\n");
    process.exitCode = 2;
  } else {
    try {
      process.stdout.write(output(JSON.parse((await readHookText()) || '{}')));
    } catch {
      // A missing transcript or unreadable input leaves nothing to check.
    }
  }
}
