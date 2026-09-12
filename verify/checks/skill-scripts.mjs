// Every file a skill ships under scripts/ is an .mjs module that parses,
// installs nothing, hard-codes no machine path, and is linked from the prose
// that names it. A skill script that installs a package or points at one
// machine's temp directory works only where it was written.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const PACKAGE_MANAGER_CALL = /\b(exec|execSync|execFile|execFileSync|spawn|spawnSync)\s*\(\s*['"`](npm|npx|yarn|pnpm)\b/i;
const MACHINE_PATH = /(\/var\/folders\/|\/private\/var\/folders\/|[A-Za-z]:\\Users\\)/;
const SCRIPT_LINK = /scripts\/([A-Za-z0-9._-]+\.mjs)/g;

function scriptFolders(repository) {
  return repository.skillDirectories()
    .map((name) => path.join(repository.skillsRoot, name, 'scripts'))
    .filter((folder) => fs.existsSync(folder) && fs.statSync(folder).isDirectory());
}

export function checkSkillScripts(report, repository) {
  const folders = scriptFolders(repository);
  if (folders.length === 0) {
    report.result('UNRUN', 'skill scripts', 'no skill ships a scripts/ folder');
    return;
  }

  const problems = [];
  let checked = 0;
  for (const folder of folders) {
    for (const name of fs.readdirSync(folder).sort()) {
      // A dot-prefixed file is skipped deliberately rather than by the shell's
      // hidden-file convention, which differs per platform.
      if (name.startsWith('.')) continue;
      const file = path.join(folder, name);
      if (!fs.statSync(file).isFile()) continue;
      const relative = repository.relative(file);
      if (path.extname(name) !== '.mjs') {
        problems.push(`${relative} is not a .mjs module`);
        continue;
      }
      checked += 1;
      const content = repository.text(file);
      // An install command may appear as advice in a message; it may never be run.
      if (PACKAGE_MANAGER_CALL.test(content)) {
        problems.push(`${relative} runs a package manager; skill scripts install nothing`);
      }
      if (MACHINE_PATH.test(content)) {
        problems.push(`${relative} hard-codes an absolute machine path`);
      }
      const parse = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      if (parse.status !== 0) {
        const message = `${parse.stdout ?? ''}${parse.stderr ?? ''}`.split('\n').join(' ').trim();
        problems.push(`${relative} fails node --check: ${message}`);
      }
    }
  }

  for (const file of repository.processFiles()) {
    let skillRoot = path.dirname(file);
    if (path.basename(skillRoot) === 'references') skillRoot = path.dirname(skillRoot);
    for (const match of repository.text(file).matchAll(SCRIPT_LINK)) {
      const target = path.join(skillRoot, 'scripts', match[1]);
      if (!(fs.existsSync(target) && fs.statSync(target).isFile())) {
        problems.push(`${repository.relative(file)} links missing ${match[0]}`);
      }
    }
  }

  report.assert(
    problems.length === 0,
    'skill scripts',
    `${checked} skill scripts parse, install nothing, and are linked correctly`,
    problems.join('; ')
  );
}
