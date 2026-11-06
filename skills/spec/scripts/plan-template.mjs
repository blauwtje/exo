import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseFlags, UsageError, isMain } from '#script-flags';

const USAGE = [
  'usage: plan-template.mjs list --root <dir>',
  '       plan-template.mjs render --root <dir> --template <name> [--param <name>=<value>]... [--out <file>]',
  '       plan-template.mjs save --root <dir> --plan <file> --name <name> --summary <text> [--param <literal>=<name>]...',
  '       plan-template.mjs done --root <dir> --plan <file>'
].join('\n');

const FLAGS = { root: 'value', template: 'value', param: 'list', out: 'value', plan: 'value', name: 'value', summary: 'value' };
const TEMPLATE_DIRECTORY = path.join('docs', 'plans', 'templates');
const DONE_FILE = path.join('docs', 'plans', 'definition-of-done.md');
const NAME = /^[a-z][a-z0-9-]*$/;
const PLACEHOLDER = /\{\{([a-z][a-z0-9-]*)\}\}/g;
const CRITERION_HEADING = /^## Success criterion[ \t]*$/m;
const CHAIN = ' && ';

function readFile(file, what) {
  if (!fs.existsSync(file)) throw new UsageError(`no ${what} at ${file}`);
  return fs.readFileSync(file, 'utf8');
}

function requireFlags(flags, names) {
  const missing = names.filter((name) => flags[name] === undefined);
  if (missing.length > 0) throw new UsageError(`missing ${missing.map((name) => `--${name}`).join(', ')}`);
}

function templateFile(root, name) {
  if (!NAME.test(name)) throw new UsageError(`template name '${name}' must be lowercase words joined by '-'`);
  return path.join(root, TEMPLATE_DIRECTORY, `${name}.md`);
}

export function parseTemplate(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (match === null) throw new UsageError('the template has no front matter between two --- lines');
  const fields = Object.fromEntries(match[1].split('\n').map((line) => [line.slice(0, line.indexOf(':')).trim(), line.slice(line.indexOf(':') + 1).trim()]));
  const params = (fields.params ?? '').split(',').map((param) => param.trim()).filter(Boolean);
  return { name: fields.name ?? '', summary: fields.summary ?? '', params, body: text.slice(match[0].length) };
}

function placeholdersOf(body) {
  return [...new Set([...body.matchAll(PLACEHOLDER)].map((match) => match[1]))];
}

export function fillTemplate(template, values) {
  const known = new Set(['root', ...template.params]);
  const undeclared = placeholdersOf(template.body).filter((name) => !known.has(name));
  if (undeclared.length > 0) throw new UsageError(`the template uses undeclared parameters: ${undeclared.join(', ')}`);
  const unknown = Object.keys(values).filter((name) => !known.has(name));
  if (unknown.length > 0) throw new UsageError(`unknown parameters: ${unknown.join(', ')}; the template takes ${template.params.join(', ') || 'none'}`);
  const missing = template.params.filter((name) => values[name] === undefined);
  if (missing.length > 0) throw new UsageError(`missing parameters: ${missing.map((name) => `--param ${name}=<value>`).join(' ')}`);
  const multiline = Object.keys(values).filter((name) => /[\r\n]/.test(values[name]));
  if (multiline.length > 0) throw new UsageError(`a parameter value spans lines: ${multiline.join(', ')}`);
  return template.body.replace(PLACEHOLDER, (_, name) => values[name]);
}

export function doneCommands(text) {
  const commands = text.split('\n').map((line) => line.match(/^\s*[-*]\s+`([^`]+)`/)?.[1].trim()).filter(Boolean);
  return [...new Set(commands)];
}

function criterionSection(planText) {
  const heading = planText.match(CRITERION_HEADING);
  if (heading === null) throw new UsageError("the plan has no '## Success criterion'");
  const start = heading.index + heading[0].length;
  const length = planText.slice(start).search(/^## /m);
  return { start, text: length === -1 ? planText.slice(start) : planText.slice(start, start + length) };
}

export function applyDone(planText, commands) {
  const { start, text } = criterionSection(planText);
  const found = text.match(/`([^`]+)`/);
  if (found === null) throw new UsageError("the plan's Success criterion holds no backticked command");
  const present = found[1].split(CHAIN).map((part) => part.trim());
  const missing = commands.filter((command) => !present.includes(command));
  if (missing.length === 0) return planText;
  if (found[1].startsWith('mcp:')) throw new UsageError("the Success criterion is an 'mcp:' call, which cannot chain the done-list commands");
  const commandStart = start + found.index + 1;
  return planText.slice(0, commandStart) + [found[1], ...missing].join(CHAIN) + planText.slice(commandStart + found[1].length);
}

function doneListOf(root) {
  const file = path.join(root, DONE_FILE);
  return fs.existsSync(file) ? doneCommands(fs.readFileSync(file, 'utf8')) : [];
}

function parsePairs(pairs = []) {
  return Object.fromEntries(pairs.map((pair) => {
    const at = pair.indexOf('=');
    if (at < 1) throw new UsageError(`'${pair}' must read <name>=<value>`);
    return [pair.slice(0, at), pair.slice(at + 1)];
  }));
}

function listTemplates(root) {
  const directory = path.join(root, TEMPLATE_DIRECTORY);
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter((file) => file.endsWith('.md')).sort().map((file) => parseTemplate(fs.readFileSync(path.join(directory, file), 'utf8')));
}

export function renderPlan(root, name, values) {
  const template = parseTemplate(readFile(templateFile(root, name), 'template'));
  return applyDone(fillTemplate(template, { ...values, root }), doneListOf(root));
}

function repositoryAndBranch(planText) {
  const repository = planText.match(/^Repository: (.+)$/m)?.[1].trim();
  const branch = planText.match(/^Branch: (.+)$/m)?.[1].trim();
  if (repository === undefined || branch === undefined) throw new UsageError("the plan's '## Plan basis' needs a 'Repository:' and a 'Branch:' line");
  return { repository, branch };
}

export function parameterise(planText, literals) {
  const { repository, branch } = repositoryAndBranch(planText);
  const pairs = [[repository, 'root'], [branch, 'branch'], ...Object.entries(literals)];
  const absent = pairs.filter(([literal]) => !planText.includes(literal)).map(([literal]) => literal);
  if (absent.length > 0) throw new UsageError(`the plan does not hold: ${absent.join(', ')}`);
  const body = pairs.reduce((text, [literal, name]) => text.replaceAll(literal, `{{${name}}}`), planText);
  return { body, params: pairs.map(([, name]) => name).filter((name) => name !== 'root') };
}

function saveTemplate(root, flags) {
  requireFlags(flags, ['name', 'summary', 'plan']);
  const literals = parsePairs(flags.param);
  const invalid = Object.values(literals).filter((param) => !NAME.test(param));
  if (invalid.length > 0) throw new UsageError(`parameter names must be lowercase words joined by '-': ${invalid.join(', ')}`);
  const file = templateFile(root, flags.name);
  if (fs.existsSync(file)) throw new UsageError(`${file} already exists; pick another --name or delete it`);
  const { body, params } = parameterise(readFile(flags.plan, 'plan'), literals);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `---\nname: ${flags.name}\nsummary: ${flags.summary}\nparams: ${params.join(', ')}\n---\n${body}`);
  return `saved ${file}\n`;
}

function listing(root) {
  const lines = listTemplates(root).map((template) => `${template.name}\t${template.summary}\tparams: ${template.params.join(', ') || 'none'}`);
  return lines.length === 0 ? 'no templates\n' : `${lines.join('\n')}\n`;
}

function appendDone(root, flags) {
  requireFlags(flags, ['plan']);
  const before = readFile(flags.plan, 'plan');
  const after = applyDone(before, doneListOf(root));
  if (after === before) return 'done-list already in the Success criterion\n';
  fs.writeFileSync(flags.plan, after);
  return 'done-list appended to the Success criterion\n';
}

function renderTemplate(root, flags) {
  requireFlags(flags, ['template']);
  const plan = renderPlan(root, flags.template, parsePairs(flags.param));
  if (flags.out === undefined) return plan;
  fs.writeFileSync(flags.out, plan);
  return `wrote ${flags.out}\n`;
}

const COMMANDS = { list: (root) => listing(root), save: saveTemplate, done: appendDone, render: renderTemplate };

export function run(argv) {
  const [command, ...rest] = argv;
  const handler = COMMANDS[command];
  if (handler === undefined) throw new UsageError(`unknown command '${command ?? ''}'`);
  const flags = parseFlags(rest, FLAGS, { usage: USAGE });
  requireFlags(flags, ['root']);
  return handler(path.resolve(flags.root), flags);
}

function main(argv) {
  try {
    process.stdout.write(run(argv));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`${error.message}\n${USAGE}\n`);
    process.exitCode = 1;
  }
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
