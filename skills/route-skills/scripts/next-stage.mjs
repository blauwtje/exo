// Prints the next-stage option block and, when the next stage's model or
// effort differs from the session's, the one model line `references/
// next-stage.md` allows under it. A stage skill whose work leaves a next
// stage open (`spec`, `find-cause`) runs this at its
// final message instead of reading `references/next-stage.md` and
// `references/question.md` itself.
//
//   node next-stage.mjs --after <stage> --artifact <path> [--session <id>]
//
// The session defaults to CLAUDE_CODE_SESSION_ID, which a Bash call carries
// with the same value the hooks receive as `session_id`.

import fs from 'node:fs';
import { realpathSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { parseFlags, UsageError } from '#script-flags';
import { readKindTable } from '#model-kinds';
import { frameOf, parsePlan } from '#plan-tasks';
import { hotSessionFile, isSessionId } from '#session-record-path';

// The stage a session just finished names the stage its next-stage question
// opens, per `references/next-stage.md`'s order: this one stage and Stop.
// `label` and `does` follow `references/question.md`'s shape: a one-to-three-word
// bold label, then a few words on what happens, never why.
const NEXT_STAGE = {
  'spec': { stage: 'build', label: 'Build', does: 'runs the plan' },
  'find-cause': { stage: 'build-no-spec', label: 'Build', does: 'builds the edits the proof left' }
};

function commandFor(stage, artifact) {
  if (stage === 'spec') return `/exo:spec ${artifact}`;
  if (stage === 'build') return `/exo:build ${artifact}`;
  if (stage === 'build-no-spec') return '/exo:build';
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

// The reason clause that follows the model and effort of each next stage; the
// kind that sets them is `stages` in `lib/model-kinds.json`. The design-pending
// build row names no kind: it pins `opus` at `medium` by the skill's own setting.
const STAGE_BECAUSE = {
  'build-no-spec': () => 'it decides the change while building it',
  'build': (buildEffort) => `the plan holds every step's code, a frozen direction builds in a delegate, and the build-task agent keeps \`${buildEffort}\``
};

// The one model-line row `references/next-stage.md`'s table names for the
// stage the question opens next; `null` when that stage names no row, which
// leaves the session's own model and effort unnamed under the options.
function modelLineFor(stage, artifact) {
  if (stage === 'build' && designPending(artifact)) {
    return 'Next stage runs on `opus` at `medium`, because that task builds in the session, and the skill pins `medium`.';
  }
  const { kinds, stages } = readKindTable();
  if (!(stage in stages)) return null;
  const { model, effort } = kinds[stages[stage].kind];
  const because = STAGE_BECAUSE[stage](kinds.build.effort);
  return `Next stage runs on \`${model}\` at \`${effort}\`, because ${because}.`;
}

// True once show-savings' context-watch.mjs has sent its `exo: context` notice
// in this session. `#session-record-path` builds the hot record's path, so it
// cannot drift from the one record.mjs writes. A session with no id or no hot
// record file has not been warned; any other read or parse failure surfaces.
function warnedThisSession(sessionId) {
  if (sessionId === undefined || sessionId === '') return false;
  if (!isSessionId(sessionId)) throw new UsageError(`invalid session id: ${sessionId}`);
  try {
    const hot = JSON.parse(fs.readFileSync(hotSessionFile(sessionId), 'utf8'));
    return hot?.contextWatch?.warned === true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

/**
 * The next-stage question's lines: continuing first and recommended, or Stop
 * first and recommended once the session was warned, then the model line when
 * the table names one.
 */
export function nextStageReport({ after, artifact, sessionId }) {
  const next = NEXT_STAGE[after];
  if (next === undefined) throw new UsageError(`no next stage known after '${after}'`);
  const stopText = `run \`${commandFor(next.stage, artifact)}\` after a context clear.`;
  const stageText = `${next.does}.`;
  const lines = warnedThisSession(sessionId)
    ? [`1. **Stop (Recommended)**: ${stopText}`, `2. **${next.label}**: ${stageText}`]
    : [`1. **${next.label} (Recommended)**: ${stageText}`, `2. **Stop**: ${stopText}`];
  const modelLine = modelLineFor(next.stage, artifact);
  if (modelLine !== null) lines.push(modelLine);
  return `${lines.join('\n')}\n`;
}

function main(argv) {
  const flags = parseFlags(argv, { after: 'value', artifact: 'value', session: 'value' });
  if (flags.after === undefined) throw new UsageError("flag '--after' names the stage that just ran");
  if (flags.artifact === undefined) throw new UsageError("flag '--artifact' names the artifact's path");
  const sessionId = flags.session ?? process.env.CLAUDE_CODE_SESSION_ID;
  process.stdout.write(nextStageReport({ after: flags.after, artifact: flags.artifact, sessionId }));
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
