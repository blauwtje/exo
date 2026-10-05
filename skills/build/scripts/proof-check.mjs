// Guards build's *Done* verdict: a green test suite must never stand
// in for running the product on real input (see SKILL.md step 5). Blocks the
// turn at Stop when a `Proof: <command or MCP tool> -> <output>` line of the
// session's final report names a Bash command or MCP tool call this build turn
// did not make, or quotes output that call did not return. An unbacked proof,
// in this report or in one an earlier block of this build turn stopped, passes
// only as an `Unverified: <command> (<reason>)` line in a report that claims
// no Done. A report with no Proof line and no earlier unbacked proof blocks
// when it claims Done or lacks an `Unverified: <reason>` line.
//
//   node proof-check.mjs stop   Stop hook: stdin is the hook JSON
//
// The report judged is the Stop input's `last_assistant_message`, else the
// transcript's last text row. Silent unless the exo:build skill was called
// since the last message the human typed, so it never fires for a later
// unrelated turn. Only that build call's turn is checked. After BLOCK_CEILING blocks in one build turn a
// report that would block ends the turn with a systemMessage naming what
// stayed unverified, never as Done, so this never loops. Also silent while a
// background task the session launched has not notified, since the turn then
// ends to wait. A hook failure never blocks the turn.

import fs from 'node:fs';
import path from 'node:path';
import { hasPendingBackgroundTask } from '#background-tasks';
import { readHookText } from '#hook-input';
import { isMain } from '#script-flags';
import { mcpToolCall } from '#mcp-tool-call';

const BUILD_SKILL = /(^|:)build$/i;
const TEST_RUNNER_DENYLIST = /^(npm(?:\s+run)?\s+test\S*|pnpm\s+test\S*|yarn\s+test\S*|bun\s+test\S*|node\s+--test\b|jest\b|vitest\b|mocha\b|pytest\b|go\s+test\b|cargo\s+test\b)/i;
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

function normalizeCommand(command) {
  return command.replace(/`/g, '').trim().replace(/\s+/g, ' ');
}

function resultTextOf(block) {
  const content = block.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.filter((part) => part?.type === 'text' && typeof part.text === 'string').map((part) => part.text).join('\n');
  }
  return '';
}

// The product calls the session made after the build call: `bash` maps a
// normalized Bash command to its tool_result text (a later call to the same
// command overwrites), `mcp` maps an MCP tool name, `<tool>` of
// `mcp__<server>__<tool>`, to the tool_result text of every call to it.
function productCallsAfter(rows, startIndex) {
  const resultsByToolUseId = new Map();
  for (const entry of rows) {
    for (const block of contentBlocks(entry)) {
      if (block?.type === 'tool_result' && typeof block.tool_use_id === 'string') {
        resultsByToolUseId.set(block.tool_use_id, resultTextOf(block));
      }
    }
  }
  const bash = new Map();
  const mcp = new Map();
  for (let index = startIndex + 1; index < rows.length; index += 1) {
    for (const block of contentBlocks(rows[index])) {
      if (block?.type !== 'tool_use' || typeof block.name !== 'string') continue;
      const result = resultsByToolUseId.get(block.id) ?? '';
      if (block.name === 'Bash' && typeof block.input?.command === 'string') {
        bash.set(normalizeCommand(block.input.command), result);
      }
      const mcpTool = block.name.match(MCP_TOOL_NAME);
      if (mcpTool) mcp.set(mcpTool[1], [...(mcp.get(mcpTool[1]) ?? []), result]);
    }
  }
  return { bash, mcp };
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
const MISSING_PROOF = `${FEEDBACK_MARKER} The report claims Done with no Proof line backed by a product command this session ran. Run the product's entry point or MCP tool on real input in this build turn and report one "Proof: <command or MCP tool> -> <output line>" per proof, or report "Unverified: <reason>" without claiming Done.`;
const MISSING_UNVERIFIED = `${FEEDBACK_MARKER} The report has no Proof line backed by a product command this session ran and no Unverified line. Run the product's entry point or MCP tool on real input in this build turn and report one "Proof: <command or MCP tool> -> <output line>" per proof, or report "Unverified: <reason>".`;
const UNBACKED_FIX = 'Run each on real input and report "Proof: <command> -> <output line>", or turn each into "Unverified: <command> (<reason>)" and drop the Done claim.';

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

// Every Proof line of the report as { line, command, output }; command and
// output are null on a line with no arrow. Output loses one wrapping pair of
// backticks.
function proofLines(text) {
  const proofs = [];
  for (const line of text.split('\n')) {
    const match = line.match(PROOF_LINE);
    if (!match) continue;
    const parts = splitAtArrow(match[1]);
    proofs.push({
      line: match[1].trim(),
      command: parts ? commandOf(parts[0]) : null,
      output: parts ? parts[1].trim().replace(/^`(.*)`$/, '$1') : null
    });
  }
  return proofs;
}

// The MCP tool a Proof command names: its first word, without an `mcp:`
// prefix, or the `<tool>` of a full `mcp__<server>__<tool>` name.
function mcpToolOf(command) {
  const word = command.split(' ')[0].replace(/^mcp:/, '');
  return word.match(MCP_TOOL_NAME)?.[1] ?? word;
}

function proofProblem(proof, calls, writtenPaths) {
  const quoted = `The Proof line "${proof.line.slice(0, 80)}"`;
  if (proof.command === null) return `${quoted} has no "->" between its command and output.`;
  if (TEST_RUNNER_DENYLIST.test(proof.command)) return `${quoted} names a test runner, not the product.`;
  // A Proof naming an MCP tool, prefixed or known, is matched against that
  // tool's calls only, never a Bash call the shell could not run.
  const bashOutput = mcpToolCall(proof.command) === null ? calls.bash.get(proof.command) : undefined;
  if (bashOutput !== undefined) {
    if (proofNamesWrittenInput(proof.command, writtenPaths)) {
      return `${quoted} ran the product on input this session wrote, not the repository's or the user's real input.`;
    }
    return bashOutput.includes(proof.output) ? null : `${quoted} quotes output its Bash call did not print.`;
  }
  const tool = mcpToolOf(proof.command);
  const mcpResults = calls.mcp.get(tool);
  if (mcpResults !== undefined) {
    return mcpResults.some((result) => result.includes(proof.output)) ? null : `${quoted} quotes output no ${tool} call returned.`;
  }
  return `${quoted} names a command or MCP tool this build turn never ran.`;
}

// The command an Unverified line or Proof command names, for matching one to
// the other: its first word or MCP tool name, without `mcp:` or end punctuation.
function namedCommandKey(text) {
  return mcpToolOf(normalizeCommand(text)).replace(/[,:;.]+$/, '');
}

function unverifiedKeys(text) {
  const keys = new Set();
  for (const line of text.split('\n')) {
    const match = line.match(UNVERIFIED_LINE);
    if (match) keys.add(namedCommandKey(match[1]));
  }
  return keys;
}

// Every Proof line of a report as { command, problem }, checked against the
// calls in rows after the build call; problem is null for a backed proof. A
// line with no arrow stands for its command.
function assessProofs(text, rows, skillIndex) {
  const calls = productCallsAfter(rows, skillIndex);
  const writtenPaths = sessionWrittenPaths(rows, skillIndex);
  return proofLines(text).map((proof) => ({
    command: proof.command ?? normalizeCommand(proof.line),
    problem: proofProblem(proof, calls, writtenPaths)
  }));
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

// The commands of the unbacked proofs the report still owes: its own, plus
// those of each earlier blocked report that no backed Proof line now covers.
function unbackedCommands(current, rows, skillIndex, blockIndexes) {
  const backed = new Set(current.filter((proof) => proof.problem === null).map((proof) => proof.command));
  const unbacked = new Set(current.filter((proof) => proof.problem !== null).map((proof) => proof.command));
  for (const blockIndex of blockIndexes) {
    const earlier = lastReportBefore(rows, blockIndex, skillIndex);
    for (const proof of assessProofs(earlier, rows.slice(0, blockIndex), skillIndex)) {
      if (proof.problem !== null && !backed.has(proof.command)) unbacked.add(proof.command);
    }
  }
  return [...unbacked];
}

function quoteCommand(command) {
  return `"${command.slice(0, 80)}"`;
}

// The block reason for the report, or null when it may end the turn.
function blockReason(report, current, unbacked) {
  if (unbacked.length === 0) {
    if (current.length > 0) return null;
    if (claimsDone(report)) return MISSING_PROOF;
    return unverifiedKeys(report).size > 0 ? null : MISSING_UNVERIFIED;
  }
  const covered = unverifiedKeys(report);
  const missing = unbacked.filter((command) => !covered.has(namedCommandKey(command)));
  if (missing.length === 0) {
    return claimsDone(report) ? `${FEEDBACK_MARKER} Every unbacked proof has an Unverified line, but the report still claims Done; drop the Done claim.` : null;
  }
  const problems = current.filter((proof) => proof.problem !== null && missing.includes(proof.command)).map((proof) => proof.problem);
  return [FEEDBACK_MARKER, ...problems, `No call this build turn backs ${missing.map(quoteCommand).join(', ')}.`, UNBACKED_FIX].join(' ');
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
  const blockIndexes = proofCheckBlockIndexes(rows, skillIndex);
  const current = assessProofs(report, rows, skillIndex);
  const unbacked = unbackedCommands(current, rows, skillIndex, blockIndexes);
  const reason = blockReason(report, current, unbacked);
  if (reason === null) return null;
  if (blockIndexes.length < BLOCK_CEILING) return { decision: 'block', reason };
  const named = unbacked.length > 0 ? `Unverified: ${unbacked.join(', ')} (no matching call after ${BLOCK_CEILING} blocks)` : `no Proof line backs its Done claim after ${BLOCK_CEILING} blocks`;
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
