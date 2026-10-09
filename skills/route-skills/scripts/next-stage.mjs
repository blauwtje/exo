// Prints the next-stage question, or with `--fresh` the lines the user types
// after picking the fresh-chat route. A stage skill whose work leaves a next
// stage open (`spec`, `find-cause`) runs this at its final message instead of
// reading `references/question.md` itself.
//
//   node next-stage.mjs --after <stage> --artifact <path> [--fresh]

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { readKindTable } from '#model-kinds';
import { frameOf, parsePlan } from '#plan-tasks';
import { scratchPath, ScratchPathError } from '#scratch-path';

// The stage a session just finished names the question that ends it, per
// the question shape: a title, a context sentence, lettered option
// lines with the recommended one on A, and the `Recommended: (A)` line saying
// why A beats the rest. `stage` names the fresh-chat route's model row, when
// the stage offers that route. An option is `[label, what the user gets]`; its
// letter comes from its place in the array. `open` replaces `context`,
// `options` and `reason` while the artifact lists an open point.
const ADJUST_BRIEF = ['Adjust the brief', 'change it before anything is built.'];
const BUILD_HERE = ['Build here', 'I build and check it in this chat, then merge it into main, with no more questions.'];
const BUILD_FRESH = ['Build fresh', 'start a clean chat and build it there.'];

const NEXT_STAGE = {
  'spec': {
    stage: 'build',
    title: 'Is the brief ready to build?',
    context: (artifact) => `The brief is written at \`${artifact}\` with no open point.`,
    options: [BUILD_HERE, BUILD_FRESH, ADJUST_BRIEF],
    reason: 'the brief settles every point and this chat builds, checks and merges it in one reply, while (B) restarts on a clean chat and (C) reopens a settled brief.',
    open: {
      context: (artifact, count) => `The brief is written at \`${artifact}\` with ${count} open point${count === 1 ? '' : 's'} under \`## Open points\`.`,
      options: [ADJUST_BRIEF, BUILD_HERE, BUILD_FRESH],
      reason: 'the open points get settled before anything is built, while (B) and (C) build on them unconfirmed.'
    }
  },
  'find-cause': {
    title: 'Should I build the fix?',
    context: () => 'The cause is found and the fix is known.',
    options: [['Build', 'build the fix now in this chat.'], ['Stop', 'nothing gets built, and the fault stays.']],
    reason: 'this chat already knows what the fix needs, while (B) leaves the fault in place.'
  }
};

// A `Design:` task whose plan carries no `## Visual direction` section, or
// one still `Direction: pending at rung <n>`, builds that task in the next
// stage's own session, so that stage keeps the session's model and pins the
// effort of the build skill's kind instead of the delegate's.
function designPending(planPath) {
  const plan = parsePlan(fs.readFileSync(planPath, 'utf8'));
  if (!plan.tasks.some((task) => task.design)) return false;
  const visualDirection = frameOf(plan.frame).visualDirection;
  return visualDirection === null || /^Direction: pending at rung \d+$/m.test(visualDirection);
}

// The model switch the fresh-chat route asks for before its build command,
// from the kind `stages` in `lib/model-kinds.json` gives the stage; `null`
// when a pending `Design:` task builds in the session, which keeps the
// session's model while the build skill pins its own effort.
function modelSwitchFor(stage, artifact) {
  if (stage === 'build' && designPending(artifact)) return null;
  const { kinds, stages } = readKindTable();
  return `Before you type them, switch to a lighter model with \`/model ${kinds[stages[stage].kind].model}\`.`;
}

// The file holding the brief: the path itself, or for an issue `#<n>` the
// scratch copy spec writes at `.exo/specs/<n>.md`; `null` when neither exists.
function briefFile(artifact) {
  const issue = artifact.match(/^#(\d+)$/);
  if (issue === null) return fs.existsSync(artifact) ? artifact : null;
  try {
    const copy = scratchPath(process.cwd(), `specs/${issue[1]}.md`);
    return fs.existsSync(copy) ? copy : null;
  } catch (error) {
    if (error instanceof ScratchPathError) return null;
    throw error;
  }
}

// The line that offers the unattended run after spec: `run-plan.mjs` beside
// this skill's sibling `build`, named by absolute path, for a plan that
// `plan-check --loop` passes; `null` for any other brief or after any other
// stage. plan-check runs as its own process, since a skill script never
// imports from another skill folder.
function unattendedLine(after, artifact) {
  const file = after === 'spec' ? briefFile(artifact) : null;
  if (file === null) return null;
  const planCheck = fileURLToPath(new URL('../../spec/scripts/plan-check.mjs', import.meta.url));
  const check = spawnSync(process.execPath, [planCheck, '--plan', file, '--loop'], { encoding: 'utf8' });
  if (check.error !== undefined) throw check.error;
  if (check.status !== 0) return null;
  const script = fileURLToPath(new URL('../../build/scripts/run-plan.mjs', import.meta.url));
  return `Unattended, with Claude Code: node "${script}" ${path.resolve(file)}`;
}

/**
 * The open points of a brief: each list item under its `## Open points`
 * heading, a question or an assumption the user has still to confirm. An
 * artifact with no readable file has none.
 */
export function openPoints(artifact) {
  const file = briefFile(artifact);
  if (file === null) return [];
  const section = parsePlan(fs.readFileSync(file, 'utf8')).frame['Open points'] ?? '';
  return section.split('\n').filter((line) => /^\s*(?:[-*+]|\d+[.)])\s+\S/.test(line)).map((line) => line.trim());
}

/**
 * The next-stage question: title, context, lettered options with the
 * recommended one on A, and the recommendation last.
 */
export function nextStageReport({ after, artifact }) {
  const stage = NEXT_STAGE[after];
  if (stage === undefined) throw new UsageError(`no next stage known after '${after}'`);
  const count = stage.open === undefined ? 0 : openPoints(artifact).length;
  const next = count > 0 ? { ...stage, ...stage.open } : stage;
  const options = next.options.map(([label, does], index) => {
    const text = typeof does === 'function' ? does(artifact) : does;
    return `- **(${String.fromCharCode(65 + index)}) ${label}**: ${text}`;
  });
  const lines = [`**${next.title}**`, next.context(artifact, count), '', ...options, '', `Recommended: (A), because ${next.reason}`];
  const unattended = unattendedLine(after, artifact);
  if (unattended !== null) lines.push('', unattended);
  return `${lines.join('\n')}\n`;
}

/**
 * The reply to a picked fresh-chat route: the two lines to type, then the
 * model switch when the stage's row names one.
 */
export function freshReport({ after, artifact }) {
  const next = NEXT_STAGE[after];
  if (next === undefined) throw new UsageError(`no next stage known after '${after}'`);
  if (next.stage === undefined) throw new UsageError(`no fresh-chat route after '${after}'`);
  const lines = [`Type \`/clear\`, then \`/exo:${next.stage} ${artifact}\`.`];
  const modelSwitch = modelSwitchFor(next.stage, artifact);
  if (modelSwitch !== null) lines.push(modelSwitch);
  const unattended = unattendedLine(after, artifact);
  if (unattended !== null) lines.push(unattended);
  return `${lines.join('\n')}\n`;
}

function main(argv) {
  const flags = parseFlags(argv, { after: 'value', artifact: 'value', fresh: 'boolean' });
  if (flags.after === undefined) throw new UsageError("flag '--after' names the stage that just ran");
  if (flags.artifact === undefined) throw new UsageError("flag '--artifact' names the artifact's path");
  const report = flags.fresh ? freshReport : nextStageReport;
  process.stdout.write(report({ after: flags.after, artifact: flags.artifact }));
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`next-stage: ${error.message}\n`);
      process.exitCode = 2;
    } else {
      throw error;
    }
  }
}
