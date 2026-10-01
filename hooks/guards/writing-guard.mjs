#!/usr/bin/env node
// PreToolUse guard on Bash, Edit and Write: denies AI attribution in a commit
// message, in the text of `gh pr create|edit|comment|review`, `gh issue
// create|comment|edit` and `gh release create|edit`, and in the name of a new
// branch, and a commit subject that is not a Conventional Commit. A commit,
// a pull request and a branch outlive the session and then read as a fact about
// who wrote the code, and a subject without a type hides what the change is from
// a reader of the log. Edit and Write carry no rule and pass.
// Stands down when the `guards` setting is `off`.
//
// A command is read twice: `blankCommandText` finds the invocations that run, so
// a `git commit` inside a message or a heredoc body is not one, and the text as
// written supplies the message, because blanking keeps every offset.
// Ceiling: a bare "Claude" is not matched, because `chore(claude):` is an
// established scope; only attribution-shaped phrases are, and a tool name only as
// the first segment of a new branch name.
// Ceiling: the command string is matched, not parsed. A message option on a
// continuation line is not seen and that subject passes unread; joining continued
// lines before matching would lift it. A relative message file is looked up in the
// working directory of the tool call only, so one that git would find through `cd`
// or `git -C` is denied as unreadable; an absolute path lifts it. A branch made
// another way (`git worktree add -b`, a push to a new ref) is not read.
// A fault reading the input exits 0 with no output; the guard never exits 2.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { blankCommandText, GIT_PREFIX_SOURCE } from './command-text.mjs';
import { isProcessEntry, runBashGuard } from './guard-runner.mjs';

// One list for every place attribution can land. A branch name holds no space,
// so there the whitespace of a phrase stands for the separators a name uses instead.
const ATTRIBUTION_PHRASES = 'co-authored-by|generated\\s+with|generated\\s+by|claude\\s+code|noreply@anthropic\\.com|robot_face';
const BRANCH_ATTRIBUTION_PHRASES = ATTRIBUTION_PHRASES.replaceAll('\\s+', '[-_/]');
const ATTRIBUTION = new RegExp(ATTRIBUTION_PHRASES, 'i');

const COMMIT_TYPES = ['build', 'chore', 'ci', 'docs', 'feat', 'fix', 'merge', 'perf', 'refactor', 'revert', 'style', 'test'];
const CONVENTIONAL_SUBJECT = new RegExp(`^(${COMMIT_TYPES.join('|')})(\\([^()]+\\))?!?: [^ ]`);

// A command opens the string or a line, or follows a separator, a path slash or a
// backtick, with an optional opening quote; group 1 is that opener. The git prefix
// is shared with git-guard and ends in the whitespace before the subcommand.
const COMMAND_START = '((?:^|[;&|( \\t`/])["\']?)';
const GIT_PREFIX = GIT_PREFIX_SOURCE;
const COMMIT_INVOCATION = new RegExp(`${COMMAND_START}${GIT_PREFIX}commit(?:[ \\t\\\\]|$)`, 'gm');
const PULL_REQUEST_INVOCATION = new RegExp(`${COMMAND_START}gh +(?:pr +(?:create|edit|comment|review)|issue +(?:create|comment|edit)|release +(?:create|edit))(?: |$)`, 'gm');

// The name a command gives a new branch: the argument after `checkout -b` or
// `switch -c`, the first name of a creating `git branch`, the last name of a
// renaming one. A start point and an old name are never read, so a branch can
// still be made from, or renamed away from, a tool-made one.
const ATTRIBUTED_BRANCH_NAME = `["']?(?:(?:claude|codex|copilot)/|[^ ;&|\\n]*(?:${BRANCH_ATTRIBUTION_PHRASES}))`;
const ATTRIBUTED_BRANCH_INVOCATIONS = [
  `${COMMAND_START}${GIT_PREFIX}(?:checkout|switch)(?: +[^ ;&|\\n]+)* +(?:-b|-c|--create|--force-create) +${ATTRIBUTED_BRANCH_NAME}`,
  `${COMMAND_START}${GIT_PREFIX}branch(?: +(?:-f|--force|-t|--track|--no-track|-q|--quiet))* +${ATTRIBUTED_BRANCH_NAME}`,
  `${COMMAND_START}${GIT_PREFIX}branch +(?:-m|-c|--move|--copy)(?: +[^ ;&|\\n]+)? +${ATTRIBUTED_BRANCH_NAME}[^ ;&|\\n]*["']? *(?:$|[;&|])`
].map((pattern) => new RegExp(pattern, 'gim'));

// The options of one invocation end at the first separator outside quotes, so an
// option of a chained command is never read as its own. A quote left open runs to
// the end of the line, as on the opening line of a heredoc or of a message with a body.
const OWN_OPTIONS = /^(?:[^;&|"']|"[^"]*"|'[^']*'|"[^"]*$|'[^']*$)*/;
const MESSAGE_OPTION = /(?:^| )(?:-[a-zA-Z]*m|--message)[ =]*["']?(.*)$/;
const MESSAGE_FILE_OPTION = /(?:^| )(?:-[a-zA-Z]*F|--file)[ =]*([^ ]+)/;
const BODY_FILE_OPTION = /(?:^| )(?:--body-file|-F)[ =]+([^ ]+)/;

const COMMIT_ATTRIBUTION_REASON = 'writing-guard: a commit must not attribute the work to an AI. Remove the Co-Authored-By trailer, the "Generated with" line and every tool name from the message.';
const PULL_REQUEST_ATTRIBUTION_REASON = 'writing-guard: a pull request must not attribute the work to an AI, nor an issue or a release. Remove the Co-Authored-By trailer, the "Generated with" line and every tool name from the title, the body and the comment.';
const BRANCH_REASON = 'writing-guard: a branch name must not name an AI, because it shows in every pull request made from it. Drop a leading claude/, codex/ or copilot/ and every attribution phrase, and name the branch after the change only, such as fix/login-redirect.';
const SUBJECT_REASON = `writing-guard: a commit subject follows Conventional Commits so the log can be read by type: type(scope): subject, such as feat(hooks): add the commit check. The scope is optional and the type is one of ${COMMIT_TYPES.join(', ')}.`;

// A message the guard cannot read is a message nobody checked, so it is denied
// rather than waved through. The reason names the source and never quotes a file,
// because a message file may hold anything.
function unreadableReason(source) {
  return `writing-guard: the message in ${source} cannot be read before the command runs, so it would go unchecked. Write the file in an earlier command and name it by its absolute path, or pass the text inline or as a heredoc.`;
}

// The invocations of a pattern whose command word survives blanking, so one in
// quoted text or a heredoc body does not count.
function runningInvocations(command, blanked, pattern) {
  return [...command.matchAll(pattern)].filter((match) => {
    const commandWord = match.index + match[1].length;
    return blanked[commandWord] === command[commandWord];
  });
}

function optionsAfter(command, invocation) {
  const optionsStart = invocation.index + invocation[0].length;
  const lineEnd = command.indexOf('\n', optionsStart);
  const restOfLine = command.slice(optionsStart, lineEnd === -1 ? command.length : lineEnd);
  return OWN_OPTIONS.exec(restOfLine)[0];
}

// The first line with text below the invocation: the subject a heredoc carries.
function heredocSubject(command, invocation) {
  const lineEnd = command.indexOf('\n', invocation.index + invocation[0].length);
  if (lineEnd === -1) return '';
  return command.slice(lineEnd + 1).split('\n').find((line) => /\S/.test(line)) ?? '';
}

// Reads a message file the guard can open, or returns null. A relative path is
// resolved against the working directory of the tool call, and only a regular
// file counts, because reading a device or a pipe would hang the guard.
function readableText(file, workingDirectory) {
  let target = file.replace(/["']/g, '');
  if (target.startsWith('~/')) target = path.join(os.homedir(), target.slice(2));
  else if (!path.isAbsolute(target) && !/^[A-Za-z]:[\\/]/.test(target)) target = path.resolve(workingDirectory, target);
  try {
    if (!fs.statSync(target).isFile()) return null;
    return fs.readFileSync(target, 'utf8');
  } catch {
    return null;
  }
}

function firstTextLine(text) {
  return text.split('\n').find((line) => /\S/.test(line)) ?? '';
}

// Finds the subject of one commit: the first line of its message. A commit that
// names no message (`--amend --no-edit`, `--fixup`, `-C`) has none to read and
// yields neither a subject nor a denial. A message file is searched for
// attribution here as well, because the command string does not hold its text.
function commitSubject(command, invocation, workingDirectory) {
  const options = optionsAfter(command, invocation);
  const inline = MESSAGE_OPTION.exec(options);
  if (inline) {
    const message = inline[1];
    if (/^\$\(cat.*<</.test(message)) return { subject: heredocSubject(command, invocation) };
    if (message.startsWith('$')) return { denial: unreadableReason(/^[^" ]*/.exec(message)[0]) };
    return { subject: message };
  }
  const fileOption = MESSAGE_FILE_OPTION.exec(options);
  if (!fileOption) return {};
  const file = fileOption[1];
  if (file === '-') {
    if (options.includes('<<')) return { subject: heredocSubject(command, invocation) };
    return { denial: unreadableReason('standard input') };
  }
  const text = readableText(file, workingDirectory);
  if (text === null) return { denial: unreadableReason(file) };
  if (ATTRIBUTION.test(text)) return { denial: COMMIT_ATTRIBUTION_REASON };
  return { subject: firstTextLine(text) };
}

function commitDenial(command, invocation, workingDirectory) {
  const { subject, denial } = commitSubject(command, invocation, workingDirectory);
  if (denial) return denial;
  if (subject === undefined || CONVENTIONAL_SUBJECT.test(subject)) return null;
  return SUBJECT_REASON;
}

// The title and an inline or heredoc body are part of the command string, so only
// a body file has to be opened.
function pullRequestBodyFileDenial(command, invocation, workingDirectory) {
  const options = optionsAfter(command, invocation);
  const bodyFile = BODY_FILE_OPTION.exec(options);
  if (!bodyFile) return null;
  const file = bodyFile[1];
  if (file === '-') return options.includes('<<') ? null : unreadableReason('standard input');
  const text = readableText(file, workingDirectory);
  if (text === null) return unreadableReason(file);
  return ATTRIBUTION.test(text) ? PULL_REQUEST_ATTRIBUTION_REASON : null;
}

function bashDenial(command, workingDirectory) {
  const blanked = blankCommandText(command);

  const commits = runningInvocations(command, blanked, COMMIT_INVOCATION);
  if (commits.length > 0 && ATTRIBUTION.test(command)) return COMMIT_ATTRIBUTION_REASON;
  for (const commit of commits) {
    const denial = commitDenial(command, commit, workingDirectory);
    if (denial) return denial;
  }

  const pullRequests = runningInvocations(command, blanked, PULL_REQUEST_INVOCATION);
  if (pullRequests.length > 0 && ATTRIBUTION.test(command)) return PULL_REQUEST_ATTRIBUTION_REASON;
  for (const pullRequest of pullRequests) {
    const denial = pullRequestBodyFileDenial(command, pullRequest, workingDirectory);
    if (denial) return denial;
  }

  const namesAttributedBranch = ATTRIBUTED_BRANCH_INVOCATIONS
    .some((pattern) => runningInvocations(command, blanked, pattern).length > 0);
  return namesAttributedBranch ? BRANCH_REASON : null;
}

export function denialFor(command, hookInput = {}) {
  return bashDenial(command, hookInput.cwd || '.');
}

if (isProcessEntry(import.meta.url)) await runBashGuard(denialFor);
