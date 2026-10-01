// Prints the next-stage question and, when the next stage's model or
// effort differs from the session's, the one model line `references/
// next-stage.md` allows under it. A stage skill whose work leaves a next
// stage open (`spec`, `find-cause`) runs this at its
// final message instead of reading `references/next-stage.md` and
// `references/question.md` itself.
//
//   node next-stage.mjs --after <stage> --artifact <path>

import fs from 'node:fs';
import process from 'node:process';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { readKindTable } from '#model-kinds';
import { frameOf, parsePlan } from '#plan-tasks';

// The stage a session just finished names the question that ends it, per
// `references/next-stage.md`: a title, a context sentence, lettered option
// lines with the recommended one on A, the `→ A.` reason, and the line for no
// answer a single pick carries. `stage` is the stage whose model line follows.
// An option is `[label, what the user gets]`, never why; its letter comes
// from its place in the array.
const NEXT_STAGE = {
  'spec': {
    stage: 'build',
    context: (artifact) => `The brief is written at \`${artifact}\`.`,
    options: [['Adjust the brief', 'change it before anything is built.'], ['Build here', 'runs the brief in this session.']],
    reason: 'nothing is built before the brief reads right.',
    silence: (artifact) => `Without an answer, nothing starts; type \`/clear\` and then \`${commandFor('build', artifact)}\` to build in a fresh session.`
  },
  'find-cause': {
    stage: 'build-no-spec',
    context: () => 'The cause is found and the proof left edits to build.',
    options: [['Build', 'builds the edits the proof left.'], ['Stop', 'nothing is built now.']],
    reason: 'this session holds the facts the build needs.',
    silence: () => `Without an answer, nothing starts; type \`/clear\` and then \`${commandFor('build-no-spec')}\` to build in a fresh session.`
  }
};

function commandFor(stage, artifact) {
  if (stage === 'spec') return `/exo:spec ${artifact}`;
  if (stage === 'build') return `/exo:build ${artifact}`;
  if (stage === 'build-no-spec') return '/exo:build';
  throw new UsageError(`no command known for next stage '${stage}'`);
}

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

// The reason clause that follows the model and effort of each next stage; the
// kind that sets them is `stages` in `lib/model-kinds.json`. The design-pending
// build row names no stage kind: it runs on the session's model at the effort
// of the build skill's kind.
const STAGE_BECAUSE = {
  'build-no-spec': () => 'it decides the change while building it',
  'build': (buildEffort) => `the plan holds every step's code, a frozen direction builds in a delegate, and the build-task agent keeps \`${buildEffort}\``
};

// The one model-line row `references/next-stage.md`'s table names for the
// stage the question opens next; `null` when that stage names no row, which
// leaves the session's own model and effort unnamed under the options.
function modelLineFor(stage, artifact) {
  const { kinds, stages, agents, skills } = readKindTable();
  if (stage === 'build' && designPending(artifact)) {
    const { effort } = kinds[skills['skills/build/SKILL.md'].kind];
    return `Next stage runs on the session's model at \`${effort}\`, because that task builds in the session, and the skill pins \`${effort}\`.`;
  }
  if (!(stage in stages)) return null;
  const { model, effort } = kinds[stages[stage].kind];
  const builderEffort = kinds[agents['agents/build-task.md'].kind].effort;
  const because = STAGE_BECAUSE[stage](builderEffort);
  return `Next stage runs on \`${model}\` at \`${effort}\`, because ${because}.`;
}

/**
 * The next-stage question: title, context, lettered options with the
 * recommended one on A, the reason, the line for no answer, then the model
 * line when the table names one.
 */
export function nextStageReport({ after, artifact }) {
  const next = NEXT_STAGE[after];
  if (next === undefined) throw new UsageError(`no next stage known after '${after}'`);
  const options = next.options.map(([label, does], index) => `- **${String.fromCharCode(65 + index)} · ${label}**: ${does}`);
  const lines = ['**1 · Next step**', next.context(artifact), '', ...options, '', `→ A. ${next.reason}`, next.silence(artifact)];
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
