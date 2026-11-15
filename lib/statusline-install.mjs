import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const STATUSLINE_MODULE = path.resolve(import.meta.dirname, 'statusline.mjs');

function launcherSource() {
  return [
    'try {',
    `  const { main } = await import(${JSON.stringify(pathToFileURL(STATUSLINE_MODULE).href)});`,
    '  await main();',
    '} catch {}',
    ''
  ].join('\n');
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

try {
  statusline();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
