// Lands one green task: refuses before it stages or commits anything when
// the checkout has changed or added a path outside the task's `Files:`,
// else runs the task's `Commit:` block as the plan wrote it, checks that the
// new commit carries the `Plan-task: <n>` trailer and that the landed set now
// holds the task, and prints that set, so the session neither pastes the
// block nor reads the log. A compact task lands only on a build report whose
// `Proof:` command, or with none its Success-criterion test, passed, and the
// printout carries that output.

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseFlags, UsageError } from '#script-flags';
import { landedTasks, parsePlan, PlanError } from '#plan-tasks';
import { SCRATCH_FOLDER } from '#scratch-path';

/** The plan or the checkout gave no commit to land: exit 1 with an empty stdout. */
export class LandingError extends Error {}

// Single-quoted, with an embedded quote escaped by closing, escaping, and
// reopening the quote, so bash takes a path or title literally even with a
// `$`, backtick or double quote in it.
function shellQuote(value) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

// A compact task carries no `Commit:` block by design: its heading title is
// the commit subject and its `Files:` field is the `git add` list, so this
// derives the same shape land-task would otherwise read from the plan text.
function deriveCommit(task, number) {
  if (task.files.length === 0) {
    throw new LandingError(`Task ${number} has no Commit: block and no Files: to derive one from`);
  }
  const addArgs = task.files.map((file) => shellQuote(file.path)).join(' ');
  return `git add ${addArgs}\ngit commit -m ${shellQuote(task.title)} -m "Plan-task: ${number}"`;
}

export function commitBlockOf(plan, number) {
  const task = plan.tasks.find((entry) => entry.number === number);
  if (task === undefined) throw new UsageError(`no Task ${number} in the plan`);
  if (task.commitBlock !== null) {
    if (!task.commitBlock.includes(`"Plan-task: ${number}"`)) {
      throw new LandingError(`the Commit: block of Task ${number} carries no "Plan-task: ${number}" trailer`);
    }
    return task.commitBlock;
  }
  if (task.compact) return deriveCommit(task, number);
  throw new LandingError(`Task ${number} has no Commit: block`);
}

const SKIPPED_OUTCOME = /^(?:skip|skipped|todo|pending)\b/;

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// `<command>: <outcome>`, backticked or bare, optionally as a list item; a
// bare command runs to the last colon, so `npm run test:unit: pass` keeps its
// script name.
const ANY_OUTCOME_LINE = /^\s*(?:[-*]\s+)?(?:`([^`]+)`|(.+)):\s*(.*?)\s*$/;
// The build report's own field names, never a command.
const REPORT_FIELDS = new Set(['Landed', 'Proof', 'Unresolved']);
// Lines that end a command's output: the report's own fields (including
// `Report:`, the GREEN template's last line) or another backticked
// `command`: outcome line. A bare line with a colon, or one starting with
// `#`, stays output, since either is as likely to be the command's own text
// (for example "pass kebab-case: 4 cases..." or a TAP "# pass 3" count).
const OUTPUT_END_LINE = new RegExp(`^\\s*(?:[-*]\\s+)?(?:${[...REPORT_FIELDS, 'Report'].join('|')}):|^\\s*(?:[-*]\\s+)?\`[^\`]+\`:\\s*\\S`);

// The command whose outcome proves the task: the plan's `Proof:`, or for an
// older compact plan with none, the first command the report gives an outcome
// for, which is the Success-criterion test build-task wrote or picked.
function provedCommand(task, lines) {
  if (task.proof !== null) return task.proof.replace(/^`(.*)`$/, '$1');
  for (const line of lines) {
    const match = line.match(ANY_OUTCOME_LINE);
    const command = match?.[1] ?? match?.[2];
    if (command !== undefined && match[3] !== '' && !REPORT_FIELDS.has(command)) return command;
  }
  throw new LandingError(`Task ${task.number}: no Proof: command, and the build report has no "<test>: pass" line`);
}

// A task is done only on proof from the real product: the report's
// `<command>: pass` line with the command's own output under it, at any
// indentation. Any other outcome for that command, or none, leaves the task
// not done.
export function proofOf(task, reportText, reportPath) {
  if (reportText === null) {
    const wanted = task.proof === null ? 'a test for the Success criterion' : `"${task.proof}"`;
    throw new LandingError(`Task ${task.number}: no build report at '${reportPath}' to prove ${wanted}`);
  }
  const lines = reportText.replace(/\r\n/g, '\n').split('\n');
  const command = provedCommand(task, lines);
  const outcomeLine = new RegExp(`^(\\s*)(?:[-*]\\s+)?\`?${escapeRegExp(command)}\`?:\\s*(.*?)\\s*$`);
  const outcomes = lines.flatMap((line, index) => {
    const match = line.match(outcomeLine);
    return match === null ? [] : [{ outcome: match[2].toLowerCase(), indent: match[1].length, index }];
  });
  if (outcomes.length === 0) {
    throw new LandingError(`Task ${task.number}: the build report has no "${command}: pass" line`);
  }
  const skipped = outcomes.find(({ outcome }) => SKIPPED_OUTCOME.test(outcome));
  if (skipped !== undefined) throw new LandingError(`Task ${task.number}: the Proof: command "${command}" was skipped`);
  const unclear = outcomes.find(({ outcome }) => outcome !== 'pass');
  if (unclear !== undefined) {
    throw new LandingError(`Task ${task.number}: the build report reads "${command}: ${unclear.outcome}", no clear pass`);
  }
  // Blank lines before the output, and any indentation the output carries
  // relative to its outcome line, are the report writer's style, not a rule:
  // only an end-of-output line closes the loop.
  const output = [];
  for (const line of lines.slice(outcomes[0].index + 1)) {
    if (line.trim() === '') continue;
    if (OUTPUT_END_LINE.test(line)) break;
    output.push(line);
  }
  if (output.length === 0) {
    throw new LandingError(`Task ${task.number}: the build report shows no output under "${command}: pass"`);
  }
  return [`${command}: pass`, ...output].join('\n');
}

// Every path the checkout has changed or added since HEAD, tracked or not: a
// `Commit:` block's own `git add` (the derived Files: list for a compact
// task, or a plan-written `git add .`) stages an untracked path alongside the
// task's files, so an untracked stray is as real as a tracked one. The
// checkout's own `${SCRATCH_FOLDER}/` scratch folder (the build report
// land-task itself reads) is never a stray: a host that has not yet run
// `scratch-exclude.mjs` still leaves it untracked, so it is dropped here
// rather than trusted to `--exclude-standard`.
function changedPaths(root) {
  const tracked = execFileSync('git', ['-C', root, 'diff', '--name-only', 'HEAD'], { encoding: 'utf8' });
  const untracked = execFileSync('git', ['-C', root, 'ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' });
  const scratchPrefix = `${SCRATCH_FOLDER}/`;
  return [...new Set([...tracked.split('\n'), ...untracked.split('\n')])]
    .filter((line) => line !== '' && !line.startsWith(scratchPrefix));
}

// A task lands only the paths its `Files:` lines name: a build that also
// touched or added another path is not this task's, whatever its proof, so
// this stops the Commit: block before it stages or commits anything.
function strayPaths(task, root) {
  const allowed = new Set(task.files.map((file) => file.path));
  return changedPaths(root).filter((changed) => !allowed.has(changed));
}

export function landTask({ planText, number, root, reportText = null, reportPath = '--report' }) {
  const plan = parsePlan(planText);
  const block = commitBlockOf(plan, number);
  const task = plan.tasks.find((entry) => entry.number === number);
  const stray = strayPaths(task, root);
  if (stray.length > 0) {
    throw new LandingError(`Task ${number} changed a path outside Files: ${stray.map((file) => `\`${file}\``).join(', ')}`);
  }
  const proof = task.compact ? proofOf(task, reportText, reportPath) : null;
  // The block runs under bash, as the plugin's hooks do; a host without bash
  // fails those hooks before this script runs.
  const commit = spawnSync('bash', ['-e', '-c', block], { cwd: root, encoding: 'utf8' });
  if (commit.status !== 0) {
    const output = `${commit.stdout ?? ''}${commit.stderr ?? ''}${commit.error?.message ?? ''}`.trim();
    throw new LandingError(`the Commit: block of Task ${number} failed:\n${output}`);
  }
  const head = execFileSync('git', ['-C', root, 'log', '-1', '--format=%h%n%s%n%B'], { encoding: 'utf8' });
  const [sha, subject, ...body] = head.split('\n');
  if (!new RegExp(`^Plan-task: ${number}$`, 'm').test(body.join('\n'))) {
    throw new LandingError(`HEAD ${sha} carries no "Plan-task: ${number}" trailer`);
  }
  // bash expands the block, so a `$` or backquote in its subject can commit a
  // subject the plan does not give, and next-task would build the task again.
  const landed = landedTasks(plan.tasks, root);
  if (!landed.includes(number)) {
    throw new LandingError(`HEAD ${sha} carries "Plan-task: ${number}", yet next-task does not count Task ${number} as landed: the commit's subject reads "${subject}" and the Commit: block gives "${task.commitSubject}"`);
  }
  const proofLines = proof === null ? '' : `Proof: ${proof}\n`;
  return `Committed: ${sha} Task ${number}\n${proofLines}Landed: ${landed.join(', ')}\n`;
}

function main(argv) {
  const flags = parseFlags(argv, { plan: 'value', task: 'value', root: 'value', report: 'value' });
  if (flags.plan === undefined) throw new UsageError("flag '--plan' names the plan file");
  if (!/^\d+$/.test(flags.task ?? '')) throw new UsageError("flag '--task' needs a task number");
  if (!fs.existsSync(flags.plan)) throw new UsageError(`no plan at '${flags.plan}'`);
  const planText = fs.readFileSync(flags.plan, 'utf8');
  const root = flags.root ?? process.cwd();
  // The implementer prompt's `Report to:` path, so a wave's per-task worktree
  // finds its own report with no extra flag.
  const reportPath = flags.report ?? path.join(root, '.exo', `implementer-${flags.task}.md`);
  const reportText = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, 'utf8') : null;
  process.stdout.write(landTask({ planText, number: Number(flags.task), root, reportText, reportPath }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`land-task: ${error.message}\n`);
      process.exitCode = 2;
    } else if (error instanceof LandingError || error instanceof PlanError) {
      process.stderr.write(`land-task: ${error.message}\n`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}
