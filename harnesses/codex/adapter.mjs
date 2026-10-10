// The Codex harness for install.mjs: installs exo into Codex's folders from this
// clone; the CLI and the IDE extension both read them.
//
// It copies each generated skill (harnesses/codex/generate.mjs, built in memory
// from the sources, so an install never uses a stale tree) into a skills folder,
// copies the generated agents into an agents folder, and merges the entries of
// `harnesses/codex/hooks.mjs` into a hooks.json. Scope `user` writes
// ~/.agents/skills, `<codex home>/agents` and `<codex home>/hooks.json` (codex home
// is $CODEX_HOME or ~/.codex); `project` and `local` write
// `<project>/.agents/skills`, `<project>/.codex/agents` and `<project>/.codex/hooks.json`.
// `local` adds each file it wrote to `<project>/.git/info/exclude` and removes
// those lines again. Both placeholders are filled at install: `{{EXO_ROOT}}` with
// the clone's path (for `project`, shared through git, `$HOME/.exo`, so the clone
// must live at ~/.exo), `{{SKILL_DIR}}` with the installed skill folder (for
// `project`, relative to the project, so it holds for every teammate). What it
// wrote, with a sha256 per file, goes to `<codex home>/exo/installed.json`, one
// entry per install (scope and project folder); update and remove act only on
// what that record lists.
//
// Every check runs before the first write, and any failure aborts. A file, link,
// folder or hook group that this adapter did not write is never replaced or
// removed: a conflicting one aborts the install, an identical one stays
// unrecorded, an edited one stays on removal. Names are checked against a fixed
// pattern before they join a path, because `installed.json` is read back as
// untrusted data. The record `codex/install.mjs` wrote (skill links, no hashes)
// reads as one user install and is rewritten in the new shape on the next write.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { isDeepStrictEqual } from 'node:util';
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

const isPlain = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const hashOf = (content) => crypto.createHash('sha256').update(content).digest('hex');
const statOf = (file) => fs.lstatSync(file, { throwIfNoEntry: false });
const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;

function safeName(value, pattern, what) {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error(`${what} name ${JSON.stringify(value)} is not a plain name`);
  return value;
}

// A recorded or generated file path inside a skill folder, as its parts.
function safeParts(relative) {
  if (typeof relative !== 'string') throw new Error(`file path ${JSON.stringify(relative)} is not a plain path`);
  const parts = relative.split('/');
  for (const part of parts) safeName(part, PATH_PART, 'path');
  return parts;
}

function readJson(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${file} does not parse (${error.message}); fix or move it, nothing was written`);
  }
}

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.exo-${process.pid}.tmp`;
  fs.writeFileSync(temporary, text);
  fs.renameSync(temporary, file);
}

const emptyInstall = (scope, project) => ({ scope, ...(project === undefined ? {} : { project }), skills: [], links: [], agents: [], hooks: [], excludes: [] });

function validInstall(entry) {
  return isPlain(entry)
    && SCOPES.includes(entry.scope)
    && (entry.scope === 'user' ? entry.project === undefined : typeof entry.project === 'string' && path.isAbsolute(entry.project))
    && Array.isArray(entry.excludes) && entry.excludes.every((line) => typeof line === 'string' && EXCLUDE_LINE.test(line))
    && Array.isArray(entry.skills) && entry.skills.every((skill) => isPlain(skill) && SKILL_NAME.test(skill.name)
      && Array.isArray(skill.files) && skill.files.every((file) => isPlain(file) && typeof file.path === 'string' && typeof file.sha256 === 'string'))
    && Array.isArray(entry.links) && entry.links.every((link) => isPlain(link) && SKILL_NAME.test(link.name) && typeof link.source === 'string')
    && Array.isArray(entry.agents) && entry.agents.every((agent) => isPlain(agent) && AGENT_FILE.test(agent.name) && typeof agent.sha256 === 'string')
    && Array.isArray(entry.hooks) && entry.hooks.every((hook) => isPlain(hook) && typeof hook.event === 'string' && isPlain(hook.group));
}

// Returns the installs the record file lists; the old single-target shape is one user install.
function readInstalls(file) {
  const record = readJson(file);
  if (record === undefined) return [];
  const notRecord = new Error(`${file} is not an exo install record; fix or move it, nothing was written`);
  if (!isPlain(record)) throw notRecord;
  if (Array.isArray(record.installs)) {
    const installs = record.installs.map((entry) => (isPlain(entry) ? { excludes: [], ...entry } : entry));
    if (!installs.every(validInstall)) throw notRecord;
    return installs;
  }
  const old = { scope: 'user', skills: [], links: record.skills, agents: record.agents, hooks: record.hooks, excludes: [] };
  if (!validInstall(old)) throw notRecord;
  return [old];
}

const sameInstall = (left, right) => left.scope === right.scope && left.project === right.project;
const matches = (install, selector) => (selector.scope === undefined || install.scope === selector.scope)
  && (selector.project === undefined || install.project === selector.project);
const withInstall = (installs, install) => [...installs.filter((entry) => !sameInstall(entry, install)), install];

// The folders of one install; the record file is the same for every scope.
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

// Checks before the first write of a per-project install: the folder exists, a
// `project` install runs from a clone at ~/.exo (its text says `$HOME/.exo`), and
// no folder or file the install writes through is a link, so a repository cannot
// lead a write outside itself. Ceiling: `local` needs `.git` to be a folder, not
// the file a worktree or submodule has; lift it by resolving `gitdir:` from that file.
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

// True when `link` is a symlink or junction whose target is `source`.
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
    // Ceiling: Windows may refuse unlink on a junction; lift it once a Windows run shows otherwise.
    fs.rmdirSync(link);
  }
}

// True when each folder from `base` down to the file's parent is a real folder or missing,
// so no link on the way can lead a write or delete outside the skill folder.
function plainChain(base, parts) {
  let current = base;
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    const stat = statOf(current);
    if (stat === undefined) return true;
    if (!stat.isDirectory()) return false;
  }
  return true;
}

// macOS Finder drops a `.DS_Store` into any folder it opens. It is not exo's and not
// a user's work, so a skill folder is never refused for it, and it is never recorded,
// overwritten or deleted. Only the exact name counts; other dotfiles stay foreign.
const FINDER_FILE = '.DS_Store';

// True when `folder` is a real folder that holds a Finder file and nothing else,
// counting a subfolder only when it too holds nothing but Finder files.
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

// Each releasing helper adds the writes that delete what the record says this
// adapter wrote, and a note for each entry it leaves because it changed.
function releaseLinks(entries, skillsDir, writes, notes) {
  for (const entry of entries) {
    const link = path.join(skillsDir, safeName(entry.name, SKILL_NAME, 'skill'));
    if (statOf(link) === undefined) continue;
    if (linksTo(link, entry.source)) writes.push(() => removeLink(link));
    else notes.push(`kept ${link}: it is not the link exo wrote`);
  }
}

function releaseFiles(skillDir, entries, writes, notes) {
  // A skill folder swapped for a link would lead the deletes below outside it.
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
  // Only a folder the writes emptied goes; rmdir refuses one that still holds anything.
  const deepestFirst = [...folders].sort((left, right) => right.length - left.length);
  writes.push(() => {
    for (const folder of deepestFirst) {
      try {
        fs.rmdirSync(folder);
      } catch {
        // Not empty, or gone: leave it.
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

// Returns the hooks.json object with the recorded groups removed and the new
// ones appended, and the groups it appended. Only the events involved are inspected.
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

// Entries for a `project` install, which a repository shares: the clone's absolute
// path becomes `$HOME/.exo`. Ceiling: no `commandWindows`, so a Windows host runs
// the POSIX `command`; lift it once Codex documents its Windows shell.
function projectHookEntries(exoRoot) {
  const entryScript = path.join(exoRoot, 'harnesses', 'codex', 'hook-entry.mjs');
  const quoted = `'${entryScript.replaceAll("'", "'\\''")}'`;
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

// The lines `.git/info/exclude` has, or none when the file is missing.
function readExclude(file) {
  const stat = statOf(file);
  if (stat === undefined) return [];
  if (!stat.isFile()) throw new Error(`${file} is not a plain file; nothing was written`);
  return fs.readFileSync(file, 'utf8').split('\n');
}

function writeExclude(file, lines) {
  writeAtomic(file, `${lines.join('\n').replace(/\n+$/, '')}\n`);
}

function planHooks(hooksFile, removed, additions, writes) {
  const current = readJson(hooksFile);
  if (current === undefined && Object.keys(additions).length === 0) return [];
  const { config, added } = mergeHooks(current ?? {}, removed, additions);
  if (!isDeepStrictEqual(config, current)) writes.push(() => writeAtomic(hooksFile, jsonText(config)));
  return added;
}

// The generated tree as skill name to (relative path to text) and agent file to text,
// each with {{EXO_ROOT}} filled, and {{SKILL_DIR}} filled in a skill.
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

// Plans one skill: the writes that bring its folder to the generated files, the
// record entry, the interim entry (old hashes kept where a write may not land) and any conflicts.
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

  // `local`: every file this install wrote is listed in .git/info/exclude, and the
  // record keeps the lines it added, so a removal takes back only those.
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
  // The interim record lists everything either state may hold, so a rerun after a
  // failed write still finds each file it wrote.
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
    // A recorded project is untrusted: a link on the way would lead a delete outside it.
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
  planHooks(where.hooksFile, install.hooks, {}, writes);
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
      // The folder holds other exo files; leave it.
    }
  });
  return { writes, notes, summary: `removed the ${install.scope} install that ${where.recordFile} listed` };
}

function apply(plan) {
  for (const write of plan.writes) write();
  return { summary: plan.summary, notes: plan.notes };
}

const combine = (results) => ({ summary: results.map((result) => result.summary).join('; '), notes: results.flatMap((result) => result.notes) });

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

// How many installs the record lists; install.sh deletes the clone only when every adapter says 0.
export function recorded(env) {
  return readInstalls(locations(env).recordFile).length;
}

// An update re-applies each install the selector matches, from the clone as it is now.
export function update(record) {
  const installs = readInstalls(locations(record.env).recordFile).filter((entry) => matches(entry, record));
  if (installs.length === 0) return 'nothing to update: no Codex install recorded';
  return combine(installs.map((entry) => {
    // A project folder deleted since the install has nothing to update; --remove drops its record.
    if (entry.scope !== 'user' && !statOf(entry.project)?.isDirectory()) return { summary: `skipped ${entry.scope} install in ${entry.project}`, notes: [`${entry.project} is not a folder; run --remove to drop its record`] };
    return apply(planInstall({ root: record.root, env: record.env, scope: entry.scope, project: entry.project }, 'updated'));
  }));
}

export function remove(record) {
  const { recordFile } = locations(record.env);
  const installs = readInstalls(recordFile);
  const wanted = installs.filter((entry) => matches(entry, record));
  if (wanted.length === 0) return `nothing to remove: ${recordFile} lists no matching install`;
  let remaining = installs;
  const plans = wanted.map((entry) => {
    const plan = planRemove(entry, remaining, record.env);
    remaining = remaining.filter((candidate) => !sameInstall(candidate, entry));
    return plan;
  });
  return combine(plans.map(apply));
}
