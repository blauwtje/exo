// Installs exo into Codex's user folders from this clone; the CLI and the IDE
// extension both read them.
//
//   node harnesses/codex/install.mjs [--codex-home <dir>] [--skills-dir <dir>]
//   node harnesses/codex/install.mjs --remove [--codex-home <dir>] [--skills-dir <dir>]
//
// It links each skill folder (except route-skills, whose body the session hook
// injects) into the skills folder (default ~/.agents/skills), copies
// `harnesses/codex/generated/agents/*.toml` into `<codex home>/agents/` (default ~/.codex, or
// $CODEX_HOME), and merges the entries of `harnesses/codex/hooks.mjs` into
// `<codex home>/hooks.json`. What it wrote goes to `<codex home>/exo/installed.json`;
// `--remove` deletes exactly those entries.
//
// Every check runs before the first write, and any failure aborts. A link, file
// or hook group that this installer did not write is never replaced or
// removed: a conflicting one aborts the install, an identical one stays
// unrecorded. Names are checked against a fixed pattern before they join a
// path, because `installed.json` is read back as untrusted data.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { codexHookEntries } from './hooks.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const NOT_LINKED = ['route-skills'];
const SKILL_NAME = /^[a-z0-9][a-z0-9-]*$/;
const AGENT_FILE = /^[a-z0-9][a-z0-9-]*\.toml$/;

const isPlain = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const hashOf = (content) => crypto.createHash('sha256').update(content).digest('hex');
const statOf = (file) => fs.lstatSync(file, { throwIfNoEntry: false });

function safeName(name, pattern, what) {
  if (typeof name !== 'string' || !pattern.test(name)) throw new Error(`${what} name ${JSON.stringify(name)} is not a plain name`);
  return name;
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

function readRecord(file) {
  const record = readJson(file);
  if (record === undefined) return undefined;
  const valid = isPlain(record)
    && Array.isArray(record.skills) && record.skills.every((entry) => isPlain(entry) && SKILL_NAME.test(entry.name) && typeof entry.source === 'string')
    && Array.isArray(record.agents) && record.agents.every((entry) => isPlain(entry) && AGENT_FILE.test(entry.name) && typeof entry.sha256 === 'string')
    && Array.isArray(record.hooks) && record.hooks.every((entry) => isPlain(entry) && typeof entry.event === 'string' && isPlain(entry.group));
  if (!valid) throw new Error(`${file} is not an exo install record; fix or move it, nothing was written`);
  return record;
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

// Each releasing helper returns the writes that delete what the record says
// this installer wrote, and a note for each entry it leaves because it changed.
function releaseSkills(entries, skillsDir, writes, notes) {
  for (const entry of entries) {
    const link = path.join(skillsDir, safeName(entry.name, SKILL_NAME, 'skill'));
    if (statOf(link) === undefined) continue;
    if (linksTo(link, entry.source)) writes.push(() => removeLink(link));
    else notes.push(`kept ${link}: it is not the link exo wrote`);
  }
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

function planHooks(hooksFile, removed, additions, writes) {
  const current = readJson(hooksFile);
  if (current === undefined && Object.keys(additions).length === 0) return [];
  const { config, added } = mergeHooks(current ?? {}, removed, additions);
  if (!isDeepStrictEqual(config, current)) writes.push(() => writeAtomic(hooksFile, `${JSON.stringify(config, null, 2)}\n`));
  return added;
}

function planInstall({ root, codexHome, skillsDir }) {
  const recordFile = path.join(codexHome, 'exo', 'installed.json');
  const agentsDir = path.join(codexHome, 'agents');
  const old = readRecord(recordFile) ?? { skills: [], agents: [], hooks: [] };
  const record = { version: 1, skills: [], agents: [], hooks: [] };
  const conflicts = [];
  const notes = [];
  const writes = [];

  const skillsRoot = path.join(root, 'skills');
  const wanted = fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !NOT_LINKED.includes(entry.name) && fs.existsSync(path.join(skillsRoot, entry.name, 'SKILL.md')))
    .map((entry) => safeName(entry.name, SKILL_NAME, 'skill'));
  for (const name of wanted) {
    const link = path.join(skillsDir, name);
    const source = path.join(skillsRoot, name);
    const recorded = old.skills.find((entry) => entry.name === name);
    const ours = recorded !== undefined && linksTo(link, recorded.source);
    if (statOf(link) === undefined || (ours && !linksTo(link, source))) {
      const replace = statOf(link) !== undefined;
      writes.push(() => {
        if (replace) removeLink(link);
        fs.mkdirSync(skillsDir, { recursive: true });
        fs.symlinkSync(source, link, process.platform === 'win32' ? 'junction' : 'dir');
      });
      record.skills.push({ name, source });
    } else if (ours) {
      record.skills.push({ name, source });
    } else if (!linksTo(link, source)) {
      conflicts.push(`${link} exists and exo did not write it`);
    }
  }
  const staleSkills = old.skills.filter((entry) => !wanted.includes(entry.name));
  releaseSkills(staleSkills, skillsDir, writes, notes);

  const agentsSource = path.join(root, 'harnesses', 'codex', 'generated', 'agents');
  const agentFiles = fs.readdirSync(agentsSource).filter((name) => name.endsWith('.toml'));
  const interimAgents = [];
  for (const name of agentFiles) {
    safeName(name, AGENT_FILE, 'agent file');
    const content = fs.readFileSync(path.join(agentsSource, name));
    const sha256 = hashOf(content);
    const file = path.join(agentsDir, name);
    const recorded = old.agents.find((entry) => entry.name === name);
    const stat = statOf(file);
    const currentHash = stat?.isFile() ? hashOf(fs.readFileSync(file)) : undefined;
    const ours = recorded !== undefined && currentHash !== undefined && (currentHash === recorded.sha256 || currentHash === sha256);
    if (stat === undefined || (ours && currentHash !== sha256)) {
      writes.push(() => {
        fs.mkdirSync(agentsDir, { recursive: true });
        writeAtomic(file, content);
      });
    } else if (!ours && currentHash !== sha256) {
      conflicts.push(`${file} exists and exo did not write it`);
      continue;
    } else if (!ours) {
      continue;
    }
    record.agents.push({ name, sha256 });
    interimAgents.push(recorded ?? { name, sha256 });
  }
  const staleAgents = old.agents.filter((entry) => !agentFiles.includes(entry.name));
  releaseAgents(staleAgents, agentsDir, writes, notes);

  const additions = codexHookEntries(root);
  const added = planHooks(path.join(codexHome, 'hooks.json'), old.hooks, additions, writes);
  record.hooks.push(...added);

  if (conflicts.length > 0) throw new Error(`${conflicts.join('\n')}\nNothing was written. Move those aside, or remove them, then rerun.`);
  // The interim record lists everything either state may hold, so a rerun after a
  // failed write still finds each file it wrote.
  const interim = {
    version: 1,
    skills: [...record.skills, ...staleSkills],
    agents: [...interimAgents, ...staleAgents],
    hooks: [...old.hooks, ...record.hooks]
  };
  const recordText = (value) => `${JSON.stringify(value, null, 2)}\n`;
  return {
    writes: [() => writeAtomic(recordFile, recordText(interim)), ...writes, () => writeAtomic(recordFile, recordText(record))],
    notes,
    summary: `installed ${record.skills.length} skill links, ${record.agents.length} agents and ${record.hooks.length} hook groups into ${codexHome}`
  };
}

function planRemove({ codexHome, skillsDir }) {
  const recordFile = path.join(codexHome, 'exo', 'installed.json');
  const record = readRecord(recordFile);
  if (record === undefined) return { writes: [], notes: [], summary: `nothing to remove: ${recordFile} does not exist` };
  const writes = [];
  const notes = [];
  releaseSkills(record.skills, skillsDir, writes, notes);
  releaseAgents(record.agents, path.join(codexHome, 'agents'), writes, notes);
  planHooks(path.join(codexHome, 'hooks.json'), record.hooks, {}, writes);
  writes.push(() => {
    fs.unlinkSync(recordFile);
    try {
      fs.rmdirSync(path.dirname(recordFile));
    } catch {
      // The folder holds other exo files; leave it.
    }
  });
  return { writes, notes, summary: `removed what ${recordFile} listed` };
}

function main(argv, env = process.env) {
  const { values } = parseArgs({
    args: argv,
    options: { 'codex-home': { type: 'string' }, 'skills-dir': { type: 'string' }, remove: { type: 'boolean' } }
  });
  const codexHome = path.resolve(values['codex-home'] || env.CODEX_HOME || path.join(os.homedir(), '.codex'));
  const skillsDir = path.resolve(values['skills-dir'] || path.join(os.homedir(), '.agents', 'skills'));
  const plan = values.remove ? planRemove({ codexHome, skillsDir }) : planInstall({ root: ROOT, codexHome, skillsDir });
  for (const write of plan.writes) write();
  for (const note of plan.notes) process.stdout.write(`${note}\n`);
  process.stdout.write(`${plan.summary}\n`);
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
