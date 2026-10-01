#!/usr/bin/env node
// PreToolUse guard on Bash: denies a destructive git command before it runs: a
// force push, a remote ref delete or mirror, `reset --hard`, `clean -f`, a
// force-delete of a branch with commits that are not landed, a stash drop or
// clear, a forced checkout or switch, and a checkout or restore of the whole tree. Deny-only, never rewrites. Stands down when the `guards`
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
// A fault reading the input exits 0 with no output; the guard never exits 2.

import { execFileSync } from 'node:child_process';
import { blankCommandText, GIT_PREFIX_SOURCE } from './command-text.mjs';
import { isProcessEntry, runBashGuard } from './guard-runner.mjs';

// The prefix is shared with writing-guard: the command word, then every global
// option, in any order, before the subcommand; matching only a fixed pair would let
// `git --no-pager reset --hard` through. A `.` before `git` marks a word such as
// `.git`, not a command; a `/` does not, so `/usr/bin/git` and `./git` still match.
const GIT_INVOCATION = new RegExp(`(?<![\\w.-])(${GIT_PREFIX_SOURCE})([a-z][a-z-]*)(?=[ \\t\\\\]|$|[;&|\\n])`, 'g');
const INVOCATION_END = /[;&|]|(?<!\\)\n/;
const GIT_TIMEOUT_MILLISECONDS = 5000;

// `--force-with-lease` is allowed: the flag must end at a space or the line end.
// A refspec with a leading `+`, such as `+main`, forces that ref like `--force`.
// A short bundle such as `-fu`, `-uf` or `-fd` is denied when it holds the force
// letter; `-n` alone is not. A push that deletes (`--delete`, `-d`, a `:ref`
// refspec) or mirrors discards remote history like a force push.
const FORCED_CHECKOUT = /(?:^|[ \t])(?:-[A-Za-z]*f[A-Za-z]*|--force|--discard-changes)(?:[ \t]|$)/;
const FORCED_CHECKOUT_REASON = 'git-guard: a forced checkout or switch discards uncommitted work. Use git stash or ask the user to run it.';
const ARGUMENT_RULES = [
  {
    subcommand: 'push',
    arguments: /(?:^|[ \t])(?:-[A-Za-z]*f[A-Za-z]*|--force|\+[^ \t]+)(?:[ \t]|$)/,
    reason: 'git-guard: force push discards remote history. Use --force-with-lease, or ask the user to run it.'
  },
  {
    subcommand: 'push',
    arguments: /(?:^|[ \t])(?:--mirror|:main|(?:-[A-Za-z]*d[A-Za-z]*|--delete)(?:[ \t]+[^ \t-][^ \t]*)*?[ \t]+main)(?:[ \t]|$)/,
    reason: 'git-guard: deleting main or mirroring remote refs discards remote history. Ask the user to run it.'
  },
  { subcommand: 'checkout', arguments: FORCED_CHECKOUT, reason: FORCED_CHECKOUT_REASON },
  { subcommand: 'switch', arguments: FORCED_CHECKOUT, reason: FORCED_CHECKOUT_REASON },
  {
    subcommand: 'reset',
    arguments: /(?:^|[ \t])--hard/,
    reason: 'git-guard: git reset --hard discards uncommitted work. Use git stash or ask the user to run it.'
  },
  {
    subcommand: 'clean',
    arguments: /(?:^|[ \t])(?:-[A-Za-z]*f|--force)/,
    reason: 'git-guard: git clean -f deletes untracked files. List them with git clean -n and ask the user.'
  },
  {
    subcommand: 'stash',
    arguments: /^[ \t]+(?:drop|clear)(?:[ \t]|$)/,
    reason: 'git-guard: dropping a stash deletes the only copy of that work. Ask the user.'
  }
];

const WHOLE_TREE_REASON = 'git-guard: checking out or restoring the whole tree discards uncommitted work. Name the files, or ask the user.';
const BRANCH_FORCE_DELETE_REASON = 'git-guard: force-deleting a branch discards unmerged work. Report the branch and ask the user.';
const BRANCH_UNRESOLVED_REASON = 'git-guard: force-deleting a branch discards unmerged work; only a branch whose commits are all in the branch it was cut from, whose merge into it would change nothing, or whose pull request is MERGED, may go. Report the branch and ask the user.';

const WHOLE_TREE_PATH = /^(?:[ \t]+[^ \t]+)*[ \t]+(?:--[ \t]+)?[.*](?:[ \t]|$)/;
// `git restore --staged .` only unstages. Adding `--worktree` makes the same
// command discard the working tree, so the exemption needs the staged flag
// without the worktree flag.
const STAGED_FLAG = /(?:^|[ \t])(?:--staged|-S)(?:[ \t]|$)/;
const WORKTREE_FLAG = /(?:^|[ \t])(?:--worktree|-W)(?:[ \t]|$)/;

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
      options: command.slice(match.index, match.index + match[1].length),
      subcommand: match[2],
      arguments: command.slice(argumentsStart, argumentsEnd).replace(/\\\n/g, '  ').replace(/["']/g, '')
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

function branchExists(directory, branch) {
  try {
    git(directory, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`);
    return true;
  } catch {
    return false;
  }
}

// Returns the branch `branch` was cut from (its upstream, or `main` when it has
// none or tracks its own push target) and its commits whose patch is not in that
// base, one `<hash> <subject>` each. `git cherry` compares patch ids, so a commit
// rebased before it landed counts as in, and a branch whose content landed as a
// squash commit has none missing. Returns null when the base does not
// resolve, as in a repository whose default branch is not `main`.
function missingCommits(directory, branch) {
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
    if (commits.length > 0 && contentLanded(directory, base, branch)) return { base, commits: [] };
    return { base, commits };
  } catch {
    return null;
  }
}

// A squash merge lands a branch's content under new patch ids, so `git cherry`
// still lists its commits. When merging the branch into its base yields the
// base's own tree, every change on it is already there. A conflict or a git
// older than 2.38, which lacks `merge-tree --write-tree`, throws and counts as
// not landed.
function contentLanded(directory, base, branch) {
  try {
    const merged = git(directory, 'merge-tree', '--write-tree', base, `refs/heads/${branch}`).split('\n')[0];
    return merged === git(directory, 'rev-parse', `${base}^{tree}`);
  } catch {
    return false;
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
  for (const word of argumentText.split(/[ \t]+/).filter(Boolean)) {
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

// Force-deleting a branch is allowed only when every commit or every change on it
// is already in the branch it was cut from, or when its pull request is MERGED. `git` and `gh`
// run in the `-C` directory when the invocation names one.
function branchDeleteReason(invocation) {
  const { deletes, forces, branches } = parseBranchArguments(invocation.arguments);
  if (!deletes || !forces) return null;
  if (branches.length === 0) return BRANCH_FORCE_DELETE_REASON;
  const directories = [...invocation.options.matchAll(/(?:^|[ \t\n])-C(?:[ \t]|\\\n)+([^ \t\n]+)/g)];
  const directory = directories.length > 0 ? unquote(directories.at(-1)[1]) : '.';
  for (const branch of branches) {
    // A missing or mistyped name has no commits to lose, but its deny skips the
    // `gh` round trip, which would only find no pull request.
    if (!branchExists(directory, branch)) return `git-guard: no branch named ${branch} here, so its commits cannot be checked; write the literal name of an existing branch (see \`git branch --list\`).`;
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

export { denialReason as denialFor };

if (isProcessEntry(import.meta.url)) await runBashGuard(denialReason);
