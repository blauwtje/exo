#!/usr/bin/env node
// PreToolUse guard on Bash: denies a destructive git command before it runs: a
// force push, `reset --hard`, `clean -f`, a force-delete of a branch with
// commits that are not landed, a stash drop or clear, and a checkout or restore
// of the whole tree. Deny-only, never rewrites. Stands down when the `guards`
// setting is `off`.
//
// Each `git` invocation is found in the blanked command (`blankCommandText`), so
// the word `git` in a commit message or a heredoc body is not a command, and the
// invocation ends at the first `;`, `&`, `|` or line break there, so a chained
// `make && git reset --hard` is checked as its own invocation. Its arguments are
// read from the raw text with its quote marks removed, because a quoted flag or
// path is still an argument.
// Ceiling: the command string is matched, not parsed, so a command assembled from
// variables at run time reads as written.
// A failed read of stdin exits 1, a non-blocking error; the guard never exits 2.

import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { readHookText } from '#hook-input';
import { settingValue } from '#settings-store';
import { blankCommandText } from './command-text.mjs';

// A global option may repeat and appear in any order before the subcommand: `-C
// <path>` and `-c <name>=<value>` take a separate value, every other one is a
// single token such as `--no-pager`. Matching only a fixed pair would let
// `git --no-pager reset --hard` through.
const GIT_INVOCATION = /(?<![\w-])git((?: +(?:-[cC] +[^ \n]+|-[^ \n]+))*) +([a-z][a-z-]*)(?= |$|[;&|\n])/g;
const INVOCATION_END = /[;&|\n]/;
const GIT_TIMEOUT_MILLISECONDS = 5000;

// `--force-with-lease` is allowed: the flag must end at a space or the line end.
// A clean bundle such as `-fd` is denied; `-n` alone is not.
const ARGUMENT_RULES = [
  {
    subcommand: 'push',
    arguments: /(?:^| )(?:-f|--force)(?: |$)/,
    reason: 'git-guard: force push discards remote history. Use --force-with-lease, or ask the user to run it.'
  },
  {
    subcommand: 'reset',
    arguments: /(?:^| )--hard/,
    reason: 'git-guard: git reset --hard discards uncommitted work. Use git stash or ask the user to run it.'
  },
  {
    subcommand: 'clean',
    arguments: /(?:^| )(?:-[A-Za-z]*f|--force)/,
    reason: 'git-guard: git clean -f deletes untracked files. List them with git clean -n and ask the user.'
  },
  {
    subcommand: 'stash',
    arguments: /^ +(?:drop|clear)(?: |$)/,
    reason: 'git-guard: dropping a stash deletes the only copy of that work. Ask the user.'
  }
];

const WHOLE_TREE_REASON = 'git-guard: checking out or restoring the whole tree discards uncommitted work. Name the files, or ask the user.';
const BRANCH_FORCE_DELETE_REASON = 'git-guard: force-deleting a branch discards unmerged work. Report the branch and ask the user.';
const BRANCH_UNRESOLVED_REASON = 'git-guard: force-deleting a branch discards unmerged work; only a branch whose commits are all in the branch it was cut from, or whose pull request is MERGED, may go. Report the branch and ask the user.';

const WHOLE_TREE_PATH = /^(?: +[^ ]+)* +(?:-- +)?\.(?: |$)/;
// `git restore --staged .` only unstages. Adding `--worktree` makes the same
// command discard the working tree, so the exemption needs the staged flag
// without the worktree flag.
const STAGED_FLAG = /(?:^| )(?:--staged|-S)(?: |$)/;
const WORKTREE_FLAG = /(?:^| )(?:--worktree|-W)(?: |$)/;

const unquote = (word) => word.replace(/^["']|["']$/g, '');

// Every git invocation in the command: its option text and arguments raw, its
// subcommand as written.
function invocationsOf(command) {
  const blanked = blankCommandText(command);
  return [...blanked.matchAll(GIT_INVOCATION)].map((match) => {
    const argumentsStart = match.index + match[0].length;
    const rest = blanked.slice(argumentsStart);
    const end = rest.search(INVOCATION_END);
    const argumentsEnd = end === -1 ? blanked.length : argumentsStart + end;
    return {
      options: command.slice(match.index, match.index + match[1].length + 3),
      subcommand: match[2],
      arguments: command.slice(argumentsStart, argumentsEnd).replace(/["']/g, '')
    };
  });
}

function git(directory, ...gitArguments) {
  return execFileSync('git', ['-C', directory, ...gitArguments], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: GIT_TIMEOUT_MILLISECONDS
  }).trim();
}

// Returns the branch `branch` was cut from (its upstream, or `main` when it has
// none or tracks its own push target) and its commits whose patch is not in that
// base, one `<hash> <subject>` each. `git cherry` compares patch ids, so a commit
// rebased before it landed counts as in. Returns null when a ref does not resolve.
function missingCommits(directory, branch) {
  try {
    git(directory, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`);
  } catch {
    return null;
  }
  let base;
  try {
    base = git(directory, 'rev-parse', '--abbrev-ref', `${branch}@{upstream}`);
  } catch {
    base = '';
  }
  if (base === '' || base.endsWith(`/${branch}`)) base = 'main';
  try {
    const cherry = git(directory, 'cherry', '-v', '--abbrev=7', base, `refs/heads/${branch}`);
    const commits = cherry.split('\n').filter((line) => line.startsWith('+ ')).map((line) => line.slice(2));
    return { base, commits };
  } catch {
    return null;
  }
}

// A squash merge leaves the branch unmerged for `-d` and changes the patch ids,
// so a MERGED pull request also frees the branch.
function pullRequestMerged(directory, branch) {
  try {
    const state = execFileSync('gh', ['pr', 'view', branch, '--json', 'state', '--jq', '.state'], {
      cwd: directory,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: GIT_TIMEOUT_MILLISECONDS
    });
    return state.trim() === 'MERGED';
  } catch {
    return false;
  }
}

// `-D`, `--delete --force` in either order and a bundle like `-fd` all mean the
// same thing, so the flags are read out of the invocation's own arguments.
function parseBranchArguments(argumentText) {
  let deletes = false;
  let forces = false;
  const branches = [];
  for (const word of argumentText.split(/ +/).filter(Boolean)) {
    if (word === '--delete') deletes = true;
    else if (word === '--force') forces = true;
    else if (word.startsWith('--')) continue;
    else if (word.startsWith('-')) {
      if (/[dD]/.test(word)) deletes = true;
      if (/[fD]/.test(word)) forces = true;
    } else branches.push(word);
  }
  return { deletes, forces, branches };
}

// Force-deleting a branch is allowed only when every commit on it is already in
// the branch it was cut from, or when its pull request is MERGED. `git` and `gh`
// run in the `-C` directory when the invocation names one.
function branchDeleteReason(invocation) {
  const { deletes, forces, branches } = parseBranchArguments(invocation.arguments);
  if (!deletes || !forces) return null;
  if (branches.length === 0) return BRANCH_FORCE_DELETE_REASON;
  const directories = [...invocation.options.matchAll(/(?:^| )-C +([^ ]+)/g)];
  const directory = directories.length > 0 ? unquote(directories.at(-1)[1]) : '.';
  for (const branch of branches) {
    const landed = missingCommits(directory, branch);
    if (landed && landed.commits.length === 0) continue;
    if (pullRequestMerged(directory, branch)) continue;
    if (!landed) return BRANCH_UNRESOLVED_REASON;
    return `git-guard: force-deleting ${branch} discards commits not in ${landed.base} yet: ${landed.commits.join('; ')}. Land them first, or report the branch and ask the user.`;
  }
  return null;
}

function wholeTreeReason(invocation) {
  if (!WHOLE_TREE_PATH.test(invocation.arguments)) return null;
  const unstagesOnly = STAGED_FLAG.test(invocation.arguments) && !WORKTREE_FLAG.test(invocation.arguments);
  return unstagesOnly ? null : WHOLE_TREE_REASON;
}

function invocationReason(invocation) {
  const rule = ARGUMENT_RULES.find((candidate) => candidate.subcommand === invocation.subcommand
    && candidate.arguments.test(invocation.arguments));
  if (rule) return rule.reason;
  if (invocation.subcommand === 'branch') return branchDeleteReason(invocation);
  if (invocation.subcommand === 'checkout' || invocation.subcommand === 'restore') return wholeTreeReason(invocation);
  return null;
}

function denialReason(command) {
  for (const invocation of invocationsOf(command)) {
    const reason = invocationReason(invocation);
    if (reason) return reason;
  }
  return null;
}

// A setting that cannot be read leaves the guard on, because a safety guard that
// a broken settings file switches off would fail open.
function guardsOn() {
  try {
    return settingValue('guards') !== 'off';
  } catch {
    return true;
  }
}

async function main() {
  let hookInput;
  try {
    const text = await readHookText();
    if (text.trim() === '') return;
    hookInput = JSON.parse(text);
  } catch (error) {
    process.stderr.write(`git-guard: cannot read the hook input: ${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  const command = hookInput.tool_input?.command;
  if (hookInput.tool_name !== 'Bash' || typeof command !== 'string' || command === '') return;
  if (!guardsOn()) return;
  const reason = denialReason(command);
  if (!reason) return;
  const decision = { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason };
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: decision })}\n`);
}

await main();
