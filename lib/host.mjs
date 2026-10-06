// The host that runs exo: `claude` or `codex`. Only EXO_HOST decides, because
// each install writes its own host into its hook and script commands and no
// inherited name (CLAUDECODE, CODEX_*) reliably tells which host runs a script.
// A missing or unknown value counts as Claude Code, which keeps every guard on.
// Every script imports it as `#host` through the `imports` field of package.json.

import process from 'node:process';

const HOSTS = ['claude', 'codex'];

export function currentHost(env = process.env) {
  if (HOSTS.includes(env.EXO_HOST)) return env.EXO_HOST;
  return 'claude';
}
