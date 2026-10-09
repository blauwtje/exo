// Bash guard: denies a force push, a remote ref delete or mirror, `reset --hard`,
// `clean -f`, a force-delete of a branch with unlanded commits, a stash drop or
// clear, a forced checkout or switch, and a checkout or restore of the whole
// tree. Each `git` invocation is found in the blanked command, so `git` in a
// message is not one, and ends at the first `;`, `&`, `|` or line break; its
// arguments are read raw with quote marks removed.
// Ceiling: matched, not parsed, so a command built from variables reads as written.

import { execFileSync } from 'node:child_process';
import { blankCommandText, GIT_PREFIX_SOURCE } from './command-text.mjs';

// A `.` before `git` marks a word such as `.git`; a `/` does not (`/usr/bin/git`).
const GIT_INVOCATION = new RegExp(`(?<![\\w.-])(${GIT_PREFIX_SOURCE})([a-z][a-z-]*)(?=[ \\t\\\\]|$|[;&|\\n])`, 'g');
const INVOCATION_END = /[;&|]|(?<!\\)\n/;
const GIT_TIMEOUT_MILLISECONDS = 5000;

// `--force-with-lease` passes; `+ref` or a bundle holding `f` forces; so does deleting or mirroring main.
const FORCED_CHECKOUT = /(?:^|[ \t])(?:-[A-Za-z]*f[A-Za-z]*|--force|--discard-changes)(?:[ \t]|$)/;
const FORCED_CHECKOUT_REASON = 'git-guard: a forced checkout or switch discards uncommitted work. Use git stash or ask the user to run it.';
const ARGUMENT_RULES = [
  { subcommand: 'push', arguments: /(?:^|[ \t])(?:-[A-Za-z]*f[A-Za-z]*|--force|\+[^ \t]+)(?:[ \t]|$)/,
    reason: 'git-guard: force push discards remote history. Use --force-with-lease, or ask the user to run it.' },
  { subcommand: 'push', arguments: /(?:^|[ \t])(?:--mirror|:main|(?:-[A-Za-z]*d[A-Za-z]*|--delete)(?:[ \t]+[^ \t-][^ \t]*)*?[ \t]+main)(?:[ \t]|$)/,
    reason: 'git-guard: deleting main or mirroring remote refs discards remote history. Ask the user to run it.' },
  { subcommand: 'checkout', arguments: FORCED_CHECKOUT, reason: FORCED_CHECKOUT_REASON },
  { subcommand: 'switch', arguments: FORCED_CHECKOUT, reason: FORCED_CHECKOUT_REASON },
  { subcommand: 'reset', arguments: /(?:^|[ \t])--hard/,
    reason: 'git-guard: git reset --hard discards uncommitted work. Use git stash or ask the user to run it.' },
  { subcommand: 'clean', arguments: /(?:^|[ \t])(?:-[A-Za-z]*f|--force)/,
    reason: 'git-guard: git clean -f deletes untracked files. List them with git clean -n and ask the user.' },
  { subcommand: 'stash', arguments: /^[ \t]+(?:drop|clear)(?:[ \t]|$)/,
    reason: 'git-guard: dropping a stash deletes the only copy of that work. Ask the user.' }
];

const WHOLE_TREE_REASON = 'git-guard: checking out or restoring the whole tree discards uncommitted work. Name the files, or ask the user.';
const BRANCH_FORCE_DELETE_REASON = 'git-guard: force-deleting a branch discards unmerged work. Report the branch and ask the user.';
const BRANCH_UNRESOLVED_REASON = 'git-guard: force-deleting a branch discards unmerged work; only a branch whose commits are all in the branch it was cut from, whose merge into it would change nothing, or whose pull request is MERGED, may go. Report the branch and ask the user.';

const WHOLE_TREE_PATH = /^(?:[ \t]+[^ \t]+)*[ \t]+(?:--[ \t]+)?[.*](?:[ \t]|$)/;
// `git restore --staged .` only unstages, unless `--worktree` is added too.
const STAGED_FLAG = /(?:^|[ \t])(?:--staged|-S)(?:[ \t]|$)/;
const WORKTREE_FLAG = /(?:^|[ \t])(?:--worktree|-W)(?:[ \t]|$)/;

const unquote = (word) => word.replace(/^["']|["']$/g, '');

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
  const options = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: GIT_TIMEOUT_MILLISECONDS };
  return execFileSync('git', ['-C', directory, ...gitArguments], options).trim();
}

// What `action` returns, or `fallback` when it throws.
function attempt(action, fallback = false) {
  try {
    return action();
  } catch {
    return fallback;
  }
}

// The base `branch` was cut from (its upstream, else `main`) and its commits not
// in it, none when its content landed as a squash; null when the base is missing.
function missingCommits(directory, branch) {
  const upstream = attempt(() => git(directory, 'rev-parse', '--abbrev-ref', `${branch}@{upstream}`), '');
  const base = upstream === '' || upstream.endsWith(`/${branch}`) ? 'main' : upstream;
  return attempt(() => {
    const cherry = git(directory, 'cherry', '-v', '--abbrev=7', base, `refs/heads/${branch}`);
    const commits = cherry.split('\n').filter((line) => line.startsWith('+ ')).map((line) => line.slice(2));
    return { base, commits: commits.length > 0 && contentLanded(directory, base, branch) ? [] : commits };
  }, null);
}

// Merging into the base yields the base's tree; a conflict or git < 2.38 is not landed.
function contentLanded(directory, base, branch) {
  return attempt(() => git(directory, 'merge-tree', '--write-tree', base, `refs/heads/${branch}`).split('\n')[0]
    === git(directory, 'rev-parse', `${base}^{tree}`));
}

// A squash merge changes the patch ids, so a MERGED pull request frees the branch.
function pullRequestMerged(directory, branch) {
  return attempt(() => execFileSync('gh', ['pr', 'view', branch, '--json', 'state', '--jq', '.state'], {
    cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: GIT_TIMEOUT_MILLISECONDS
  }).trim() === 'MERGED');
}

// `-D`, `--delete --force` in either order and a bundle like `-fd` all force-delete.
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

// A force-delete passes only when the work is in its base or its PR is MERGED.
function branchDeleteReason(invocation) {
  const { deletes, forces, branches } = parseBranchArguments(invocation.arguments);
  if (!deletes || !forces) return null;
  if (branches.length === 0) return BRANCH_FORCE_DELETE_REASON;
  const directories = [...invocation.options.matchAll(/(?:^|[ \t\n])-C(?:[ \t]|\\\n)+([^ \t\n]+)/g)];
  const directory = directories.length > 0 ? unquote(directories.at(-1)[1]) : '.';
  for (const branch of branches) {
    if (!attempt(() => git(directory, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`) !== null)) return `git-guard: no branch named ${branch} here, so its commits cannot be checked; write the literal name of an existing branch (see \`git branch --list\`).`;
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
