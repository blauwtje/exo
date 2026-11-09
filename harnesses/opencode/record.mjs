import path from 'node:path';
import { isPlain, readRecord } from '../install-files.mjs';

export const SCOPES = ['user', 'project'];
export const PLAIN_PATH = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/i;
const SKILL_NAME = /^[a-z0-9][a-z0-9-]*$/;

function validInstall(entry) {
  return isPlain(entry)
    && SCOPES.includes(entry.scope)
    && (entry.scope === 'user' ? entry.project === undefined : typeof entry.project === 'string' && path.isAbsolute(entry.project))
    && Array.isArray(entry.skills) && entry.skills.every((skill) => isPlain(skill) && SKILL_NAME.test(skill.name)
      && Array.isArray(skill.files) && skill.files.every((file) => isPlain(file) && PLAIN_PATH.test(file.path) && typeof file.sha256 === 'string'))
    && Array.isArray(entry.agents) && entry.agents.every((agent) => isPlain(agent) && PLAIN_PATH.test(agent.name) && typeof agent.sha256 === 'string');
}

export function readInstalls(file) {
  const record = readRecord(file, 'written');
  if (record === undefined) return [];
  const notRecord = new Error(`${file} is not an exo install record; fix or move it, nothing was written`);
  if (!isPlain(record) || !Array.isArray(record.installs) || !record.installs.every(validInstall)) throw notRecord;
  return record.installs;
}
