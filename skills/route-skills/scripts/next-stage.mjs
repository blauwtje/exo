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
// the stage offers that route; an entry with only `stage` asks nothing and
// offers only that route. An option is `[label, what the user gets]`; its
// letter comes from its place in the array.
const NEXT_STAGE = {
  'spec': { stage: 'build' },
  'find-cause': {
    title: 'Should I build the fix?',
    context: () => 'The cause is found.',
    options: [['Build', 'build the fix now'], ['Stop', 'nothing is built, the fault stays']],
    reason: 'this chat knows the fix'
  }
};

// A `Design:` task whose plan carries no `## Visual direction` section, or
// one still `Direction: pending at rung <n>`, builds that task in the next
// stage's own session, so that stage keeps the session's model and pins the
// effort of the build skill's kind instead of the delegate's.
// `artifact` resolves through briefFile, so an issue `#<n>` reads its scratch
// copy; no brief file means no pending design.
function designPending(artifact) {
  const file = briefFile(artifact);
  if (file === null) return false;
  const plan = parsePlan(fs.readFileSync(file, 'utf8'));
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
 * The next-stage question: title, context, lettered options with the
 * recommended one on A, and the recommendation last.
 */
export function nextStageReport({ after, artifact }) {
  const stage = NEXT_STAGE[after];
  if (stage === undefined) throw new UsageError(`no next stage known after '${after}'`);
  if (stage.title === undefined) throw new UsageError(`'${after}' asks no question; use --fresh`);
  const options = stage.options.map(([label, does], index) => {
    const text = typeof does === 'function' ? does(artifact) : does;
    return `- **(${String.fromCharCode(65 + index)}) ${label}**: ${text}`;
  });
  const lines = [`**${stage.title}**`, stage.context(artifact), '', ...options, '', `Recommended: (A), because ${stage.reason}`];
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
  lines.push('Build runs at the highest effort; `/effort auto` returns the session to normal effort.');
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
