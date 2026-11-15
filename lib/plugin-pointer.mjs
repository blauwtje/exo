import fs from 'node:fs';
import path from 'node:path';

const POINTER_FILE = 'plugin-root';
const MAIN_FILE = 'plugin-main';

export const GITDIR_LINE = /^gitdir:\s*(.+)$/m;

function mainCheckoutFromDotGit(root) {
  const dotGit = path.join(root, '.git');
  let stat;
  try {
    stat = fs.statSync(dotGit);
  } catch {
    return null;
  }
  if (stat.isDirectory()) return root;
  const match = GITDIR_LINE.exec(fs.readFileSync(dotGit, 'utf8'));
  if (match === null) return null;
  const gitDirectory = path.resolve(root, match[1].trim());
  let common;
  try {
    common = path.resolve(gitDirectory, fs.readFileSync(path.join(gitDirectory, 'commondir'), 'utf8').trim());
  } catch {
    common = path.dirname(path.dirname(gitDirectory));
  }
  return path.basename(common) === '.git' ? path.dirname(common) : null;
}

export function writePluginPointer(directory, root) {
  fs.writeFileSync(path.join(directory, POINTER_FILE), `${root}\n`);
  const main = mainCheckoutFromDotGit(root);
  if (main === null) fs.rmSync(path.join(directory, MAIN_FILE), { force: true });
  else fs.writeFileSync(path.join(directory, MAIN_FILE), `${main}\n`);
}

function firstLine(file) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n')[0].trim();
  } catch {
    return '';
  }
}

export function readPluginRoot(directory) {
  const pointed = firstLine(path.join(directory, POINTER_FILE));
  if (pointed !== '' && fs.existsSync(pointed)) return pointed;
  const main = firstLine(path.join(directory, MAIN_FILE));
  if (main !== '' && fs.existsSync(main)) return main;
  return pointed === '' ? null : pointed;
}

const LAUNCHER_HEAD = [
  "import fs from 'node:fs';",
  "import path from 'node:path';",
  "import { fileURLToPath, pathToFileURL } from 'node:url';",
  'try {',
  "  const here = path.dirname(fileURLToPath(import.meta.url));"
];

export const STATUSLINE_LAUNCHER = [
  ...LAUNCHER_HEAD,
  "  const line = (name) => { try { return fs.readFileSync(path.join(here, name), 'utf8').split('\\n')[0].trim(); } catch { return ''; } };",
  "  const pointed = line('plugin-root');",
  "  const root = pointed !== '' && fs.existsSync(pointed) ? pointed : line('plugin-main');",
  '  if (root !== \'\') {',
  "    const { main } = await import(pathToFileURL(path.join(root, 'lib', 'statusline.mjs')).href);",
  '    await main();',
  '  }',
  '} catch {}',
  ''
].join('\n');

export const OLD_STATUSLINE_LAUNCHERS = [[
  ...LAUNCHER_HEAD,
  "  const root = fs.readFileSync(path.join(here, 'plugin-root'), 'utf8').trim();",
  "  const { main } = await import(pathToFileURL(path.join(root, 'lib', 'statusline.mjs')).href);",
  '  await main();',
  '} catch {}',
  ''
].join('\n')];

export function refreshStatusLauncher(directory) {
  const target = path.join(directory, 'statusline.mjs');
  let text;
  try {
    text = fs.readFileSync(target, 'utf8');
  } catch {
    return false;
  }
  if (!OLD_STATUSLINE_LAUNCHERS.includes(text)) return false;
  fs.writeFileSync(target, STATUSLINE_LAUNCHER);
  return true;
}
