// exo settings in four layers, highest first: `.claude/exo.local.json` (this
// machine), `.claude/exo.json` (the project, shared through git), the plugin's
// global options, then the schema default. schema.json names every key, so a
// new setting is one entry there plus the matching userConfig entry in
// plugin.json, which tests/settings.test.mjs holds to the schema.
//
//   node settings.mjs context                                one line for the session context
//   node settings.mjs show                                   every key: value, layer, options, overridden layers
//   node settings.mjs menu [<key>]                           that overview, then the question that picks a key or a value
//   node settings.mjs get <key>                              the effective value
//   node settings.mjs set <key> <value> --scope project|local

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { configDirectory } from '#config-directory';

const SCHEMA = JSON.parse(fs.readFileSync(new URL('../schema.json', import.meta.url), 'utf8'));
const PROJECT_FILE = path.join('.claude', 'exo.json');
const LOCAL_FILE = path.join('.claude', 'exo.local.json');
const PLUGIN_PREFIX = 'exo@';
const GLOBAL_SOURCE = '/config';
const OVERVIEW_WIDTH = 76;
const BLOCK_INDENT = '   ';

function projectRoot() {
  if (process.env.CLAUDE_PROJECT_DIR) return process.env.CLAUDE_PROJECT_DIR;
  const toplevel = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (toplevel.status === 0) return toplevel.stdout.trim();
  return process.cwd();
}

function unknownKey(key) {
  return new Error(`unknown setting ${key}; known: ${Object.keys(SCHEMA).join(', ')}`);
}

// A missing file is an empty layer; a file that does not parse throws, because
// a broken shared file read as empty hides every value in it.
function readLayer(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
  let values;
  try {
    values = JSON.parse(text);
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${error.message}`);
  }
  if (values === null || typeof values !== 'object' || Array.isArray(values)) {
    throw new Error(`${file} is not a JSON object`);
  }
  return values;
}

// The user settings file can exist yet be closed to this process, as under an OS
// sandbox that denies reads of the config directory. The other layers still apply,
// and the note names the file so its values are not mistaken for defaults.
function readUserSettings() {
  const file = path.join(configDirectory(), 'settings.json');
  try {
    return { userSettings: readLayer(file), unreadable: null };
  } catch (error) {
    if (error.code !== 'EACCES' && error.code !== 'EPERM') throw error;
    return { userSettings: {}, unreadable: `${file} could not be read (${error.code}); a global value it holds shows as default` };
  }
}

// A hook process receives CLAUDE_PLUGIN_OPTION_<KEY>; any other caller reads the
// same value from the user settings file the harness stores plugin options in.
function globalLayer() {
  const { userSettings, unreadable } = readUserSettings();
  const pluginConfigs = userSettings.pluginConfigs ?? {};
  const pluginId = Object.keys(pluginConfigs).find((id) => id.startsWith(PLUGIN_PREFIX));
  const stored = pluginId === undefined ? {} : (pluginConfigs[pluginId].options ?? {});
  const values = {};
  for (const key of Object.keys(SCHEMA)) {
    const fromHook = process.env[`CLAUDE_PLUGIN_OPTION_${key.toUpperCase()}`];
    if (fromHook !== undefined && fromHook !== '') {
      values[key] = fromHook;
    } else if (stored[key] !== undefined) {
      values[key] = stored[key];
    }
  }
  return { values, unreadable };
}

function invalidReason(key, value) {
  const entry = SCHEMA[key];
  if (typeof value !== entry.type) return `${key}=${value} is not a ${entry.type}`;
  if (entry.options && !entry.options.includes(value)) {
    return `${key}=${value} is not one of ${entry.options.join(', ')}`;
  }
  return null;
}

function layers(root) {
  return [
    { name: 'local', source: LOCAL_FILE, values: readLayer(path.join(root, LOCAL_FILE)) },
    { name: 'project', source: PROJECT_FILE, values: readLayer(path.join(root, PROJECT_FILE)) },
    { name: 'global', source: GLOBAL_SOURCE, ...globalLayer() }
  ];
}

function resolve(key, stack) {
  for (const layer of stack) {
    const value = layer.values[key];
    if (value === undefined) continue;
    const problem = invalidReason(key, value);
    if (problem) throw new Error(`${layer.source}: ${problem}`);
    return { value, layer: layer.name };
  }
  return { value: SCHEMA[key].default, layer: 'default' };
}

// The session hook prints this line into every session, so a broken layer
// degrades to the defaults and names the file instead of failing the hook.
function contextLine(root) {
  try {
    const stack = layers(root);
    const parts = Object.keys(SCHEMA).map((key) => {
      const { value, layer } = resolve(key, stack);
      return `${key}=${value} (${layer})`;
    });
    const notes = stack.map((layer) => layer.unreadable).filter(Boolean);
    return [`exo settings: ${parts.join(', ')}`, ...notes].join('; ');
  } catch (error) {
    const defaults = Object.entries(SCHEMA).map(([key, entry]) => `${key}=${entry.default} (default)`);
    return `exo settings: ${defaults.join(', ')}; ${error.message}`;
  }
}

// A description is wrapped by hand because a terminal breaks a long fenced line
// at the window edge, which drops the indent that ties it to its setting.
function wrapped(text, indent) {
  const lines = [];
  let line = indent;
  for (const word of text.split(' ')) {
    if (line.length + word.length > OVERVIEW_WIDTH && line !== indent) {
      lines.push(line.trimEnd());
      line = indent;
    }
    line += `${word} `;
  }
  lines.push(line.trimEnd());
  return lines;
}

// The first layer that holds the key wins, so every other layer holding it is overridden.
function settingBlock(key, stack) {
  const entry = SCHEMA[key];
  const { value, layer } = resolve(key, stack);
  const number = Object.keys(SCHEMA).indexOf(key) + 1;
  const origin = layer === 'global' ? `global, changed via ${GLOBAL_SOURCE}` : layer;
  const block = [`${number}. ${key} = ${value}  (${origin})`, ...wrapped(entry.description, BLOCK_INDENT)];
  if (entry.options) {
    const marked = entry.options.map((option) => (option === value ? `[${option}]` : option));
    block.push(`${BLOCK_INDENT}options: ${marked.join('  ')}`);
  }
  const overridden = stack
    .filter((lower) => lower.name !== layer && lower.values[key] !== undefined)
    .map((lower) => `${lower.name}=${lower.values[key]}`);
  if (overridden.length > 0) block.push(`${BLOCK_INDENT}overrides: ${overridden.join(', ')}`);
  return block;
}

function overview(keys, stack) {
  const blocks = keys.flatMap((key) => [...settingBlock(key, stack), '']);
  const legend = `[x] is the current value. This skill writes project and local; global is changed via ${GLOBAL_SOURCE}.`;
  const notes = stack.map((layer) => layer.unreadable).filter(Boolean);
  return ['```text', ...blocks, ...wrapped(legend, ''), '```', ...notes];
}

function show(root) {
  console.log(overview(Object.keys(SCHEMA), layers(root)).join('\n'));
}

// The overview plus the one question that moves a change forward: which setting
// without a key, which value with one. The option lines sit outside the fence
// because bold renders only there.
function menu(root, key) {
  const stack = layers(root);
  if (key === undefined) {
    const picks = Object.keys(SCHEMA).map((name, index) => {
      return `${index + 1}. **${name}**: change it, now ${resolve(name, stack).value}`;
    });
    const keep = `${picks.length + 1}. **Keep**: change nothing`;
    console.log([...overview(Object.keys(SCHEMA), stack), '', 'Change which setting?', '', ...picks, keep].join('\n'));
    return;
  }
  if (!Object.hasOwn(SCHEMA, key)) throw unknownKey(key);
  const current = resolve(key, stack).value;
  const others = (SCHEMA[key].options ?? []).filter((option) => option !== current);
  const picks = others.map((option, index) => `${index + 1}. **${option}**: set ${key} to ${option}`);
  const keep = `${picks.length + 1}. **Keep ${current}**: change nothing`;
  console.log([...overview([key], stack), '', `Set ${key} to which value?`, '', ...picks, keep].join('\n'));
}

// Appending to a file that lacks a final newline would glue the entry onto its last line.
function gitignoreEntry(root, relative) {
  const file = path.join(root, '.gitignore');
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const separator = current === '' || current.endsWith('\n') ? '' : '\n';
  return `${separator}${relative.split(path.sep).join('/')}\n`;
}

function set(root, key, value, scope) {
  if (!Object.hasOwn(SCHEMA, key ?? '')) throw unknownKey(key);
  if (scope === 'global') {
    throw new Error('a global value is set in /config under the exo plugin, not by this script');
  }
  if (scope !== 'project' && scope !== 'local') throw new Error('--scope must be project or local');
  const problem = invalidReason(key, value);
  if (problem) throw new Error(problem);

  const relative = scope === 'local' ? LOCAL_FILE : PROJECT_FILE;
  const file = path.join(root, relative);
  const values = readLayer(file);
  values[key] = value;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(values, null, 2)}\n`);
  fs.renameSync(temporary, file);
  console.log(`${key}=${value} set in ${relative}`);

  // check-ignore exits 0 for an ignored path, 1 for a tracked one, 128 outside git.
  const ignored = spawnSync('git', ['-C', root, 'check-ignore', '-q', relative]);
  if (scope === 'local' && ignored.status === 1) {
    fs.appendFileSync(path.join(root, '.gitignore'), gitignoreEntry(root, relative));
    console.log(`${relative} added to .gitignore`);
  }
  if (scope === 'project' && ignored.status === 0) {
    console.log(`${relative} is git-ignored, so collaborators do not receive it`);
  }
}

function option(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

const [command, ...args] = process.argv.slice(2);
const root = projectRoot();
try {
  if (command === 'context') {
    console.log(contextLine(root));
  } else if (command === 'show') {
    show(root);
  } else if (command === 'menu') {
    menu(root, args[0]);
  } else if (command === 'get') {
    const key = args[0];
    if (!Object.hasOwn(SCHEMA, key ?? '')) throw unknownKey(key);
    console.log(resolve(key, layers(root)).value);
  } else if (command === 'set') {
    set(root, args[0], args[1], option(args, '--scope'));
  } else {
    throw new Error('usage: settings.mjs context | show | menu [<key>] | get <key> | set <key> <value> --scope project|local');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
