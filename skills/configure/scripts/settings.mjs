// exo settings in four layers, highest first: `.claude/exo.local.json` (this
// machine), `.claude/exo.json` (the project, shared through git), the plugin's
// global options, then the schema default. schema.json names every key, so a
// new setting is one entry there plus the matching userConfig entry in
// plugin.json, which tests/settings.test.mjs holds to the schema.
//
//   node settings.mjs context                                one line for the session context
//   node settings.mjs show                                   every key: value, layer, options, overridden layers
//   node settings.mjs menu [<topic> | <key>]                 that overview, then the question that picks a topic, a key or a value
//   node settings.mjs get <key>                              the effective value
//   node settings.mjs set <key> <value> --scope project|local
//   node settings.mjs set <key> <value> --scope global       on Codex only

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { currentHost } from '#host';
import { readKindTable } from '#model-kinds';
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
const OVERVIEW_WIDTH = 76;
const BLOCK_INDENT = '   ';

// A rule's `{model:<kind>}` and `{effort:<kind>}` are the provider's model and
// effort for that kind, and `{model:<kind>@<budget>}` is that model after the
// budget's tier swap, so a rule names the Agent call's parameters without
// naming a model itself. Its `{from}` and `{to}` are the provider's models for
// the two tiers of each pair in the kind table's `budgets` map under the
// setting's value. A rule with no placeholder is used as written.
function filledRule(rule, value) {
  if (!rule.includes('{')) return rule;
  const table = readKindTable();
  const { tiers } = table.providers[table.provider];
  const kind = (name) => {
    if (!table.kinds[name]) throw new Error(`budget rule names unknown kind ${name}`);
    return table.kinds[name];
  };
  const swapped = (model, budget) => {
    const pair = Object.entries(table.budgets[budget] ?? {}).find(([fromTier]) => tiers[fromTier] === model);
    return pair ? tiers[pair[1]] : model;
  };
  const called = rule
    .replace(/\{model:([a-z-]+)(?:@([a-z]+))?\}/g, (_, name, budget) => (budget ? swapped(kind(name).model, budget) : kind(name).model))
    .replace(/\{effort:([a-z-]+)\}/g, (_, name) => kind(name).effort);
  if (!called.includes('{from}')) return called;
  return Object.entries(table.budgets[value]).map(([fromTier, toTier]) => {
    if (!tiers[fromTier] || !tiers[toTier]) throw new Error(`budgets.${value}: ${fromTier} to ${toTier} names a tier the provider lacks`);
    return called.replaceAll('{from}', tiers[fromTier]).replaceAll('{to}', tiers[toTier]);
  }).join(' ');
}

// A schema key with a `rules` map contributes its current value's rule text to
// the injected settings line; a value with no entry there (such as budget's
// default `medium`) adds nothing. On Codex a `codexRules` map takes the place
// of `rules` for its key, because Codex spawns a twin by name where Claude
// Code passes the Agent call a model and effort.
function activeRules(values) {
  const onCodex = currentHost() === 'codex';
  return Object.entries(SCHEMA)
    .map(([key, entry]) => {
      const rules = (onCodex && entry.codexRules) || entry.rules;
      return rules?.[values[key]] ? filledRule(rules[values[key]], values[key]) : '';
    })
    .filter(Boolean)
    .join(' ');
}

// The session hook prints this line into every session, so a broken layer
// degrades to the defaults and names the file instead of failing the hook.
function contextLine(root) {
  try {
    const stack = layers(root);
    const notes = stack.map((layer) => layer.unreadable).filter(Boolean);
    const resolved = Object.fromEntries(Object.keys(SCHEMA).map((key) => [key, resolve(key, stack)]));
    for (const { notes: keyNotes } of Object.values(resolved)) notes.push(...keyNotes);
    // An empty value adds noise to every session, so the line leaves it out.
    const printed = Object.keys(SCHEMA).filter((key) => resolved[key].value !== '');
    const parts = printed.map((key) => `${key}=${resolved[key].value} (${resolved[key].layer})`);
    const rules = activeRules(Object.fromEntries(Object.keys(SCHEMA).map((key) => [key, resolved[key].value])));
    return `${[`exo settings: ${parts.join(', ')}`, ...notes].join('; ')}. ${rules}`;
  } catch (error) {
    const defaults = Object.fromEntries(Object.entries(SCHEMA).map(([key, entry]) => [key, entry.default]));
    const defaultParts = Object.entries(defaults)
      .filter(([, value]) => value !== '')
      .map(([key, value]) => `${key}=${value} (default)`);
    return `exo settings: ${defaultParts.join(', ')}; ${error.message}. ${activeRules(defaults)}`;
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

// The overview plus the one question that moves a change forward: which topic
// without an argument, which setting with a topic, which value with a key.
// Every question holds Keep plus at most three picks, the four letters the
// question shape allows: the topics keep the first answer to four letters, and
// a value past the third pick is named in the context line as a typed answer.
// Keep is always A, the recommended answer, and the plain texts come from the
// schema's `label`, `about`, `question`, `typed` and `choices`. The option lines
// sit outside the fence because bold renders only there.
const MAX_PICKS = 3;
const TOPICS = {
  work: { label: 'How I work', question: 'Which part of how I work?', about: 'how I write to you and how much effort tasks get', keys: ['replies', 'budget'] },
  places: { label: 'Where work goes', question: 'Which part of where work goes?', about: 'where plans, code changes and finished work end up', keys: ['specs', 'workspace', 'ship'] },
  safety: { label: 'Safety', question: 'Which part of safety?', about: 'what I block', keys: ['guards'] }
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
    const picks = Object.values(TOPICS).map((topic) => `${topic.label}**: ${topic.about}`);
    console.log([...overview(Object.keys(SCHEMA), stack), '', ...question('What would you like to change?', 'Pick a topic to change one setting in it; the rest stay as they are.', 'Keep as is**: change nothing', picks, 'your current settings keep working, and the others change how I behave from now on.')].join('\n'));
    return;
  }
  if (Object.hasOwn(TOPICS, name)) {
    const topic = TOPICS[name];
    const picks = topic.keys.map((key) => `${SCHEMA[key].label}**: ${SCHEMA[key].about} (now: ${plainValue(key, resolve(key, stack).value)})`);
    console.log([...overview(topic.keys, stack), '', ...question(topic.question, '', 'Keep as is**: change nothing', picks, 'nothing changes, and the others each lead to one question about that setting.')].join('\n'));
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
  const rest = others.slice(MAX_PICKS).map(([value, choice]) => `\`${value}\` for ${choice.label} (${choice.gives})`);
  const context = [entry.typed, rest.length > 0 ? `Or type ${rest.join(' or ')}.` : ''].filter(Boolean).join(' ');
  console.log([...overview([name], stack), '', ...question(entry.question, context, keep, picks, 'it keeps what you have now, and any other answer changes it from now on.')].join('\n'));
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
