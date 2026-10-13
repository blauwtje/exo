import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { currentHost } from '#host';
import {
  LOCAL_FILE,
  PROJECT_FILE,
  SCHEMA,
  codexSettingsFile,
  globalSource,
  invalidReason,
  layers,
  projectRoot,
  readLayer,
  resolve,
  settingValue,
  typedValue,
  unknownKey
} from '#settings-store';
const USAGE = [
  'usage: node settings.mjs context                                one line for the session context',
  '       node settings.mjs show                                   every key: value, layer, options, overridden layers',
  '       node settings.mjs menu [<topic> | <key>]                 that overview, then the question that picks a topic, a key or a value',
  '       node settings.mjs get <key>                              the effective value',
  '       node settings.mjs set <key> <value> --scope project|local',
  '       node settings.mjs set <key> <value> --scope global       on Codex only',
].join('\n');
const OVERVIEW_WIDTH = 76;
const BLOCK_INDENT = '   ';
const QUIET_DEFAULT = new Set(['env']);

function activeRules(values) {
  const onCodex = currentHost() === 'codex';
  return Object.entries(SCHEMA)
    .map(([key, entry]) => {
      const rules = (onCodex && entry.codexRules) || entry.rules;
      return rules?.[values[key]] ?? '';
    })
    .filter(Boolean)
    .join(' ');
}

function contextLine(root) {
  try {
    const stack = layers(root);
    const notes = stack.map((layer) => layer.unreadable).filter(Boolean);
    const resolved = Object.fromEntries(Object.keys(SCHEMA).map((key) => [key, resolve(key, stack)]));
    for (const { notes: keyNotes } of Object.values(resolved)) notes.push(...keyNotes);
    const printed = Object.keys(SCHEMA).filter((key) => resolved[key].value !== '' && !(QUIET_DEFAULT.has(key) && resolved[key].layer === 'default'));
    const parts = printed.map((key) => `${key}=${resolved[key].value} (${resolved[key].layer})`);
    const rules = activeRules(Object.fromEntries(Object.keys(SCHEMA).map((key) => [key, resolved[key].value])));
    return `${[`exo settings: ${parts.join(', ')}`, ...notes].join('; ')}. ${rules}`;
  } catch (error) {
    const defaults = Object.fromEntries(Object.entries(SCHEMA).map(([key, entry]) => [key, entry.default]));
    const defaultParts = Object.entries(defaults)
      .filter(([key, value]) => value !== '' && !QUIET_DEFAULT.has(key))
      .map(([key, value]) => `${key}=${value} (default)`);
    return `exo settings: ${defaultParts.join(', ')}; ${error.message}. ${activeRules(defaults)}`;
  }
}

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

function settingBlock(key, stack) {
  const entry = SCHEMA[key];
  const { value, layer } = resolve(key, stack);
  const number = Object.keys(SCHEMA).indexOf(key) + 1;
  const origin = layer === 'global' ? `global, changed via ${globalSource()}` : layer;
  const head = wrapped(`${number}. ${entry.label}: ${plainValue(key, value)}  (${key} = ${value}, ${origin})`, BLOCK_INDENT);
  head[0] = head[0].slice(BLOCK_INDENT.length);
  const block = [...head, ...wrapped(entry.about, BLOCK_INDENT)];
  if (entry.options) {
    const marked = entry.options.map((option) => {
      const label = plainValue(key, option);
      return option === value ? `[${label}]` : label;
    });
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
  const legend = `[x] is the current value. This skill writes project and local; global is changed via ${globalSource()}.`;
  const notes = stack.map((layer) => layer.unreadable).filter(Boolean);
  return ['```text', ...blocks, ...wrapped(legend, ''), '```', ...notes];
}

function show(root) {
  console.log(overview(Object.keys(SCHEMA), layers(root)).join('\n'));
}

const MAX_PICKS = 2;
const TOPICS = {
  work: { label: 'How I work', question: 'Which part of how I work?', about: 'how I write and how much effort', keys: ['compression', 'budget'] },
  places: { label: 'Where work goes', question: 'Which part of where work goes?', about: 'where plans, code and finished work go', keys: ['specs', 'workspace', 'ship'] },
  safety: { label: 'Safety', question: 'Which part of safety?', about: 'what I block', keys: ['guards', 'env'] }
};

function question(title, context, keep, picks, reason) {
  const letters = [keep, ...picks].map((line, index) => `- **(${String.fromCharCode(65 + index)}) ${line}`);
  return [`**${title}**`, ...(context ? [context] : []), '', ...letters, '', `Recommended: (A), because ${reason}`];
}

function plainValue(key, value) {
  return SCHEMA[key].choices?.[String(value)]?.label ?? (value === '' ? 'none' : String(value));
}

function menu(root, name) {
  const stack = layers(root);
  if (name === undefined) {
    const topics = Object.entries(TOPICS);
    const picks = topics.slice(0, MAX_PICKS).map(([, topic]) => `${topic.label}**: ${topic.about}`);
    const rest = topics.slice(MAX_PICKS).map(([key, topic]) => `\`${key}\` for ${topic.label}`);
    const context = rest.length > 0 ? `Or type ${rest.join(' or ')}.` : '';
    console.log([...overview(Object.keys(SCHEMA), stack), '', ...question('What would you like to change?', context, 'Keep as is**: change nothing', picks, 'your settings stay as they are')].join('\n'));
    return;
  }
  if (Object.hasOwn(TOPICS, name)) {
    const topic = TOPICS[name];
    const line = (key) => `${SCHEMA[key].label}**: ${SCHEMA[key].about}`;
    const picks = topic.keys.slice(0, MAX_PICKS).map(line);
    const rest = topic.keys.slice(MAX_PICKS).map((key) => `\`${key}\` for ${SCHEMA[key].label}`);
    console.log([...overview(topic.keys, stack), '', ...question(topic.question, rest.length > 0 ? `Or type ${rest.join(' or ')}.` : '', 'Keep as is**: change nothing', picks, 'nothing changes unless you pick another')].join('\n'));
    return;
  }
  if (!Object.hasOwn(SCHEMA, name)) throw unknownKey(name);
  const entry = SCHEMA[name];
  const current = resolve(name, stack).value;
  const choices = entry.choices ?? {};
  const kept = choices[String(current)];
  const keep = kept ? `Keep ${kept.label}**: ${kept.gives}` : `Keep ${plainValue(name, current)}**: change nothing`;
  const others = Object.entries(choices).filter(([value]) => value !== String(current));
  const picks = others.slice(0, MAX_PICKS).map(([, choice]) => `${choice.label}**: ${choice.gives}`);
  const rest = others.slice(MAX_PICKS).map(([value, choice]) => `\`${value}\` for ${choice.label}`);
  const context = [entry.typed, rest.length > 0 ? `Or type ${rest.join(' or ')}.` : ''].filter(Boolean).join(' ');
  console.log([...overview([name], stack), '', ...question(entry.question, context, keep, picks, 'nothing changes unless you pick another')].join('\n'));
}

function gitignoreEntry(root, relative) {
  const file = path.join(root, '.gitignore');
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const separator = current === '' || current.endsWith('\n') ? '' : '\n';
  return `${separator}${relative.split(path.sep).join('/')}\n`;
}

function set(root, key, value, scope) {
  if (!Object.hasOwn(SCHEMA, key ?? '')) throw unknownKey(key);
  const onCodex = currentHost() === 'codex';
  if (scope === 'global' && !onCodex) {
    throw new Error('a global value is set in /config under the exo plugin, not by this script');
  }
  if (scope !== 'project' && scope !== 'local' && !(scope === 'global' && onCodex)) {
    throw new Error(`--scope must be project, local${onCodex ? ' or global' : ''}`);
  }
  const typed = typedValue(key, value);
  const problem = invalidReason(key, typed);
  if (problem) throw new Error(problem);

  const relative = { local: LOCAL_FILE, project: PROJECT_FILE, global: codexSettingsFile() }[scope];
  const file = scope === 'global' ? relative : path.join(root, relative);
  const values = readLayer(file);
  values[key] = typed;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(values, null, 2)}\n`);
  fs.renameSync(temporary, file);
  console.log(`${key}=${typed} set in ${relative}`);

  if (scope === 'global') return;

  // why: check-ignore exits 0 for an ignored path, 1 for a tracked one and 128 outside git.
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
  if (command === '--help') {
    console.log(USAGE);
  } else if (command === 'context') {
    console.log(contextLine(root));
  } else if (command === 'show') {
    show(root);
  } else if (command === 'menu') {
    menu(root, args[0]);
  } else if (command === 'get') {
    console.log(settingValue(args[0]));
  } else if (command === 'set') {
    set(root, args[0], args[1], option(args, '--scope'));
  } else {
    throw new Error('usage: settings.mjs context | show | menu [<topic> | <key>] | get <key> | set <key> <value> --scope project|local');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
