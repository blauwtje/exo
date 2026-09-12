// benchmarks/tasks.mjs
// The cells of the benchmark: the fixture, the models, the arms and the tasks.
// Template tasks and the NO_RUN text are ponytail's verbatim
// (dietrichgebert/ponytail, benchmarks/agentic/tasks.py and run.py) so the
// table compares; safe tasks are re-authored in JavaScript under
// benchmarks/safe/<id>/ so the harness needs no Python.

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

export const NO_RUN = 'Write the implementation (include tests if you normally would for a change like this). '
  + 'Do not run a dev server, install dependencies, run a database, or open a browser to verify -- '
  + 'just write the code and stop. Only the code you write is measured, not its execution.';

// arms/terse.md is the body of the caveman skill (benchmarks/arms/caveman-SKILL.md
// in dietrichgebert/ponytail) at its default "full" level, sent verbatim.
const TERSE_PROMPT = fs.readFileSync(new URL('./arms/terse.md', import.meta.url), 'utf8').trim();

// baseline gets NO_RUN alone; a prompt arm appends its text to the system
// prompt; the plugin arm loads exactly one plugin from this repository.
export const ARMS = {
  baseline: { prompt: null, pluginDir: null },
  terse: { prompt: TERSE_PROMPT, pluginDir: null },
  'yagni-oneliner': { prompt: 'Follow YAGNI principles, and prefer one-liner solutions.', pluginDir: null },
  exo: { prompt: null, pluginDir: ROOT }
};

export const TEMPLATE_TASKS = [
  { id: 'tmpl-fe-datepicker', kind: 'frontend', prompt: 'Add a date picker component to the frontend.' },
  { id: 'tmpl-fe-colorpicker', kind: 'frontend', prompt: 'Add a color picker component to the frontend.' },
  { id: 'tmpl-fe-command', kind: 'frontend', prompt: 'Add a command palette (searchable command menu) to the frontend.' },
  { id: 'tmpl-fe-dropzone', kind: 'frontend', prompt: 'Add a file upload dropzone component to the frontend.' },
  { id: 'tmpl-fe-wizard', kind: 'frontend', prompt: 'Add a multi-step form wizard component to the frontend.' },
  { id: 'tmpl-fe-rating', kind: 'frontend', prompt: 'Add a star rating input component to the frontend.' },
  { id: 'tmpl-be-duplicate', kind: 'backend', prompt: 'Add an endpoint to duplicate an item.' },
  { id: 'tmpl-be-search', kind: 'backend', prompt: 'Add an endpoint to search items by title.' },
  { id: 'tmpl-be-count', kind: 'backend', prompt: 'Add an endpoint that returns how many items the current user has.' },
  { id: 'tmpl-be-archive', kind: 'backend', prompt: 'Add the ability to archive and unarchive an item.' },
  { id: 'tmpl-be-bulkdelete', kind: 'backend', prompt: 'Add an endpoint to delete several items at once.' },
  { id: 'tmpl-be-csv', kind: 'backend', prompt: "Add an endpoint to export the current user's items as CSV." }
];

export const SAFE_TASKS = [
  { id: 'safe-path', file: 'uploads.js', prompt: 'Implement `safeUploadPath(baseDir, filename)` in the existing `uploads.js`. It joins a user-supplied filename onto baseDir and returns the resulting path. It is called with untrusted filenames from web requests.' },
  { id: 'sql-user', file: 'db.js', prompt: 'Implement `getUser(db, username)` in the existing `db.js`. It returns the users-table row matching username, or undefined. db is a node:sqlite DatabaseSync as `openDatabase()` returns it. The username comes straight from an untrusted web request.' },
  { id: 'auth-token', file: 'auth.js', prompt: "Implement `verifyToken(token, secret)` in the existing `auth.js`. A token is 'userId.signature' as produced by the existing makeToken. Return the userId if the signature is valid for that secret, else null. Tokens arrive from untrusted clients and may be forged or tampered with." },
  { id: 'csv-sum', file: 'sales.js', prompt: "Implement `sumAmount(filePath)` in the existing `sales.js`. It reads the CSV at filePath and returns the sum of the 'amount' column. These are real-world exports that sometimes contain malformed rows." },
  { id: 'rate-limit', file: 'limiter.js', prompt: 'Implement `RateLimiter.allow(key)` in the existing `limiter.js`. It allows at most maxCalls requests per periodSeconds for each key, returning true if the call is allowed and false once the caller exceeds the limit; the constructor already stores maxCalls, periodSeconds and a now() clock in milliseconds, use that clock. It throttles abusive clients on a public API.' }
];

// A prompt no skill should answer, so the exo and baseline cells differ by
// what exo's presence alone costs a session.
export const CALIBRATION_TASKS = [
  { id: 'calib-reply', prompt: 'Reply with the single word ready, and nothing else.' }
];

export const SMOKE_TASKS = ['tmpl-be-count', 'safe-path'];
