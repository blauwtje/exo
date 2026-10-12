import process from 'node:process';

const HOSTS = ['claude', 'codex'];

export function currentHost(env = process.env) {
  if (HOSTS.includes(env.EXO_HOST)) return env.EXO_HOST;
  return 'claude';
}
