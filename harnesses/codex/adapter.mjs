
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { isDeepStrictEqual } from 'node:util';
import { shellQuote, writeAtomic } from '../../lib/basics.mjs';
import { apply, hashOf, isPlain, jsonText, plainChain, readRecord, removeInstalls, sameInstall, statOf, updateInstalls } from '../install-files.mjs';
import { onPath } from '../on-path.mjs';
import { generateTree } from './generate.mjs';
import { codexHookEntries } from './hooks.mjs';

export const name = 'codex';
export const label = 'Codex';

const SCOPES = ['user', 'project', 'local'];
const SKILL_NAME = /^[a-z0-9][a-z0-9-]*$/;
const AGENT_FILE = /^[a-z0-9][a-z0-9-]*\.toml$/;
const PATH_PART = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const EXCLUDE_LINE = /^\/\.agents\/skills\/[a-z0-9][a-z0-9-]*\/$|^\/\.codex\/agents\/[a-z0-9][a-z0-9-]*\.toml$|^\/\.codex\/hooks\.json$/;
const SKILL_PREFIX = 'harnesses/codex/generated/skills/';
const AGENT_PREFIX = 'harnesses/codex/generated/agents/';

function safeName(value, pattern, what) {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error(`${what} name ${JSON.stringify(value)} is not a plain name`);
  return value;
}

function safeParts(relative) {
  if (typeof relative !== 'string') throw new Error(`file path ${JSON.stringify(relative)} is not a plain path`);
  const parts = relative.split('/');
  for (const part of parts) safeName(part, PATH_PART, 'path');
  return parts;
}

const emptyInstall = (scope, project) => ({ scope, ...(project === undefined ? {} : { project }), skills: [], links: [], agents: [], hooks: [], excludes: [], created: [] });

const CREATED = ['.agents', '.agents/skills', '.codex/agents', '.codex/hooks.json', '.codex'];

function createdPath(name, where) {
  return { '.agents': path.dirname(where.skillsDir), '.agents/skills': where.skillsDir, '.codex/agents': where.agentsDir, '.codex/hooks.json': where.hooksFile, '.codex': path.dirname(where.agentsDir) }[name];
}

function validInstall(entry) {
  return isPlain(entry)
    && SCOPES.includes(entry.scope)
    && (entry.scope === 'user' ? entry.project === undefined : typeof entry.project === 'string' && path.isAbsolute(entry.project))
    && Array.isArray(entry.created) && entry.created.every((name) => CREATED.includes(name) && (name !== '.codex' || entry.scope !== 'user'))
    && Array.isArray(entry.excludes) && entry.excludes.every((line) => typeof line === 'string' && EXCLUDE_LINE.test(line))
    && Array.isArray(entry.skills) && entry.skills.every((skill) => isPlain(skill) && SKILL_NAME.test(skill.name)
      && Array.isArray(skill.files) && skill.files.every((file) => isPlain(file) && typeof file.path === 'string' && typeof file.sha256 === 'string'))
    && Array.isArray(entry.links) && entry.links.every((link) => isPlain(link) && SKILL_NAME.test(link.name) && typeof link.source === 'string')
    && Array.isArray(entry.agents) && entry.agents.every((agent) => isPlain(agent) && AGENT_FILE.test(agent.name) && typeof agent.sha256 === 'string')
    && Array.isArray(entry.hooks) && entry.hooks.every((hook) => isPlain(hook) && typeof hook.event === 'string' && isPlain(hook.group));
}

function readInstalls(file) {
  const record = readRecord(file, 'written');
  if (record === undefined) return [];
  const notRecord = new Error(`${file} is not an exo install record; fix or move it, nothing was written`);
  if (!isPlain(record)) throw notRecord;
  if (Array.isArray(record.installs)) {
    const installs = record.installs.map((entry) => (isPlain(entry) ? { excludes: [], created: [], ...entry } : entry));
    if (!installs.every(validInstall)) throw notRecord;
    return installs;
  }
  const old = { scope: 'user', skills: [], links: record.skills, agents: record.agents, hooks: record.hooks, excludes: [], created: [] };
  if (!validInstall(old)) throw notRecord;
  return [old];
}

const matches = (install, selector) => (selector.scope === undefined || install.scope === selector.scope)
  && (selector.project === undefined || install.project === selector.project);
const withInstall = (installs, install) => [...installs.filter((entry) => !sameInstall(entry, install)), install];

function locations(env, scope = 'user', project) {
  const home = env.HOME || env.USERPROFILE || os.homedir();
  const codexHome = path.resolve(env.CODEX_HOME || path.join(home, '.codex'));
  const recordFile = path.join(codexHome, 'exo', 'installed.json');
  if (scope === 'user') {
    return { home, codexHome, recordFile, skillsDir: path.join(home, '.agents', 'skills'), agentsDir: path.join(codexHome, 'agents'), hooksFile: path.join(codexHome, 'hooks.json') };
  }
  return {
    home,
    codexHome,
    recordFile,
    skillsDir: path.join(project, '.agents', 'skills'),
    agentsDir: path.join(project, '.codex', 'agents'),
    hooksFile: path.join(project, '.codex', 'hooks.json'),
    excludeFile: path.join(project, '.git', 'info', 'exclude')
  };
}

function checkProject({ root, env, scope, project }) {
  if (typeof project !== 'string' || !path.isAbsolute(project)) throw new Error(`Codex ${scope} scope needs an absolute project folder, got ${JSON.stringify(project)}`);
  if (!fs.statSync(project, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`project folder ${project} is not a folder`);
  if (scope === 'project') {
    const clone = path.join(locations(env).home, '.exo');
    const sameClone = fs.existsSync(clone) && fs.realpathSync(clone) === fs.realpathSync(root);
    if (!sameClone) throw new Error(`Codex project scope runs exo from ${clone}, so the clone must live there (this one is ${root}); clone it to ${clone} or use --scope local`);
  }
  const written = [['.agents'], ['.agents', 'skills'], ['.codex'], ['.codex', 'agents'], ['.codex', 'hooks.json']];
  if (scope === 'local') {
    if (!statOf(path.join(project, '.git'))?.isDirectory()) throw new Error(`local scope needs ${path.join(project, '.git')} to be a folder to hold info/exclude`);
    written.push(['.git', 'info'], ['.git', 'info', 'exclude']);
  }
  for (const parts of written) {
    const where = path.join(project, ...parts);
    if (statOf(where)?.isSymbolicLink()) throw new Error(`${where} is a link; exo does not write through links in a project`);
  }
}

function linksTo(link, source) {
  const stat = statOf(link);
  if (!stat?.isSymbolicLink()) return false;
  const target = fs.readlinkSync(link).replace(/^\\\\\?\\/, '');
  return path.resolve(path.dirname(link), target) === path.resolve(source);
}

function removeLink(link) {
  try {
    fs.unlinkSync(link);
  } catch {
    fs.rmdirSync(link);
  }
}

const FINDER_FILE = '.DS_Store';

function holdsOnlyFinderFiles(folder) {
  if (!statOf(folder)?.isDirectory()) return false;
  const names = fs.readdirSync(folder);
  if (!names.includes(FINDER_FILE) && !names.some((name) => statOf(path.join(folder, name))?.isDirectory())) return false;
  return names.every((name) => {
    const full = path.join(folder, name);
    const stat = statOf(full);
    if (stat?.isDirectory()) return holdsOnlyFinderFiles(full);
    return name === FINDER_FILE && stat?.isFile() === true;
  });
}

function releaseLinks(entries, skillsDir, writes, notes) {
  for (const entry of entries) {
    const link = path.join(skillsDir, safeName(entry.name, SKILL_NAME, 'skill'));
    if (statOf(link) === undefined) continue;
    if (linksTo(link, entry.source)) writes.push(() => removeLink(link));
    else notes.push(`kept ${link}: it is not the link exo wrote`);
  }
}

function releaseFiles(skillDir, entries, writes, notes) {
  if (statOf(skillDir)?.isSymbolicLink()) {
    notes.push(`kept ${skillDir}: it is a link, not the folder exo wrote`);
    return;
  }
  const folders = new Set([skillDir]);
  for (const entry of entries) {
    const parts = safeParts(entry.path);
    const file = path.join(skillDir, ...parts);
    for (let index = 1; index < parts.length; index += 1) folders.add(path.join(skillDir, ...parts.slice(0, index)));
    const stat = statOf(file);
    if (stat === undefined) continue;
    if (plainChain(skillDir, parts) && stat.isFile() && hashOf(fs.readFileSync(file)) === entry.sha256) writes.push(() => fs.unlinkSync(file));
    else notes.push(`kept ${file}: it is not the file exo wrote`);
  }
  const deepestFirst = [...folders].sort((left, right) => right.length - left.length);
  writes.push(() => {
    for (const folder of deepestFirst) {
      try {
        fs.rmdirSync(folder);
      } catch {
      }
    }
  });
}

function releaseAgents(entries, agentsDir, writes, notes) {
  for (const entry of entries) {
    const file = path.join(agentsDir, safeName(entry.name, AGENT_FILE, 'agent file'));
    const stat = statOf(file);
    if (stat === undefined) continue;
    if (stat.isFile() && hashOf(fs.readFileSync(file)) === entry.sha256) writes.push(() => fs.unlinkSync(file));
    else notes.push(`kept ${file}: it is not the file exo wrote`);
  }
}

function mergeHooks(config, removed, additions) {
  if (!isPlain(config)) throw new Error('hooks.json is not an object; nothing was written');
  const events = config.hooks ?? {};
  if (!isPlain(events)) throw new Error('hooks.json "hooks" is not an object; nothing was written');
  const nextEvents = { ...events };
  const added = [];
  const touched = new Set([...removed.map((entry) => entry.event), ...Object.keys(additions)]);
  for (const event of touched) {
    const groups = events[event] ?? [];
    if (!Array.isArray(groups)) throw new Error(`hooks.json "${event}" is not a list; nothing was written`);
    const kept = groups.filter((group) => !removed.some((entry) => entry.event === event && isDeepStrictEqual(entry.group, group)));
    for (const group of additions[event] ?? []) {
      if (kept.some((existing) => isDeepStrictEqual(existing, group))) continue;
      kept.push(group);
      added.push({ event, group });
    }
    if (kept.length > 0) nextEvents[event] = kept;
    else delete nextEvents[event];
  }
  return { config: isDeepStrictEqual(nextEvents, events) ? config : { ...config, hooks: nextEvents }, added };
}

function projectHookEntries(exoRoot) {
  const entryScript = path.join(exoRoot, 'harnesses', 'codex', 'hook-entry.mjs');
  const quoted = shellQuote(entryScript);
  const entries = codexHookEntries(exoRoot);
  for (const groups of Object.values(entries)) {
    for (const group of groups) {
      group.hooks = group.hooks.map(({ commandWindows, ...handler }) => {
        if (!handler.command.includes(quoted)) throw new Error('a Codex hook command does not name the hook entry; nothing was written');
        return { ...handler, command: handler.command.replace(quoted, () => '"$HOME/.exo/harnesses/codex/hook-entry.mjs"') };
      });
    }
  }
  return entries;
}

function readExclude(file) {
  const stat = statOf(file);
  if (stat === undefined) return [];
  if (!stat.isFile()) throw new Error(`${file} is not a plain file; nothing was written`);
  return fs.readFileSync(file, 'utf8').split('\n');
}

function writeExclude(file, lines) {
  writeAtomic(file, `${lines.join('\n').replace(/\n+$/, '')}\n`);
}

function planHooks(hooksFile, removed, additions, writes, dropEmpty = false) {
  const current = readRecord(hooksFile, 'written');
  if (current === undefined && Object.keys(additions).length === 0) return [];
  const { config, added } = mergeHooks(current ?? {}, removed, additions);
  const empty = isDeepStrictEqual(config, {}) || isDeepStrictEqual(config, { hooks: {} });
  if (dropEmpty && empty && current !== undefined) writes.push(() => fs.unlinkSync(hooksFile));
  else if (!isDeepStrictEqual(config, current)) writes.push(() => writeAtomic(hooksFile, jsonText(config)));
  return added;
}

function generated(root, exoRoot, skillDirOf) {
  const skills = new Map();
  const agents = new Map();
  for (const [file, text] of generateTree(root)) {
    const rooted = text.replaceAll('{{EXO_ROOT}}', exoRoot);
    if (file.startsWith(AGENT_PREFIX)) {
      agents.set(safeName(file.slice(AGENT_PREFIX.length), AGENT_FILE, 'agent file'), rooted);
      continue;
    }
    if (!file.startsWith(SKILL_PREFIX)) continue;
    const [skill, ...rest] = file.slice(SKILL_PREFIX.length).split('/');
    safeName(skill, SKILL_NAME, 'skill');
    const parts = safeParts(rest.join('/'));
    if (!skills.has(skill)) skills.set(skill, new Map());
    skills.get(skill).set(parts.join('/'), rooted.replaceAll('{{SKILL_DIR}}', skillDirOf(skill)));
  }
  return { skills, agents };
}

function planSkill({ skillDir, files, oldSkill, oldLink, writes, conflicts }) {
  const fresh = statOf(skillDir) === undefined;
  const legacy = oldLink !== undefined && linksTo(skillDir, oldLink.source);
  const known = oldSkill !== undefined && statOf(skillDir)?.isDirectory() === true;
  const finderOnly = !fresh && !legacy && !known && holdsOnlyFinderFiles(skillDir);
  if (!fresh && !legacy && !known && !finderOnly) {
    conflicts.push(`${skillDir} exists and exo did not write it`);
    return undefined;
  }
  if (legacy) writes.push(() => removeLink(skillDir));
  const entry = { files: [] };
  const interim = { files: [] };
  for (const [relative, text] of files) {
    const parts = safeParts(relative);
    const file = path.join(skillDir, ...parts);
    const sha256 = hashOf(text);
    const recorded = oldSkill?.files.find((candidate) => candidate.path === relative);
    const stat = fresh || legacy ? undefined : statOf(file);
    const currentHash = stat?.isFile() ? hashOf(fs.readFileSync(file)) : undefined;
    const ours = recorded !== undefined && currentHash !== undefined && (currentHash === recorded.sha256 || currentHash === sha256);
    if (!plainChain(skillDir, parts) || (stat !== undefined && currentHash === undefined)) {
      conflicts.push(`${file} exists and exo did not write it`);
      continue;
    }
    if (stat === undefined || (ours && currentHash !== sha256)) {
      writes.push(() => writeAtomic(file, text));
    } else if (!ours && currentHash !== sha256) {
      conflicts.push(`${file} exists and exo did not write it`);
      continue;
    } else if (!ours) {
      continue;
    }
    entry.files.push({ path: relative, sha256 });
    interim.files.push(recorded ?? { path: relative, sha256 });
  }
  return { entry, interim };
}

function planInstall({ root, env, scope, project }, verb = 'installed') {
  if (!SCOPES.includes(scope)) throw new Error(`Codex scope must be one of ${SCOPES.join(', ')}, got ${JSON.stringify(scope)}`);
  if (scope === 'user' && project !== undefined) throw new Error('Codex user scope takes no project folder');
  if (scope !== 'user') checkProject({ root, env, scope, project });
  const where = locations(env, scope, project);
  const installs = readInstalls(where.recordFile);
  const target = { scope, project };
  const old = installs.find((entry) => sameInstall(entry, target)) ?? emptyInstall(scope, project);
  const exoRoot = scope === 'project' ? '$HOME/.exo' : root;
  const skillDirOf = (skill) => (scope === 'project' ? `.agents/skills/${skill}` : path.join(where.skillsDir, skill));
  const { skills, agents } = generated(root, exoRoot, skillDirOf);
  const next = emptyInstall(scope, project);
  const interim = emptyInstall(scope, project);
  const names = CREATED.filter((name) => name !== '.codex' || scope !== 'user');
  const created = [...new Set([...old.created, ...names.filter((name) => statOf(createdPath(name, where)) === undefined)])];
  next.created.push(...created);
  interim.created.push(...created);
  const conflicts = [];
  const notes = [];
  const writes = [];

  for (const [skill, files] of skills) {
    const oldSkill = old.skills.find((entry) => entry.name === skill);
    const planned = planSkill({
      skillDir: path.join(where.skillsDir, skill),
      files,
      oldSkill,
      oldLink: old.links.find((entry) => entry.name === skill),
      writes,
      conflicts
    });
    if (planned === undefined) continue;
    next.skills.push({ name: skill, ...planned.entry });
    const staleFiles = oldSkill?.files.filter((file) => !files.has(file.path)) ?? [];
    interim.skills.push({ name: skill, files: [...planned.interim.files, ...staleFiles] });
    releaseFiles(path.join(where.skillsDir, skill), staleFiles, writes, notes);
  }
  const staleSkills = old.skills.filter((entry) => !skills.has(entry.name));
  for (const entry of staleSkills) releaseFiles(path.join(where.skillsDir, safeName(entry.name, SKILL_NAME, 'skill')), entry.files, writes, notes);
  const staleLinks = old.links.filter((entry) => !skills.has(entry.name));
  releaseLinks(staleLinks, where.skillsDir, writes, notes);

  for (const [file, text] of agents) {
    const content = Buffer.from(text);
    const sha256 = hashOf(content);
    const target = path.join(where.agentsDir, file);
    const recorded = old.agents.find((entry) => entry.name === file);
    const stat = statOf(target);
    const currentHash = stat?.isFile() ? hashOf(fs.readFileSync(target)) : undefined;
    const ours = recorded !== undefined && currentHash !== undefined && (currentHash === recorded.sha256 || currentHash === sha256);
    if (stat === undefined || (ours && currentHash !== sha256)) {
      writes.push(() => writeAtomic(target, content));
    } else if (!ours && currentHash !== sha256) {
      conflicts.push(`${target} exists and exo did not write it`);
      continue;
    } else if (!ours) {
      continue;
    }
    next.agents.push({ name: file, sha256 });
    interim.agents.push(recorded ?? { name: file, sha256 });
  }
  const staleAgents = old.agents.filter((entry) => !agents.has(entry.name));
  releaseAgents(staleAgents, where.agentsDir, writes, notes);

  const hookEntries = scope === 'project' ? projectHookEntries(path.join(where.home, '.exo')) : codexHookEntries(root);
  const added = planHooks(where.hooksFile, old.hooks, hookEntries, writes);
  next.hooks.push(...added);

  const excludes = [...old.excludes];
  if (scope === 'local') {
    const present = readExclude(where.excludeFile);
    const wanted = [
      ...next.skills.map((skill) => `/.agents/skills/${skill.name}/`),
      ...next.agents.map((agent) => `/.codex/agents/${agent.name}`),
      ...(next.hooks.length > 0 || old.hooks.length > 0 ? ['/.codex/hooks.json'] : [])
    ];
    const fresh = wanted.filter((line) => !present.includes(line));
    for (const line of fresh) if (!excludes.includes(line)) excludes.push(line);
    if (fresh.length > 0) writes.push(() => writeExclude(where.excludeFile, [...readExclude(where.excludeFile), ...fresh]));
  }
  next.excludes.push(...excludes);

  if (conflicts.length > 0) throw new Error(`${conflicts.join('\n')}\nNothing was written. Move those aside, or remove them, then rerun.`);
  interim.skills.push(...staleSkills);
  interim.agents.push(...staleAgents);
  interim.hooks.push(...old.hooks, ...next.hooks);
  interim.links.push(...old.links);
  interim.excludes.push(...excludes);
  const fileCount = next.skills.reduce((total, skill) => total + skill.files.length, 0);
  return {
    writes: [
      () => writeAtomic(where.recordFile, jsonText({ version: 2, installs: withInstall(installs, interim) })),
      ...writes,
      () => writeAtomic(where.recordFile, jsonText({ version: 2, installs: withInstall(installs, next) }))
    ],
    notes,
    summary: `${verb} ${next.skills.length} skills (${fileCount} files), ${next.agents.length} agents and ${next.hooks.length} hook groups into ${scope === 'user' ? where.codexHome : project}`
  };
}

function planRemove(install, installs, env) {
  const where = locations(env, install.scope, install.project);
  const writes = [];
  const notes = [];
  if (install.scope !== 'user') {
    for (const parts of [['.agents'], ['.agents', 'skills'], ['.codex'], ['.codex', 'agents'], ['.codex', 'hooks.json'], ['.git', 'info'], ['.git', 'info', 'exclude']]) {
      const here = path.join(install.project, ...parts);
      if (statOf(here)?.isSymbolicLink()) throw new Error(`${here} is a link; exo does not remove through links in a project`);
    }
  }
  if (install.scope === 'local' && install.excludes.length > 0 && statOf(where.excludeFile) !== undefined) {
    const lines = readExclude(where.excludeFile);
    const kept = lines.filter((line) => !install.excludes.includes(line));
    if (kept.length !== lines.length) writes.push(() => writeExclude(where.excludeFile, kept));
  }
  releaseLinks(install.links, where.skillsDir, writes, notes);
  for (const skill of install.skills) releaseFiles(path.join(where.skillsDir, safeName(skill.name, SKILL_NAME, 'skill')), skill.files, writes, notes);
  releaseAgents(install.agents, where.agentsDir, writes, notes);
  planHooks(where.hooksFile, install.hooks, {}, writes, install.created.includes('.codex/hooks.json'));
  writes.push(() => {
    for (const name of ['.agents/skills', '.agents', '.codex/agents', '.codex']) {
      if (!install.created.includes(name)) continue;
      try {
        fs.rmdirSync(createdPath(name, where));
      } catch {
      }
    }
  });
  const rest = installs.filter((entry) => !sameInstall(entry, install));
  writes.push(() => {
    if (rest.length > 0) {
      writeAtomic(where.recordFile, jsonText({ version: 2, installs: rest }));
      return;
    }
    fs.unlinkSync(where.recordFile);
    try {
      fs.rmdirSync(path.dirname(where.recordFile));
    } catch {
    }
  });
  return { writes, notes, summary: `removed the ${install.scope} install that ${where.recordFile} listed` };
}

export function detect(env) {
  const cli = onPath('codex', env);
  const folder = fs.existsSync(locations(env).codexHome);
  if (cli) return { detected: true, installable: true };
  if (folder) return { detected: true, installable: false, reason: '`codex` is not on PATH although the Codex folder exists' };
  return { detected: false, installable: false, reason: '`codex` is not on PATH' };
}

export function install(plan) {
  return apply(planInstall(plan));
}

export function recorded(env) {
  return readInstalls(locations(env).recordFile).length;
}

export function update(record) {
  return updateInstalls(record, { locations, readInstalls, matches, planInstall }, 'Codex');
}

export function remove(record) {
  return removeInstalls(record, { locations, readInstalls, matches, planRemove });
}
