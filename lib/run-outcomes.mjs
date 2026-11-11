import fs from 'node:fs';
import path from 'node:path';
import { roundCap } from './loop-budget.mjs';

const REPAIR_LINE = 'Then: send a fresh exo:build-task the same Prompt: plus this refusal verbatim, at most {repairBound} times; a further refusal goes to exo:build-task with exo-kind: build-repair.';
const ACTIONS = ['continue', 'repair', 'amend', 'park', 'stop'];

const row = (kind, action, line) => Object.freeze({ kind, action, line });

export const RUN_OUTCOMES = Object.freeze({
  'plan drift': row('plan drift', 'repair', 'Then: hand the drift to exo:build-task with exo-kind: build-repair to repair the plan or the code; the lead edits neither.'),
  'input unreachable': row('input unreachable', 'stop', 'Then: stop the run `BLOCKED` with the unreachable input and no repair delegate; no repair session can supply it.'),
  'outside Files': row('outside Files', 'amend', REPAIR_LINE),
  'report missing': row('report missing', 'repair', 'Then: SendMessage this refusal verbatim to the writer once; with no SendMessage, a fresh exo:build-task with the prior result path.'),
  'no verdict': row('no verdict', 'repair', 'Then: send the report back to its writer once for the verdict line (GREEN, BLOCKED or Unresolved:).'),
  'proof failed': row('proof failed', 'repair', REPAIR_LINE),
  'gate fail': row('gate fail', 'repair', 'Then: send the failing gate output to a fixer; the gate ends the turn only at the repair bound.'),
  env: row('env', 'stop', 'Then: run the readiness CLI for the named service once and rerun; still down ends on BLOCKED <n> ENV with no code edit.'),
  'code rule': row('code rule', 'repair', REPAIR_LINE),
  refused: row('refused', 'stop', 'Then: stop; a retry cannot change this refusal, so report it verbatim and send no repair.'),
  landed: row('landed', 'continue', 'Then: do not land this task again; run next-task for the next task.'),
  pin: row('pin', 'stop', 'Then: stop; this run is pinned to another task, so report the refusal verbatim, land nothing else and send no repair.'),
  lock: row('lock', 'stop', 'Then: stop; another land holds the lock past its wait, so report the refusal verbatim and send no repair.'),
  'unfinished merge': row('unfinished merge', 'stop', 'Then: stop; the checkout has an unfinished merge no repair session may touch, so report the refusal verbatim for the user to finish or abort it.'),
  'fix discarded': row('fix discarded', 'continue', 'Then: the fix commit was reverted because its checks or its fix-diff review failed; its findings are now report and go in the run report.'),
  'review budget': row('review budget', 'stop', 'Then: stop; the gate time budget is spent, so give the verdict, list the open findings in the run report and start no further review.'),
  'repair bound': row('repair bound', 'stop', 'Then: stop; the repair bound is reached, so report what still fails.'),
  'start stop': row('start stop', 'continue', 'Then: do the Next: action named above, then rerun start-run.'),
  question: row('question', 'park', 'Then: park the question in .exo/questions/ and go on with work that does not depend on it.'),
  blocked: row('blocked', 'stop', 'Then: stop; report the BLOCKED line verbatim with what it names missing, and send no repair.'),
  findings: row('findings', 'repair', 'Then: send the findings with fix=1 or more to a fixer, at most {repairBound} times; a further round reports what still fails.'),
  'recurring finding': row('recurring finding', 'stop', 'Then: stop; the same finding survived its repair rounds, so report both readings verbatim and send no repair.'),
  'unread file': row('unread file', 'repair', 'Then: send the unread file to its reviewer to read once, then merge the reviews again.'),
  probe: row('probe', 'repair', 'Then: send the FAIL probe line to a fixer with the finding it names; the probe is the proof.')
});

for (const outcome of Object.values(RUN_OUTCOMES)) {
  if (!ACTIONS.includes(outcome.action)) throw new Error(`bad action '${outcome.action}' for '${outcome.kind}'`);
}

export function outcome(kind) {
  const found = RUN_OUTCOMES[kind];
  if (found === undefined) throw new Error(`no run outcome for '${kind}'`);
  return found;
}

export function outcomeLine(kind) {
  const repairs = roundCap('fix') - 1;
  return outcome(kind).line.replace('{repairBound}', String(repairs));
}

export function parkQuestion({ root, task, question }) {
  const dir = path.join(root, '.exo', 'questions');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `task-${task}.md`);
  fs.writeFileSync(file, `${question}\n`);
  return file;
}
