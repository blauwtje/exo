import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeAtomic } from '../../lib/basics.mjs';
import { apply, combine, jsonText, removeInstalls, sameInstall, statOf } from '../install-files.mjs';
import { onPath } from '../on-path.mjs';
import { agentEntries, planFile, planSkill, releaseFiles, skillEntries, tryRmdir } from './files.mjs';
import { generateOpenCodeTree } from './generate.mjs';
import { PLAIN_PATH, SCOPES, readInstalls } from './record.mjs';

export const name = 'opencode';
export const label = 'OpenCode';

const matches = (install, selector) => (selector.scope === undefined || install.scope === selector.scope)
  && (selector.project === undefined || install.project === selector.project);

function locations(env, scope = 'user', project) {
  const home = env.HOME || env.USERPROFILE || os.homedir();
  const configHome = path.join(home, '.config', 'opencode');
  const recordFile = path.join(configHome, 'exo', 'installed.json');
  const target = scope === 'user' ? configHome : path.join(project, '.opencode');
  return { home, configHome, recordFile, target };
}

function generated(root) {
  const skills = new Map();
  const agents = new Map();
  for (const [file, text] of generateOpenCodeTree(root)) {
    if (!PLAIN_PATH.test(file)) throw new Error(`generated path ${JSON.stringify(file)} is not a plain path`);
    const [kind, ...rest] = file.split('/');
    if (kind === 'agents') agents.set(rest.join('/'), text);
    if (kind !== 'skills') continue;
    const [skill, ...inside] = rest;
    if (!skills.has(skill)) skills.set(skill, new Map());
    skills.get(skill).set(inside.join('/'), text);
  }
  return { skills, agents };
}

function checkProject(scope, project) {
  if (scope === 'user') {
    if (project !== undefined) throw new Error('OpenCode user scope takes no project folder');
    return;
  }
  if (typeof project !== 'string' || !path.isAbsolute(project)) throw new Error(`OpenCode project scope needs an absolute project folder, got ${JSON.stringify(project)}`);
  if (!statOf(project)?.isDirectory()) throw new Error(`project folder ${project} is not a folder`);
  const folder = path.join(project, '.opencode');
  if (statOf(folder)?.isSymbolicLink()) throw new Error(`${folder} is a link; exo does not write through a symlink in a project`);
}

function planInstall({ root, env, scope, project }, verb = 'installed') {
  if (!SCOPES.includes(scope)) throw new Error(`OpenCode scope must be one of ${SCOPES.join(', ')}, got ${JSON.stringify(scope)}`);
  checkProject(scope, project);
  const where = locations(env, scope, project);
  const installs = readInstalls(where.recordFile);
  const old = installs.find((entry) => sameInstall(entry, { scope, project }));
  const { skills, agents } = generated(root);
  const next = { scope, ...(project === undefined ? {} : { project }), skills: [], agents: [] };
  const plan = { conflicts: [], notes: [], writes: [] };
  const { target } = where;

  for (const [skill, files] of skills) {
    const oldSkill = old?.skills.find((entry) => entry.name === skill);
    next.skills.push(planSkill({ target, skill, files, oldSkill, plan }));
  }
  for (const [file, text] of agents) {
    const recorded = old?.agents.find((entry) => entry.name === file);
    const sha256 = planFile({ target, relative: `agents/${file}`, text, recorded, plan });
    if (sha256 !== undefined) next.agents.push({ name: file, sha256 });
  }
  if (plan.conflicts.length > 0) throw new Error(`${plan.conflicts.join('\n')}\nNothing was written. Move those aside, or remove them, then rerun.`);

  const kept = new Set([...skillEntries(next.skills), ...agentEntries(next.agents)].map((entry) => entry.path));
  const stale = [...skillEntries(old?.skills ?? []), ...agentEntries(old?.agents ?? [])].filter((entry) => !kept.has(entry.path));
  releaseFiles({ target, entries: stale, plan });
  const others = installs.filter((entry) => !sameInstall(entry, next));
  const fileCount = next.skills.reduce((total, skill) => total + skill.files.length, 0);
  return {
    writes: [...plan.writes, () => writeAtomic(where.recordFile, jsonText({ version: 2, installs: [...others, next] }))],
    notes: plan.notes,
    summary: `${verb} ${next.skills.length} skills (${fileCount} files) and ${next.agents.length} agents into ${target}`
  };
}

function planRemove(install, installs, env) {
  const where = locations(env, install.scope, install.project);
  const plan = { notes: [], writes: [] };
  const entries = [...skillEntries(install.skills), ...agentEntries(install.agents)];
  releaseFiles({ target: where.target, entries, plan });
  plan.writes.push(() => {
    tryRmdir(path.join(where.target, 'skills'));
    tryRmdir(path.join(where.target, 'agents'));
    if (install.scope === 'project') tryRmdir(where.target);
  });
  const rest = installs.filter((entry) => !sameInstall(entry, install));
  plan.writes.push(() => {
    if (rest.length > 0) {
      writeAtomic(where.recordFile, jsonText({ version: 2, installs: rest }));
      return;
    }
    fs.unlinkSync(where.recordFile);
    tryRmdir(path.dirname(where.recordFile));
    tryRmdir(where.configHome);
  });
  return { ...plan, summary: `removed the ${install.scope} install that ${where.recordFile} listed` };
}

export function detect(env) {
  if (onPath('opencode', env)) return { detected: true, installable: true };
  if (fs.existsSync(locations(env).configHome)) return { detected: true, installable: false, reason: '`opencode` is not on PATH although the OpenCode folder exists' };
  return { detected: false, installable: false, reason: '`opencode` is not on PATH' };
}

export function install(plan) {
  return apply(planInstall(plan));
}

export function recorded(env) {
  return readInstalls(locations(env).recordFile).length;
}

export function update(record) {
  const installs = readInstalls(locations(record.env).recordFile).filter((entry) => matches(entry, record));
  if (installs.length === 0) return 'nothing to update: no OpenCode install recorded';
  return combine(installs.map((entry) => {
    if (entry.scope !== 'user' && !statOf(entry.project)?.isDirectory()) return { summary: `skipped ${entry.scope} install in ${entry.project}`, notes: [`${entry.project} is not a folder; run --remove to drop its record`] };
    return apply(planInstall({ root: record.root, env: record.env, scope: entry.scope, project: entry.project }, 'updated'));
  }));
}

export function remove(record) {
  return removeInstalls(record, { locations, readInstalls, matches, planRemove });
}
