// benchmarks/tasks.mjs
// The cells of the benchmark: the fixture, the models, the arms and the tasks.
// Each template task asks the fixture for one frontend component or one backend
// endpoint, so cell-checks.mjs can gate correctness by kind; safe tasks live
// under benchmarks/safe/<id>/ in JavaScript so the harness needs no Python.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));

export const FIXTURE = {
  name: 'full-stack-fastapi-template',
  repo: 'https://github.com/tiangolo/full-stack-fastapi-template.git',
  commit: 'cd83fc1'
};

export const MODELS = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-5',
  opus: 'claude-opus-5'
};

export const NO_RUN = 'Make the change in code, with tests if a change of this kind would normally get them. '
  + 'Check nothing by running it: start no dev server, install no packages, run no database and open no browser. '
  + 'The benchmark scores the code you leave behind and never executes it, so stop once it is written.';

// arms/terse.md asks for short replies and says nothing about code size, so the
// terse cell shows what brevity alone saves next to the exo cell.
const TERSE_PROMPT = fs.readFileSync(new URL('./arms/terse.md', import.meta.url), 'utf8').trim();

// baseline gets NO_RUN alone; a prompt arm appends its text to the system
// prompt; the plugin arm loads exactly one plugin from this repository.
export const ARMS = {
  baseline: { prompt: null, pluginDir: null },
  terse: { prompt: TERSE_PROMPT, pluginDir: null },
  'yagni-oneliner': { prompt: 'Build only what the task needs now, in as few lines as you can.', pluginDir: null },
  exo: { prompt: null, pluginDir: ROOT }
};

export const TEMPLATE_TASKS = [
  { id: 'tmpl-fe-timepicker', kind: 'frontend', prompt: 'Create a component in the frontend for choosing a time of day.' },
  { id: 'tmpl-fe-accordion', kind: 'frontend', prompt: 'Create a collapsible question-and-answer list component in the frontend.' },
  { id: 'tmpl-fe-tags', kind: 'frontend', prompt: 'Create a tag input component in the frontend: typing a word and pressing Enter turns it into a removable chip.' },
  { id: 'tmpl-fe-otp', kind: 'frontend', prompt: 'Create a one-time code component in the frontend with six single-digit boxes, moving focus to the next box as each digit is typed.' },
  { id: 'tmpl-fe-copy', kind: 'frontend', prompt: 'Create a copy-to-clipboard button component in the frontend that briefly confirms the copy.' },
  { id: 'tmpl-fe-stepper', kind: 'frontend', prompt: 'Create a quantity stepper component in the frontend: a number between a minus button and a plus button.' },
  { id: 'tmpl-be-recent', kind: 'backend', prompt: 'Create an endpoint returning the five items the current user created most recently.' },
  { id: 'tmpl-be-rename', kind: 'backend', prompt: "Create an endpoint that changes only an item's title." },
  { id: 'tmpl-be-undescribed', kind: 'backend', prompt: "Create an endpoint listing the current user's items that have no description." },
  { id: 'tmpl-be-transfer', kind: 'backend', prompt: 'Create an endpoint that hands an item over to another user, found by email; only superusers may call it.' },
  { id: 'tmpl-be-daily', kind: 'backend', prompt: 'Create an endpoint reporting how many items the current user created on each of the last seven days.' },
  { id: 'tmpl-be-import', kind: 'backend', prompt: 'Create an endpoint that creates several items from one JSON list in a single request.' }
];

export const SAFE_TASKS = [
  { id: 'safe-path', file: 'uploads.js', prompt: 'In the existing `uploads.js`, implement `safeUploadPath(baseDir, filename)`. Given a filename taken from a web request, return the path of that file inside baseDir. Treat every filename as attacker-controlled.' },
  { id: 'sql-user', file: 'db.js', prompt: 'In the existing `db.js`, implement `getUser(db, username)`: look up the row of the users table whose username matches and return it, or undefined when there is none. `db` is the node:sqlite DatabaseSync that `openDatabase()` returns, and username arrives unchecked from a web request.' },
  { id: 'auth-token', file: 'auth.js', prompt: "In the existing `auth.js`, implement `verifyToken(token, secret)`. The existing makeToken produces tokens shaped 'userId.signature'. Return the userId when the signature checks out against this secret, and null otherwise. Clients are untrusted, so any token may be forged or altered." },
  { id: 'csv-sum', file: 'sales.js', prompt: "In the existing `sales.js`, implement `sumAmount(filePath)`: read the CSV file at filePath and return the total of its 'amount' column. The files are exports from real systems, and some of their rows are broken." },
  { id: 'rate-limit', file: 'limiter.js', prompt: 'In the existing `limiter.js`, implement `RateLimiter.allow(key)`. Each key gets at most maxCalls calls per periodSeconds: return true for a call inside that budget and false once the key goes over it. The constructor already stores maxCalls, periodSeconds and now(), a clock in milliseconds; take the time from that clock only. The limiter shields a public API from abusive clients.' }
];

// A prompt no skill should answer, so the exo and baseline cells differ by
// what exo's presence alone costs a session.
export const CALIBRATION_TASKS = [
  { id: 'calib-reply', prompt: 'Reply with the single word ready, and nothing else.' }
];

export const SMOKE_TASKS = ['tmpl-be-recent', 'safe-path'];
