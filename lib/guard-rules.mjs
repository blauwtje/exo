import { BRIEF_RULES } from './brief-rules.mjs';
import { SPEED_RULES } from './speed-rules.mjs';

export const GUARD_RULES = [
  ...BRIEF_RULES,
  ...SPEED_RULES,
  {
    id: 'stash',
    tools: ['Bash'],
    rule: 'Subagents share the stash with every worktree, so git stash is denied',
    brief: 'A subagent runs no git stash: save changes with `git diff > .exo/<name>.patch`.',
    allowed: 'save changes with `git diff > .exo/<name>.patch` (and `git diff --cached > .exo/<name>-staged.patch` for staged ones), restore with `git apply .exo/<name>.patch`'
  },
  {
    id: 'shared-state',
    tools: ['Bash'],
    rule: 'Subagents share worktrees and branches with the lead, so worktree remove/prune/move and branch delete/rename are denied',
    brief: 'A subagent runs no git worktree remove/prune/move and no branch delete/rename: return BLOCKED naming it.',
    allowed: 'return BLOCKED naming the worktree or branch so the lead runs it'
  },
  {
    id: 'no-delete',
    tools: ['Bash'],
    brief: 'Never delete a file, container, volume, database, branch, worktree or credential to get past a blocked state: that state is evidence and the data behind it is often the only copy. Report the situation with two or three options instead.'
  },
  {
    id: 'wide-find',
    tools: ['Bash'],
    rule: 'A find over /, ~, $HOME or .. runs past the 120 s tool timeout',
    brief: 'Run no find over /, ~, $HOME or ..: use `find .` or `git ls-files`.',
    allowed: 'run `find .` or `git ls-files` from the repo root; a plan input that is missing there: report BLOCKED'
  },
  {
    id: 'commit-attribution',
    tools: ['Bash'],
    rule: 'A commit message must not attribute the work to an AI',
    brief: 'A commit message, given by -m, -F file or heredoc, carries no Co-Authored-By trailer, "Generated with" line or tool name.',
    allowed: 'run the same git commit again with the Co-Authored-By and "Generated with" lines removed'
  },
  {
    id: 'script-size',
    tools: ['Bash'],
    rule: 'A command over the byte limit is refused',
    brief: 'Keep a Bash command under 4096 bytes: write a longer script to .exo/<name>.sh and run `bash .exo/<name>.sh`.',
    allowed: 'write the script to a file under .exo/ and run it with `bash .exo/<name>.sh`'
  },
  {
    id: 'code-rules',
    tools: ['Edit', 'Write'],
    rule: 'Code is checked against the code rules when written',
    brief: 'An Edit or Write is refused when the added code breaks a code rule (comment, deep nesting, nested ternary, else after return).',
    allowed: 'rewrite the listed lines to satisfy the rule named in the refusal and write again'
  },
  {
    id: 'result-line',
    tools: ['Read'],
    rule: 'A single line over the result cap is refused',
    brief: 'A Read of a file with a line over the result cap is refused: grep the file or cut it with `head -c`.',
    allowed: 'grep the file or cut it with Bash head -c'
  },
  {
    id: 'context-lead',
    tools: null,
    rule: 'Over the hard context limit the session may only write its handoff file and run the checkpoint script',
    brief: null,
    allowed: 'write what is done, what remains and the files you changed, at most 25 lines, to the handoff file, run `{checkpoint}` to commit the work, then end on the last line `Task <n>: HANDOFF`; a fresh session continues from that file'
  },
  {
    id: 'context-hard',
    tools: null,
    rule: 'Over the hard context limit every tool except Write, Edit and the checkpoint script is refused',
    brief: null,
    allowed: 'Write and Edit are still allowed: run `{checkpoint}` first so the work is committed, then write the result file your brief names as a handover, first line `Status: handover`, then what is done, what is left and the files you changed, and reply with its path; a fresh agent continues from it'
  },
  {
    id: 'context-target',
    tools: null,
    rule: 'Over the context target new reads, searches, fetches, skills and agents are refused',
    brief: 'Past the context target new reads, searches and agents are refused, past the hard limit every tool but Write and Edit: write the result file your brief names as a handover and return.',
    allowed: 'finish the edit in hand, then write the result file your brief names as a handover, first line `Status: handover`, then what is done, what is left and the files you changed, and reply with its path; a fresh agent continues from it'
  },
  {
    id: 'persisted-read',
    tools: ['Read'],
    rule: 'A whole persisted tool output puts its overflow back into context',
    brief: null,
    allowed: 'read only the lines you need with offset and limit, grep it, or hand the reading to a subagent'
  },
  {
    id: 'intake-glob',
    tools: ['Glob'],
    rule: 'exo intake bound',
    brief: 'A Glob larger than your room left is refused: use Grep with glob, output_mode files_with_matches and a head_limit.',
    allowed: 'use Grep with glob set to this pattern, output_mode files_with_matches and a head_limit, which exo cuts to fit'
  },
  {
    id: 'intake-websearch',
    tools: ['WebSearch'],
    rule: 'exo intake bound',
    brief: null,
    allowed: 'use what you have found and finish the step in hand'
  },
  {
    id: 'live-shells',
    tools: ['TaskStop'],
    rule: 'Background shells you started still run',
    brief: 'A Write of the result file is refused while a background shell you started runs: stop each with TaskStop first.',
    allowed: 'stop each with TaskStop, then Write this file again, so nothing runs on after you return'
  },
  {
    id: 'run-no-wait',
    tools: null,
    rule: 'A run session has no user to wait for',
    brief: null,
    allowed: 'decide from the spec and the exo settings, record the choice as above, and continue'
  },
  {
    id: 'run-no-wait-final',
    tools: null,
    rule: 'A run session has no user to wait for',
    brief: null,
    allowed: 'decide from the spec and the exo settings, record the choice as above, and continue; if no decision is possible, end with `Task <n>: BLOCKED <question>`'
  },
  {
    id: 'run-stall-guard',
    tools: ['Bash'],
    rule: 'An exo script that runs outside the sandbox is one Bash call',
    brief: null,
    allowed: 'run it as its own Bash call, not in a loop, variable or compound command; to read it, use Read or Grep'
  },
  {
    id: 'unknown-kind',
    tools: ['Agent'],
    rule: 'This delegate names an unknown kind',
    brief: null,
    allowed: 'start its brief with `exo-kind: <kind>`: `hardest` for an open choice or unknown cause, `build` for a fully decided fix, `review` for a review'
  },
  {
    id: 'agent-isolation',
    tools: ['Agent'],
    rule: 'An isolated agent reads nothing outside its own worktree, so its brief paths and its report cannot reach this checkout',
    brief: null,
    allowed: 'call it with no `isolation` and put a `Worktree: <abs path>` line in the brief, naming a worktree you made under `.worktrees/`'
  },
  {
    id: 'result-tools',
    tools: null,
    without: ['Write'],
    rule: 'A result file needs the Write tool',
    brief: 'You have no Write tool: return your findings as reply text, not a report file.',
    allowed: 'give it `Result: reply` and it returns its findings as reply text. Put one field per line, each label at the start of its line'
  },
  {
    id: 'task-owner',
    tools: ['TaskStop'],
    rule: null,
    brief: 'TaskStop stops only a task you started: name another agent\'s task in your reply and leave it to its owner.',
    allowed: null
  },
  {
    id: 'no-task-stop',
    tools: null,
    without: ['TaskStop'],
    rule: null,
    brief: 'You have no TaskStop: wait for your background task in the foreground until it ends, then exit.',
    allowed: null
  },
  {
    id: 'tool-case',
    tools: null,
    rule: null,
    brief: 'Call tools by their exact names: Bash, Read, Write, Edit.',
    allowed: null
  },
  {
    id: 'kind-mismatch',
    tools: ['Agent'],
    rule: 'This delegate runs on the model and effort of its kind',
    brief: null,
    allowed: 'drop `model` and `effort`'
  },
  {
    id: 'kind-mismatch-label',
    tools: ['Agent'],
    rule: 'This delegate runs on the model and effort of its kind',
    brief: null,
    allowed: 'start the brief with the label to run that pair, or drop `model` and `effort`'
  },
  {
    id: 'workers-line',
    tools: ['Agent'],
    rule: 'This orchestrator dispatch needs a `Workers: <n>` line',
    brief: null,
    allowed: 'split the job into slices of its own phases, each within the worker limit, retries included'
  },
  {
    id: 'slice-spent',
    tools: ['Agent'],
    rule: 'This orchestrator slice has used the dispatches it was sized for',
    brief: null,
    allowed: 'write the result file your brief names and return; the lead plans the next slice'
  },
  {
    id: 'brief-ambiguous-name',
    tools: ['Agent'],
    rule: 'names that match several tracked files, so give the full path: {matches}',
    brief: null,
    allowed: null
  },
  {
    id: 'brief-missing-path',
    tools: ['Agent'],
    rule: 'paths that do not exist: {names} (searched {searched}; name a pasted image by its full path)',
    brief: null,
    allowed: null
  },
  {
    id: 'brief-worktree',
    tools: ['Agent'],
    rule: null,
    brief: null,
    allowed: 'the paths exist under {dir}, so add a `Worktree: {dir}` line, then '
  },
  {
    id: 'brief-reads-label',
    tools: ['Agent'],
    rule: 'it has `{found}`; rename it to `Reads:`',
    brief: null,
    allowed: null
  },
  {
    id: 'brief-reads-none',
    tools: ['Agent'],
    rule: null,
    brief: null,
    allowed: '`Reads: none`'
  },
  {
    id: 'brief-reads-named',
    tools: ['Agent'],
    rule: null,
    brief: null,
    allowed: '`Reads: {files}` (the files this brief names), or `Reads: none`'
  },
  {
    id: 'brief-reads-any',
    tools: ['Agent'],
    rule: null,
    brief: null,
    allowed: '`Reads: none`, or `Reads:` with the paths the worker must read'
  },
  {
    id: 'brief-range',
    tools: ['Agent'],
    rule: null,
    brief: null,
    allowed: 'to keep {path} in this brief write `Reads: {path} lines 1-{last}` (about {room} tokens), or locate the part with `grep -n <term> {path}` and write `Reads: {path} lines <a>-<b>` for that range; otherwise '
  },
  {
    id: 'brief-over-budget',
    tools: ['Agent'],
    rule: 'This worker brief reads about {tokens} tokens against a budget of {budget}',
    brief: null,
    allowed: '{range}give the largest read its own agent, or cut it: a qualifier is only `lines N-M` or `by grep` right after the path (other words cut nothing), and split the rest by path so each agent\'s `Reads:` stays under {budget} with its own `Result:`'
  }
];

const RULES_BY_ID = new Map(GUARD_RULES.map((row) => [row.id, row]));

function fill(text, params = {}) {
  return text.replace(/\{(\w+)\}/g, (_, name) => {
    if (!(name in params)) throw new Error(`no param ${name}`);
    return String(params[name]);
  });
}

function ruleRow(id) {
  const row = RULES_BY_ID.get(id);
  if (!row) throw new Error(`no guard rule ${id}`);
  return row;
}

export function rulePart(id, params) {
  return fill(ruleRow(id).rule, params);
}

export function allowedPart(id, params) {
  return fill(ruleRow(id).allowed, params);
}

export function denyReason(id, detail, params) {
  const rule = rulePart(id, params);
  const stated = detail ? `${rule}: ${detail}` : rule;
  return `${stated}. Do instead: ${allowedPart(id, params)}.`;
}

function appliesTo(row, tools) {
  if (!tools) return !row.without;
  const hasTool = !row.tools || row.tools.some((tool) => tools.includes(tool));
  const lacksTool = !row.without || row.without.every((tool) => !tools.includes(tool));
  return hasTool && lacksTool;
}

export function briefLines(tools = null) {
  return GUARD_RULES
    .filter((row) => row.brief && appliesTo(row, tools))
    .map((row) => `- ${row.brief}`);
}

const LABEL_HEAD = /^(?:exo-kind:[^\n]*\n)?/;

export function briefedPrompt(prompt, tools = null) {
  const lines = briefLines(tools);
  if (lines.every((line) => prompt.includes(line))) return prompt;
  const [label] = LABEL_HEAD.exec(prompt);
  return `${label}${lines.join('\n')}\n\n${prompt.slice(label.length)}`;
}
