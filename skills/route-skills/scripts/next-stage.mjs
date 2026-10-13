import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { readKindTable } from '#model-kinds';
import { frameOf, openPoints, parsePlan } from '#plan-tasks';
import { scratchPath, ScratchPathError } from '#scratch-path';

const USAGE = [
  'usage: node next-stage.mjs --after <stage> --artifact <path> [--fresh]',
  'Prints the next-stage question, or with --fresh the lines the user types after picking the fresh-chat route.',
].join('\n');

const NEXT_STAGE = {
  'spec': { stage: 'build' },
  'find-cause': {
    title: 'Should I build the fix?',
    context: () => 'The cause is found.',
    options: [['Build', 'build the fix now'], ['Stop', 'nothing is built, the fault stays']],
    reason: 'this chat knows the fix'
  }
};

function designPending(artifact) {
  const file = briefFile(artifact);
  if (file === null) return false;
  const plan = parsePlan(fs.readFileSync(file, 'utf8'));
  if (!plan.tasks.some((task) => task.design)) return false;
  const visualDirection = frameOf(plan.frame).visualDirection;
  return visualDirection === null || /^Direction: pending at rung \d+$/m.test(visualDirection);
}

function modelSwitchFor(stage, artifact) {
  if (stage === 'build' && designPending(artifact)) return null;
  const { kinds, stages } = readKindTable();
  return `Before you type them, switch to a lighter model with \`/model ${kinds[stages[stage].kind].model}\`.`;
}

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

function effortLine(stage) {
  const { kinds, stages } = readKindTable();
  const { effort } = kinds[stages[stage].kind];
  return `Build runs best at \`${effort}\` effort: type \`/effort ${effort}\` first; \`/effort auto\` returns the session to normal effort.`;
}

function openEntries(artifact) {
  const file = briefFile(artifact);
  return file === null ? [] : openPoints(fs.readFileSync(file, 'utf8'));
}

export function freshReport({ after, artifact }) {
  const next = NEXT_STAGE[after];
  if (next === undefined) throw new UsageError(`no next stage known after '${after}'`);
  if (next.stage === undefined) throw new UsageError(`no fresh-chat route after '${after}'`);
  const open = after === 'spec' ? openEntries(artifact) : [];
  if (open.length > 0) {
    return [
      `The brief at \`${artifact}\` has ${open.length} open point${open.length === 1 ? '' : 's'}, which build refuses. Answer each, record it under \`## Decisions\`, drop it from \`## Open points\`, then hand off again:`,
      ...open.map((entry) => `- ${entry}`)
    ].join('\n') + '\n';
  }
  const lines = [`Type \`/clear\`, then \`/exo:${next.stage} ${artifact}\`.`];
  const modelSwitch = modelSwitchFor(next.stage, artifact);
  if (modelSwitch !== null) lines.push(modelSwitch);
  lines.push(effortLine(next.stage));
  const unattended = unattendedLine(after, artifact);
  if (unattended !== null) lines.push(unattended);
  return `${lines.join('\n')}\n`;
}

function main(argv) {
  const flags = parseFlags(argv, { after: 'value', artifact: 'value', fresh: 'boolean' }, { usage: USAGE });
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
