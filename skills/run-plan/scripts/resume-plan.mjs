// Keeps a running plan going across a stop, a clear and a compaction.
// run-plan writes `<git-dir>/exo/run-plan.active` at its step 1 and removes it
// at step 7. Its lines are the plan path, the run's checkout (may be empty),
// the session id and the ISO write time; only a plan named there with an open
// task counts as running.
//
//   node resume-plan.mjs stop      Stop hook: blocks once with the next task
//   node resume-plan.mjs session   SessionStart on clear or compact: prints the
//                                  line that sends the session back to run-plan
//
// Stdin is the hook JSON. Any failure to read the marker, the plan or the
// history prints nothing, because a hook error must never stop a session.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { landedTasks, parsePlan, readyTasks } from '#plan-tasks';

const MARKER_LIFETIME_MS = 6 * 60 * 60 * 1000;

// The first ready task of the plan, or null once every task landed.
function firstOpenTask(planPath, root) {
  if (!fs.existsSync(planPath)) return null;
  const tasks = parsePlan(fs.readFileSync(planPath, 'utf8')).tasks;
  const [next] = readyTasks(tasks, landedTasks(tasks, root));
  return next === undefined ? null : { planPath, task: next };
}

// The first open task of the running plan, or null when no live marker names
// a plan or every task landed. A marker past its lifetime, or one written by
// another session when `sessionId` is given, is removed, so an abandoned run
// or another session's run never blocks this one.
export function runningPlan(cwd, sessionId) {
  const gitDirectory = execFileSync('git', ['-C', cwd, 'rev-parse', '--absolute-git-dir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const marker = path.join(gitDirectory, 'exo', 'run-plan.active');
  if (!fs.existsSync(marker)) return null;
  const [planPath, checkout, markerSession, writtenAt] = fs.readFileSync(marker, 'utf8').split('\n').map((line) => line.trim());
  const age = Date.now() - Date.parse(writtenAt);
  if (Number.isNaN(age) || age >= MARKER_LIFETIME_MS || (sessionId !== undefined && sessionId !== markerSession)) {
    fs.rmSync(marker, { force: true });
    return null;
  }
  if (!planPath) return null;
  return firstOpenTask(planPath, checkout || cwd);
}

// Stop: `stop_hook_active` means this stop already follows one block, so the
// session may end its turn, for a question to the user or a blocked task.
export function stopOutput(input) {
  if (input.stop_hook_active === true || typeof input.session_id !== 'string') return '';
  const running = runningPlan(input.cwd || process.cwd(), input.session_id);
  if (running === null) return '';
  const reason = `Next: Task ${running.task.number}: ${running.task.title}. Continue exo:run-plan on ${running.planPath} from step 3.`;
  return `${JSON.stringify({ decision: 'block', reason })}\n`;
}

// SessionStart checks only the marker's age: whether a clear keeps the
// session id is undocumented, and run-plan rewrites the marker when it resumes.
export function sessionOutput(input) {
  const running = runningPlan(input.cwd || process.cwd());
  if (running === null) return '';
  return `A plan is running: ${running.planPath}. On the next message, start the skill exo:run-plan on this plan.\n`;
}

const OUTPUTS = { stop: stopOutput, session: sessionOutput };

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const output = OUTPUTS[process.argv[2]];
  if (output === undefined) {
    process.stderr.write("resume-plan: the first argument is 'stop' or 'session'\n");
    process.exitCode = 2;
  } else {
    try {
      process.stdout.write(output(JSON.parse(fs.readFileSync(0, 'utf8') || '{}')));
    } catch {
      // Outside a repository, or with an unreadable plan, nothing is running.
    }
  }
}
