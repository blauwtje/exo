// Guards build's *Done* verdict: a green test suite must never stand
// in for running the product on real input (see SKILL.md step 5). Blocks the
// turn once, at Stop, when the session's final report claims Done without a
// `Proof: <command> -> <output>` line the transcript backs up, or an
// `Unverified: <reason>` line that makes no Done claim.
//
//   node proof-check.mjs stop   Stop hook: stdin is the hook JSON
//
// Silent outside a session that called the exo:build skill, and on
// stop_hook_active, so this never loops or fires for unrelated work. Also
// silent while a background task the session launched has not notified, since
// the turn then ends to wait. A hook failure never blocks the turn.

import fs from 'node:fs';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { hasPendingBackgroundTask } from '#background-tasks';
import { readHookText } from '#hook-input';

const BUILD_SKILL = /(^|:)build$/i;
const TEST_RUNNER_DENYLIST = /^(npm(?:\s+run)?\s+test\S*|pnpm\s+test\S*|yarn\s+test\S*|bun\s+test\S*|node\s+--test\b|jest\b|vitest\b|mocha\b|pytest\b|go\s+test\b|cargo\s+test\b)/i;
const PROOF_LINE = /^Proof:\s*(.+?)\s*->\s*(.+)$/m;
const UNVERIFIED_LINE = /^Unverified:\s*(.+)$/m;

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

function isBuildCall(block) {
  if (block?.type !== 'tool_use' || block.name !== 'Skill') return false;
  const skill = typeof block.input?.skill === 'string' ? block.input.skill : '';
  return BUILD_SKILL.test(skill);
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

// Bash commands the session ran after the build call, normalized
// command -> its tool_result text (later calls to the same command overwrite).
function bashOutputsAfter(rows, startIndex) {
  const resultsByToolUseId = new Map();
  for (const entry of rows) {
    for (const block of contentBlocks(entry)) {
      if (block?.type === 'tool_result' && typeof block.tool_use_id === 'string') {
        resultsByToolUseId.set(block.tool_use_id, resultTextOf(block));
      }
    }
  }
  const outputs = new Map();
  for (let index = startIndex + 1; index < rows.length; index += 1) {
    for (const block of contentBlocks(rows[index])) {
      if (block?.type === 'tool_use' && block.name === 'Bash' && typeof block.input?.command === 'string') {
        outputs.set(normalizeCommand(block.input.command), resultsByToolUseId.get(block.id) ?? '');
      }
    }
  }
  return outputs;
}

// A Bash command's redirection/copy destination: `> path`, `>> path`,
// `tee [-a] path`, `cp ... path`, `mv ... path`. Best-effort text parsing,
// not a shell parser: good enough to catch a fixture the session wrote.
function bashDestinationPaths(command) {
  const destinations = [];
  for (const match of command.matchAll(/(?:^|[\s;&|])>{1,2}\s*(\S+)/g)) {
    destinations.push(match[1]);
  }
  const tee = command.match(/\btee\b\s+(?:-a\s+)?(\S+)/);
  if (tee) destinations.push(tee[1]);
  const copyOrMove = command.match(/\b(?:cp|mv)\b\s+(.+)/);
  if (copyOrMove) {
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

// Only the Proof line's command counts as input; the product's own output
// naming a written path is not the issue this guards against.
function proofNamesWrittenInput(command, writtenPaths) {
  return writtenPaths.some(({ path: writtenPath, cwd }) => {
    if (command.includes(writtenPath)) return true;
    const absolute = absoluteForm(writtenPath, cwd);
    return absolute !== null && command.includes(absolute);
  });
}

function claimsDone(text) {
  return text.split('\n').some((line) => {
    const trimmed = line.trim();
    return /^\**Done\b/i.test(trimmed) || /\bis done\b/i.test(trimmed);
  });
}

const MISSING_PROOF = 'The report claims Done with no Proof line backed by a product command this session ran.';
const WRITTEN_INPUT = 'The Proof line ran the product on input this session wrote, not the repository\'s or the user\'s real input.';
const REASON_SUFFIX = ' Run the product\'s entry point on real input in this session and report "Proof: <command> -> <output line>", or report "Unverified: <reason>" without claiming Done.';

function verify(text, bashOutputs, writtenPaths) {
  const proof = text.match(PROOF_LINE);
  if (proof) {
    const command = normalizeCommand(proof[1]);
    const output = proof[2].trim();
    if (TEST_RUNNER_DENYLIST.test(command)) return 'The Proof line names a test runner, not the product.';
    if (proofNamesWrittenInput(command, writtenPaths)) return WRITTEN_INPUT;
    const ran = bashOutputs.get(command);
    if (ran !== undefined && ran.includes(output)) return null;
    return 'The Proof line\'s command or output does not match a Bash call this session ran.';
  }
  if (UNVERIFIED_LINE.test(text) && !claimsDone(text)) return null;
  return MISSING_PROOF;
}

export function stopOutput(input) {
  if (input.stop_hook_active === true) return '';
  if (hasPendingBackgroundTask(input.transcript_path)) return '';
  const rows = entries(input.transcript_path);
  const skillIndex = rows.findIndex((entry) => contentBlocks(entry).some(isBuildCall));
  if (skillIndex === -1) return '';

  let lastAssistantText = '';
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (rows[index]?.type !== 'assistant') continue;
    const text = textOf(rows[index]);
    if (text) {
      lastAssistantText = text;
      break;
    }
  }
  if (!lastAssistantText) return '';

  const problem = verify(lastAssistantText, bashOutputsAfter(rows, skillIndex), sessionWrittenPaths(rows, skillIndex));
  if (problem === null) return '';
  return `${JSON.stringify({ decision: 'block', reason: problem + REASON_SUFFIX })}\n`;
}

const OUTPUTS = { stop: stopOutput };

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
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
