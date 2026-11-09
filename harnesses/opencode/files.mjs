import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { writeAtomic } from '../../lib/basics.mjs';

const hashOf = (content) => crypto.createHash('sha256').update(content).digest('hex');
const statOf = (file) => fs.lstatSync(file, { throwIfNoEntry: false });

function plainChain(base, relative) {
  let current = base;
  for (const part of relative.split('/').slice(0, -1)) {
    current = path.join(current, part);
    const stat = statOf(current);
    if (stat === undefined) return true;
    if (!stat.isDirectory()) return false;
  }
  return true;
}

export function planFile({ target, relative, text, recorded, plan }) {
  const file = path.join(target, ...relative.split('/'));
  const sha256 = hashOf(text);
  const stat = statOf(file);
  const currentHash = stat?.isFile() ? hashOf(fs.readFileSync(file)) : undefined;
  if (!plainChain(target, relative) || (stat !== undefined && currentHash === undefined)) {
    plan.conflicts.push(`${file} exists and exo did not write it`);
    return undefined;
  }
  const ours = recorded !== undefined && (currentHash === recorded.sha256 || currentHash === sha256);
  if (currentHash !== undefined && currentHash !== sha256 && !ours) {
    plan.conflicts.push(`${file} exists and exo did not write it`);
    return undefined;
  }
  if (currentHash !== sha256) plan.writes.push(() => writeAtomic(file, text));
  return sha256;
}

export function tryRmdir(folder) {
  try {
    fs.rmdirSync(folder);
  } catch {
    return;
  }
}

export function releaseFiles({ target, entries, plan }) {
  const folders = new Set();
  for (const entry of entries) {
    const file = path.join(target, ...entry.path.split('/'));
    for (let folder = path.dirname(file); folder !== target; folder = path.dirname(folder)) folders.add(folder);
    const stat = statOf(file);
    if (stat === undefined) continue;
    const unchanged = plainChain(target, entry.path) && stat.isFile() && hashOf(fs.readFileSync(file)) === entry.sha256;
    if (unchanged) plan.writes.push(() => fs.unlinkSync(file));
    else plan.notes.push(`kept ${file}: it is not the file exo wrote`);
  }
  plan.writes.push(() => {
    for (const folder of [...folders].sort((left, right) => right.length - left.length)) tryRmdir(folder);
  });
}

export const skillEntries = (skills) => skills.flatMap((skill) => skill.files.map((file) => ({ path: `skills/${skill.name}/${file.path}`, sha256: file.sha256 })));
export const agentEntries = (agents) => agents.map((agent) => ({ path: `agents/${agent.name}`, sha256: agent.sha256 }));

export function planSkill({ target, skill, files, oldSkill, plan }) {
  const entry = { name: skill, files: [] };
  for (const [relative, text] of files) {
    const recorded = oldSkill?.files.find((file) => file.path === relative);
    const sha256 = planFile({ target, relative: `skills/${skill}/${relative}`, text, recorded, plan });
    if (sha256 !== undefined) entry.files.push({ path: relative, sha256 });
  }
  return entry;
}
