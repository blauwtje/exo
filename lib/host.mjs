// The host that runs exo: `claude` or `codex`. EXO_HOST wins when it names a
// host, because Codex started from inside Claude Code inherits CLAUDECODE=1;
// then CLAUDECODE=1 means Claude Code, then any CODEX_ variable means Codex,
// and an undetected host counts as Claude Code, which keeps every guard on.
// Every script imports it as `#host` through the `imports` field of package.json.

import process from 'node:process';

const HOSTS = ['claude', 'codex'];

export function currentHost(env = process.env) {
  if (HOSTS.includes(env.EXO_HOST)) return env.EXO_HOST;
  if (env.CLAUDECODE === '1') return 'claude';
  if (Object.keys(env).some((name) => name.startsWith('CODEX_'))) return 'codex';
  return 'claude';
}
