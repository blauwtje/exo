
import fs from 'node:fs';
import path from 'node:path';
import { syntaxFailures } from '../syntax-failures.mjs';

const PACKAGE_MANAGER_CALL = /\b(exec|execSync|execFile|execFileSync|spawn|spawnSync)\s*\(\s*['"`](npm|npx|yarn|pnpm)\b/i;
const MACHINE_PATH = /(\/var\/folders\/|\/private\/var\/folders\/|[A-Za-z]:\\Users\\)/;
const SCRIPT_LINK = /(?:\.\.\/([A-Za-z0-9._-]+)\/)?scripts\/([A-Za-z0-9._-]+\.mjs)/g;

function scriptFolders(repository) {
  return repository.skillDirectories()
    .map((name) => path.join(repository.skillsRoot, name, 'scripts'))
    .filter((folder) => fs.existsSync(folder) && fs.statSync(folder).isDirectory());
}

function isFile(target) {
  return fs.existsSync(target) && fs.statSync(target).isFile();
}

function scriptFiles(folders) {
  return folders.flatMap((folder) => fs.readdirSync(folder).sort()
    .filter((name) => !name.startsWith('.'))
    .map((name) => path.join(folder, name))
    .filter((file) => fs.statSync(file).isFile()));
}

function contentProblems(relative, content) {
  const problems = [];
  if (PACKAGE_MANAGER_CALL.test(content)) problems.push(`${relative} runs a package manager; skill scripts install nothing`);
  if (MACHINE_PATH.test(content)) problems.push(`${relative} hard-codes an absolute machine path`);
  return problems;
}

function linkProblems(repository) {
  return repository.processFiles().flatMap((file) => {
    const folder = path.dirname(file);
    const skillRoot = path.basename(folder) === 'references' ? path.dirname(folder) : folder;
    return [...repository.text(file).matchAll(SCRIPT_LINK)]
      .filter(([, siblingSkill, scriptName]) => {
        const owningRoot = siblingSkill ? path.join(repository.skillsRoot, siblingSkill) : skillRoot;
        return !isFile(path.join(owningRoot, 'scripts', scriptName));
      })
      .map(([link]) => `${repository.relative(file)} links missing ${link}`);
  });
}

export function checkSkillScripts(report, repository) {
  const folders = scriptFolders(repository);
  if (folders.length === 0) {
    report.result('UNRUN', 'skill scripts', 'no skill ships a scripts/ folder');
    return;
  }

  const files = scriptFiles(folders);
  const modules = files.filter((file) => path.extname(file) === '.mjs');
  const problems = [
    ...files.filter((file) => path.extname(file) !== '.mjs').map((file) => `${repository.relative(file)} is not a .mjs module`),
    ...modules.flatMap((file) => contentProblems(repository.relative(file), repository.text(file))),
    ...syntaxFailures(modules).map(({ file, message }) => `${repository.relative(file)} fails to parse: ${message}`),
    ...linkProblems(repository)
  ];

  report.assert(
    problems.length === 0,
    'skill scripts',
    { pass: `${modules.length} skill scripts parse, install nothing, and are linked correctly`, fail: problems.join('; ') }
  );
}
