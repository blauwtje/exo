import fs from 'node:fs';
import process from 'node:process';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { frameOf, openPoints } from '#plan-frame';
import { parsePlan } from '#plan-tasks';
import { scratchPath, ScratchPathError } from '#scratch-path';

const USAGE = [
  'usage: node next-stage.mjs --after <stage> --artifact <path>',
  'Prints the next-stage question.',
].join('\n');

const START_TEXT = {
  local: 'runs in the background and stays on this machine',
  'push-main': 'runs in the background, then goes to main',
  pr: 'runs in the background, then opens a pull request'
};

function startText(artifact) {
  const file = briefFile(artifact);
  const land = file === null ? null : frameOf(parsePlan(fs.readFileSync(file, 'utf8')).frame).land;
  return START_TEXT[land ?? 'local'];
}

const NEXT_STAGE = {
  'spec': { report: specReport },
  'build': { report: () => 'Reply with what to change.\n' },
  'find-cause': {
    title: 'Build the fix?',
    context: () => 'The cause is found.',
    options: [['Build', 'fix it now'], ['Stop', 'leave it as is']],
    reason: 'this chat knows the fix'
  }
};

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

function nextStageReport({ after, artifact }) {
  const stage = NEXT_STAGE[after];
  if (stage === undefined) throw new UsageError(`no next stage known after '${after}'`);
  if (stage.report !== undefined) return stage.report(artifact);
  const options = stage.options.map(([label, does], index) => {
    const text = typeof does === 'function' ? does(artifact) : does;
    return `- **(${String.fromCharCode(65 + index)}) ${label}**: ${text}`;
  });
  const lines = [`**${stage.title}**`, stage.context(artifact), '', ...options, '', `Recommended: (A), because ${stage.reason}`];
  return `${lines.join('\n')}\n`;
}

function specReport(artifact) {
  const open = openEntries(artifact);
  if (open.length > 0) return openPointsReport(artifact, open);
  return `**Start the build, or change the brief?** It ${startText(artifact)}.\nReply \`ok\` to start, or say what to change.\n`;
}

function openEntries(artifact) {
  const file = briefFile(artifact);
  return file === null ? [] : openPoints(fs.readFileSync(file, 'utf8'));
}

function openPointsReport(artifact, open) {
  return [
    `The brief has ${open.length} open point${open.length === 1 ? '' : 's'}. Answer ${open.length === 1 ? 'it' : 'them'} first:`,
    ...open.map((entry) => `- ${entry}`)
  ].join('\n') + '\n';
}

function main(argv) {
  const flags = parseFlags(argv, { after: 'value', artifact: 'value' }, { usage: USAGE });
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
