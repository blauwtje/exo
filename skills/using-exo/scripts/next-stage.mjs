// Prints the next-stage option block and, when the next stage's model or
// effort differs from the session's, the one model line `references/
// next-stage.md` allows under it. A stage skill whose work leaves a next
// stage open (`shaping`, `planning`, `deepen`, `debug`) runs this at its
// final message instead of reading `references/next-stage.md` and
// `references/question.md` itself.
//
//   node next-stage.mjs --after <stage> --artifact <path>

import fs from 'node:fs';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseFlags, UsageError } from '#script-flags';
import { frameOf, parsePlan } from '#plan-tasks';

// The stage a session just finished names the stage its next-stage question
// opens, per `references/next-stage.md`'s fixed order: Stop first, then this
// one stage. `label` and `does` follow `references/question.md`'s shape: a
// one-to-three-word bold label, then a few words on what happens, never why.
const NEXT_STAGE = {
  shaping: { stage: 'planning', label: 'Planning', does: 'orders the brief into a plan' },
  planning: { stage: 'implementing', label: 'Implementing', does: 'runs the plan' },
  deepen: { stage: 'planning', label: 'Planning', does: 'orders the top card into a plan' },
  debug: { stage: 'implementing-batch', label: 'Implementing-batch', does: 'builds the edits the proof left' }
};

function commandFor(stage, artifact) {
  if (stage === 'planning') return `/exo:planning ${artifact}`;
  if (stage === 'implementing') return `/exo:implementing ${artifact}`;
  if (stage === 'implementing-batch') return '/exo:implementing-batch';
  throw new UsageError(`no command known for next stage '${stage}'`);
}

// A `Design:` task whose plan carries no `## Visual direction` section, or
// one still `Direction: pending at rung <n>`, builds that task in the next
// stage's own session, so that stage pins `opus` at `medium` instead of
// `sonnet`.
function designPending(planPath) {
  const plan = parsePlan(fs.readFileSync(planPath, 'utf8'));
  if (!plan.tasks.some((task) => task.design)) return false;
  const visualDirection = frameOf(plan.frame).visualDirection;
  return visualDirection === null || /^Direction: pending at rung \d+$/m.test(visualDirection);
}

// The one model-line row `references/next-stage.md`'s table names for the
// stage the question opens next; `null` when that stage names no row, which
// leaves the session's own model and effort unnamed under the options.
function modelLineFor(stage, artifact) {
  if (stage === 'planning') {
    return "Next stage runs on `opus` at `high`, because a plan's code is pasted as written, so a slip repeats in every task.";
  }
  if (stage === 'implementing-batch') {
    return 'Next stage runs on `opus` at `high`, because it decides the change while building it.';
  }
  if (stage === 'implementing') {
    return designPending(artifact)
      ? 'Next stage runs on `opus` at `medium`, because that task builds in the session, and the skill pins `medium`.'
      : "Next stage runs on `sonnet` at `medium`, because the plan holds every step's code, a frozen direction builds in a delegate, and the implementer agent keeps `high`.";
  }
  return null;
}

/** The next-stage question's lines: the fixed-order options, then the model line when the table names one. */
export function nextStageReport({ after, artifact }) {
  const next = NEXT_STAGE[after];
  if (next === undefined) throw new UsageError(`no next stage known after '${after}'`);
  const lines = [
    `1. **Stop (Recommended)**: run \`${commandFor(next.stage, artifact)}\` after a context clear.`,
    `2. **${next.label}**: ${next.does}.`
  ];
  const modelLine = modelLineFor(next.stage, artifact);
  if (modelLine !== null) lines.push(modelLine);
  return `${lines.join('\n')}\n`;
}

function main(argv) {
  const flags = parseFlags(argv, { after: 'value', artifact: 'value' });
  if (flags.after === undefined) throw new UsageError("flag '--after' names the stage that just ran");
  if (flags.artifact === undefined) throw new UsageError("flag '--artifact' names the artifact's path");
  process.stdout.write(nextStageReport({ after: flags.after, artifact: flags.artifact }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
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
