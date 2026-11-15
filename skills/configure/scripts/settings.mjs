import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { writeAtomic } from '#basics';
import { LOCAL_FILE, PROJECT_FILE, SCHEMA, globalSource, invalidReason, layers, projectRoot, readLayer, resolve, typedValue, unknownKey } from '#settings-store';

const STATUSLINE_MODULE = path.resolve(import.meta.dirname, '..', '..', '..', 'lib', 'statusline.mjs');

function launcherSource() {
  return [
    'try {',
    `  const { main } = await import(${JSON.stringify(pathToFileURL(STATUSLINE_MODULE).href)});`,
    '  await main();',
    '} catch {}',
    ''
  ].join('\n');
}

const USAGE = 'usage: settings.mjs show | set <key> <value> --scope project|local | statusline';

function show(root) {
  const stack = layers(root);
  const lines = Object.entries(SCHEMA).map(([key, entry], index) => {
    const { value, layer } = resolve(key, stack);
    const origin = layer === 'global' ? `global, changed via ${globalSource()}` : layer;
    const overridden = stack.filter((lower) => lower.name !== layer && lower.values[key] !== undefined).map((lower) => `${lower.name}=${lower.values[key]}`);
    return [
      `${index + 1}. ${entry.label}: ${value === '' ? 'none' : value}  (${key}, ${origin})`,
      `   ${entry.about}`,
      ...(entry.options ? [`   options: ${entry.options.join('  ')}`] : []),
      ...(overridden.length > 0 ? [`   overrides: ${overridden.join(', ')}`] : []),
      ''
    ].join('\n');
  });
  console.log(['```text', ...lines, `This skill writes project and local; global is changed via ${globalSource()}.`, '```'].join('\n'));
}

function set(root, key, value, scope) {
  if (!Object.hasOwn(SCHEMA, key ?? '')) throw unknownKey(key);
  if (scope === 'global') throw new Error(`${key} is global: set it in /config under the exo plugin, not by this script`);
  if (scope !== 'project' && scope !== 'local') throw new Error('--scope must be project or local');
  const typed = typedValue(key, value);
  const problem = invalidReason(key, typed);
  if (problem) throw new Error(problem);
  const relative = scope === 'local' ? LOCAL_FILE : PROJECT_FILE;
  const file = path.join(root, relative);
  writeAtomic(file, `${JSON.stringify({ ...readLayer(file), [key]: typed }, null, 2)}\n`);
  console.log(`${key}=${typed} set in ${relative}`);
  const ignored = spawnSync('git', ['-C', root, 'check-ignore', '-q', relative]).status;
  if (scope === 'local' && ignored === 1) {
    const gitignore = path.join(root, '.gitignore');
    const current = fs.existsSync(gitignore) ? fs.readFileSync(gitignore, 'utf8') : '';
    fs.appendFileSync(gitignore, `${current === '' || current.endsWith('\n') ? '' : '\n'}${relative.split(path.sep).join('/')}\n`);
    console.log(`${relative} added to .gitignore`);
  }
  if (scope === 'project' && ignored === 0) console.log(`${relative} is git-ignored, so collaborators do not receive it`);
}

function statusline() {
  const directory = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'exo');
  const target = path.join(directory, 'statusline.mjs');
  if (fs.existsSync(target) && !/lib\W+statusline\.mjs/.test(fs.readFileSync(target, 'utf8'))) {
    throw new Error(`refused: ${target} already exists and is not the exo launcher; move it, then rerun`);
  }
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(target, launcherSource());
  console.log(`launcher ${target}`);
  console.log('add this as the value of the "statusLine" key of your Claude Code settings.json (exo does not edit that file):');
  console.log(JSON.stringify({ type: 'command', command: `node "${path.resolve(target).split(path.sep).join('/')}"` }, null, 2));
}

const [command, ...args] = process.argv.slice(2);
const scopeAt = args.indexOf('--scope');
try {
  if (command === 'show') show(projectRoot());
  else if (command === 'statusline') statusline();
  else if (command === 'set') set(projectRoot(), args[0], args[1], scopeAt === -1 ? undefined : args[scopeAt + 1]);
  else throw new Error(USAGE);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
