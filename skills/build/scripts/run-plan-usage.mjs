import path from 'node:path';
import process from 'node:process';

export const RUN_PLAN_USAGE = `Runs a plan unattended, each unlanded task in a fresh headless claude process, then the review tail.

  node run-plan.mjs <plan.md> [--root <dir>] [--max-iterations <n>] [--timeout <minutes>]
    [--provider <name>] [--model <m>] [--effort <e>] [--max-budget-usd <x>] [--max-run-usd <x>]
    [--session auto|task|plan] [--claude <path>] [--plugin-dir <path>] [--dry-run]

Exit 0 done with gate PASS, 3 parked, 1 any other stop, 2 refusal or bad arguments.
Logs, summary.txt, tasks.json and progress.md go to .exo/run-plan/<plan-id>/<UTC time>/.`;

export const DEFAULT_TIMEOUT_MINUTES = 60;
