import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { COMMIT_BLOCK, driftOf, frameOf, INLINE_TASK_LIMIT } from '#plan-tasks';
import { SCRATCH_FOLDER } from '#scratch-path';
import { stallSeconds } from '#stall-guard';
import { taskBrief } from './next-task.mjs';
import { SCRIPT } from './run-session.mjs';

const SKILL_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const readText = (...parts) => fs.readFileSync(path.join(...parts), 'utf8');

function sectionOf(text, heading) {
  const lines = text.split('\n');
  const start = lines.indexOf(`## ${heading}`);
  if (start === -1) throw new Error(`no '## ${heading}' section`);
  const length = lines.slice(start + 1).findIndex((line) => line.startsWith('## '));
  return lines.slice(start, length === -1 ? undefined : start + 1 + length).join('\n').trimEnd();
}

const stallRules = (sandbox) => (sandbox ? [`- A command that prints nothing for ${stallSeconds()} seconds is stopped; each output line restarts the count, so a slow command that prints progress runs on. Never skip a Proof because it is slow, and never wrap a command in \`timeout\` (absent on macOS).`] : []);

const codeRulesCommand = (planPath, number, root) => `node ${SCRIPT.landTask} --code-rules --plan ${planPath} --task ${number} --root ${root}`;

const checkCommand = (planPath, number, root) => `node ${SCRIPT.landTask} --check --plan ${planPath} --task ${number} --root ${root} --report ${path.join(root, SCRATCH_FOLDER, `implementer-${number}.md`)}`;

export function taskPrompt({ plan, planPath, number, root, learnings, sandbox, retryNote = '', runDir = process.env.EXO_RUN_DIR }) {
  const task = plan.tasks.find((entry) => entry.number === number);
  const extra = [
    `- Read ${learnings} first, and before ending append one line on anything the next task should know.`,
    ...(task.design ? [`- Design task: build by steps 1-3 of ${path.join(SKILL_DIR, 'references', 'design-tasks.md')} \`## The delegate\`, with the plan's Contract or Visual direction as the direction.`] : []),
    ...(runDir
      ? [`- Never ask the user: decide from the spec and exo settings, then record each choice with \`node ${SCRIPT.runDecision} <source> <choice> <reason>\` (it appends to ${path.join(runDir, 'decisions.md')}) and go on.`]
      : []),
    ...(sandbox
      ? ['- Bash runs in a sandbox. A command that fails with "Operation not permitted" or EPERM hit the sandbox, not a bug in the task. The script reruns the proof outside the sandbox and lands, so end when those are the only failures left. A test that writes outside the run folder fails with EPERM here: do not rerun it; land-task\'s Proof runs it outside the sandbox.']
      : []),
    ...stallRules(sandbox)
  ].join('\n');
  const landGate = frameOf(plan.frame).landGate?.trim().replace(/^`(.*)`$/, '$1') ?? 'none';
  const fields = {
    task: `Task ${number}`,
    plan: planPath,
    root,
    brief: [...driftOf(task, root, frameOf(plan.frame)).map((item) => `PLAN DRIFT: Task ${number}: ${item}`), taskBrief(task, frameOf(plan.frame), root).trimEnd()].join('\n'),
    codeRules: `\`${codeRulesCommand(planPath, number, root)}\``,
    landGate: landGate === 'none' ? '' : `- After the code rules print \`Code rules OK\` and before "Task ${number} is done", run the plan's Land gate \`${landGate}\` and fix every failure it prints until it passes, except one that names only words in the task's \`Drops:\` line: land-task drops those.\n`,
    extra,
    retry: retryNote
  };
  return sectionOf(readText(SKILL_DIR, 'run-task-prompt.md'), 'Build session').split('\n').slice(1).join('\n').trim()
    .replace(/\[\[(\w+)\]\]/g, (_, name) => fields[name])
    .replace(/\n\n\n+/g, '\n\n');
}

export function planPrompt({ plan, planPath, numbers, root, sandbox }) {
  const briefs = numbers.map((number) => {
    const task = plan.tasks.find((entry) => entry.number === number);
    // why: a plan session copied its tasks' Commit: blocks and committed them; the script lands each task after the session.
    const unlanded = { ...task, section: task.section.replace(COMMIT_BLOCK, '').trimEnd() };
    return [...driftOf(task, root, frameOf(plan.frame)).map((item) => `PLAN DRIFT: Task ${number}: ${item}`), taskBrief(unlanded, frameOf(plan.frame), root).trimEnd()].join('\n');
  });
  const fields = {
    tasks: `${numbers.length === 1 ? 'Task' : 'Tasks'} ${numbers.join(', ')}`,
    first: String(numbers[0]),
    plan: planPath,
    report: `${path.join(root, SCRATCH_FOLDER, 'implementer-<n>.md')}, one per task`,
    brief: briefs.join('\n\n'),
    checks: numbers.map((number) => `- Task ${number}: \`${checkCommand(planPath, number, root)}\``).join('\n'),
    stall: stallRules(sandbox).join('\n')
  };
  return sectionOf(readText(SKILL_DIR, 'run-task-prompt.md'), 'Plan session').split('\n').slice(1).join('\n').trim()
    .replace(/\[\[(\w+)\]\]/g, (_, name) => fields[name])
    .replace(/\n\n\n+/g, '\n\n');
}

export function sessionMode(flag, tasks) {
  const seen = new Set();
  const shared = tasks.flatMap((task) => task.files.map((file) => file.path)).find((file) => seen.size === seen.add(file).size);
  if (flag === 'plan' && shared !== undefined) return { refused: `--session plan: more than one task lists ${shared}; use --session task` };
  if (flag === 'auto') return { mode: tasks.length > 0 && tasks.length <= INLINE_TASK_LIMIT && shared === undefined && !tasks.some((task) => task.design) ? 'plan' : 'task' };
  return { mode: flag };
}
