// Prints the next-stage question, or with `--fresh` the lines the user types
// after picking the fresh-chat route. A stage skill whose work leaves a next
// stage open (`spec`, `find-cause`) runs this at its final message instead of
// reading `references/next-stage.md` and `references/question.md` itself.
//
//   node next-stage.mjs --after <stage> --artifact <path> [--fresh]

import fs from 'node:fs';
import process from 'node:process';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { readKindTable } from '#model-kinds';
import { frameOf, parsePlan } from '#plan-tasks';

// The stage a session just finished names the question that ends it, per
// `references/next-stage.md`: a title, a context sentence, lettered option
// lines with the recommended one on A, and the `Recommended: (A)` line saying
// why A beats the rest. `stage` names the fresh-chat route's model row, when
// the stage offers that route. An option is `[label, what the user gets]`; its
// letter comes from its place in the array.
const NEXT_STAGE = {
  'spec': {
    stage: 'build',
    title: 'Is the brief ready to build?',
    context: (artifact) => `The brief is written at \`${artifact}\`.`,
    options: [
      ['Adjust the brief', 'change it before anything is built.'],
      ['Build here', 'build it now in this chat.'],
      ['Build fresh', 'start a clean chat and build it there.']
    ],
    reason: 'nothing gets built before the brief reads right, while (B) and (C) build it as written.'
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

/**
 * The next-stage question: title, context, lettered options with the
 * recommended one on A, and the recommendation last.
 */
export function nextStageReport({ after, artifact }) {
  const next = NEXT_STAGE[after];
  if (next === undefined) throw new UsageError(`no next stage known after '${after}'`);
  const options = next.options.map(([label, does], index) => {
    const text = typeof does === 'function' ? does(artifact) : does;
    return `- **(${String.fromCharCode(65 + index)}) ${label}**: ${text}`;
  });
  const lines = [`**${next.title}**`, next.context(artifact), '', ...options, '', `Recommended: (A), because ${next.reason}`];
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
