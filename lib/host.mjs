import process from 'node:process';
import { harnessNames } from '../harnesses/capabilities.mjs';

const HOSTS = harnessNames();

export function currentHost(env = process.env) {
  if (HOSTS.includes(env.EXO_HOST)) return env.EXO_HOST;
  return 'claude';
}
