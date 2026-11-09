import fs from 'node:fs';
import path from 'node:path';

const SCOPES = ['user', 'project'];
const PLAIN_PATH = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/i;
const SKILL_NAME = /^[a-z0-9][a-z0-9-]*$/;
const isPlain = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

function validInstall(entry) {
  return isPlain(entry)
    && SCOPES.includes(entry.scope)
    && (entry.scope === 'user' ? entry.project === undefined : typeof entry.project === 'string' && path.isAbsolute(entry.project))
    && Array.isArray(entry.skills) && entry.skills.every((skill) => isPlain(skill) && SKILL_NAME.test(skill.name)
      && Array.isArray(skill.files) && skill.files.every((file) => isPlain(file) && PLAIN_PATH.test(file.path) && typeof file.sha256 === 'string'))
    && Array.isArray(entry.agents) && entry.agents.every((agent) => isPlain(agent) && PLAIN_PATH.test(agent.name) && typeof agent.sha256 === 'string')
    && Array.isArray(entry.links) && Array.isArray(entry.hooks) && Array.isArray(entry.excludes) && Array.isArray(entry.created);
}

export function readInstalls(file) {
  if (!fs.existsSync(file)) return [];
  const notRecord = new Error(`${file} is not an exo install record; fix or move it, nothing was written`);
  let record;
  try {
    record = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw notRecord;
  }
  if (!isPlain(record) || !Array.isArray(record.installs) || !record.installs.every(validInstall)) throw notRecord;
  return record.installs;
}
