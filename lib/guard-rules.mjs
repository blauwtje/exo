import { BRIEF_RULES } from './brief-rules.mjs';
import { SPEED_RULES } from './speed-rules.mjs';
import { EVIDENCE_RULES } from './evidence-rules.mjs';
import { REFUSAL_RULES } from './refusal-rules.mjs';

export const GUARD_RULES = [
  ...BRIEF_RULES,
  ...SPEED_RULES,
  ...EVIDENCE_RULES,
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
    allowed: 'return BLOCKED naming the worktree or branch so the lead runs it; a worktree you added stays for the lead, who removes worktrees and deletes branches once your result is read; the refusal stays for every subagent, so retry no variant of the command and delete no worktree or branch another way to get past it'
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
    id: 'script-size',
    tools: ['Bash'],
    rule: 'A command over the byte limit runs from a saved copy',
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
    allowed: 'Write and Edit are still allowed: run `{checkpoint}` first so the work is committed, then {handover}; a fresh agent continues from it'
  },
  {
    id: 'context-target',
    tools: null,
    rule: 'Over the context target new reads, searches, fetches, skills and agents are refused',
    brief: 'Past the context target new reads, searches and agents are refused, past the hard limit every tool but Write and Edit: write the result file your brief names as a handover and return.',
    allowed: 'finish the edit in hand, then {handover}; a fresh agent continues from it'
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
    brief: 'Write the final result only after all your own background shells have ended.',
    allowed: 'end your turn and wait for the notification of each shell, then write the result'
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
    id: 'refusal-cap',
    tools: ['Agent'],
    rule: 'This call hit its refusal round cap',
    brief: null,
    allowed: 'stop it and record the gap'
  },
  {
    id: 'agent-isolation',
    tools: ['Agent'],
    rule: 'An isolated agent reads nothing outside its own worktree, so its brief paths and its report cannot reach this checkout',
    brief: null,
    allowed: 'call it with no `isolation` and a `Worktree: <abs path>` brief line naming a worktree under `.claude/worktrees/<name>`'
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
    id: 'role-no-dispatch',
    tools: ['Agent'],
    rule: 'This role may not dispatch (harnesses/coordination-contract.json)',
    brief: null,
    allowed: 'do the work in this agent and return the result path'
  },
  ...REFUSAL_RULES
];

const RULES_BY_ID = new Map(GUARD_RULES.map((row) => [row.id, row]));

const WARN_RULE_IDS = new Set(['suite-passed', 'brief-lacks-reads', 'wide-find', 'script-size']);

export function guardKind(id) {
  return WARN_RULE_IDS.has(id) ? 'warn' : 'hard';
}

export const HANDOVER_TAIL = 'first line `Status: handover`, then what is done, what is left and the files you changed';

const DEFAULT_PARAMS = { handover: `write the result file your brief names as a handover, ${HANDOVER_TAIL}, and reply with its path` };

function fill(text, given = {}) {
  const params = { ...DEFAULT_PARAMS, ...given };
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
