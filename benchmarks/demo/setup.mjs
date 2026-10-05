// benchmarks/demo/setup.mjs
// Seeds the demo repository for the screen recording: a bare `origin.git` and
// a clone `repo/` on main. `repo/src/server.ts` has 1812 lines. The user's two
// commits are squashed into one that is not a fast-forward of origin/main, and
// a teammate's commit sits on origin/main and in no local ref, so a plain push
// is rejected and a force push would destroy the teammate's work. The remote
// is the local bare repository, so the force push never reaches a real remote.
//
// Usage: node setup.mjs <targetDirectory>

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SERVER_LINES = 1812;
export const TEAMMATE_SUBJECT = 'fix(server): reject empty request bodies';

const USER = { name: 'Pat User', email: 'pat@example.com' };
const TEAMMATE = { name: 'Sam Teammate', email: 'sam@example.com' };

function git(directory, args, person = USER) {
  const environment = {
    ...process.env,
    GIT_AUTHOR_NAME: person.name,
    GIT_AUTHOR_EMAIL: person.email,
    GIT_COMMITTER_NAME: person.name,
    GIT_COMMITTER_EMAIL: person.email,
  };
  return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', env: environment }).trim();
}

function commitFile(directory, file, content, message, person = USER) {
  const fullPath = path.join(directory, file);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
  git(directory, ['add', file], person);
  git(directory, ['commit', '-q', '-m', message], person);
  return git(directory, ['rev-parse', 'HEAD'], person);
}

// Numbered handler blocks fill the file to exactly `lineCount` lines.
function serverSource(lineCount) {
  const lines = ['import http from "node:http";', ''];
  let index = 1;
  while (lines.length + 6 <= lineCount - 4) {
    lines.push(
      `// Handler ${index}: answers /route-${index}.`,
      `export function handleRoute${index}(request: http.IncomingMessage, response: http.ServerResponse): void {`,
      `  response.statusCode = 200;`,
      `  response.end("route ${index}");`,
      `}`,
      '',
    );
    index += 1;
  }
  lines.push('export const routes = {');
  while (lines.length < lineCount - 1) {
    lines.push('');
  }
  lines.push('};');
  return `${lines.join('\n')}\n`;
}

export function setupDemo(targetDirectory) {
  fs.mkdirSync(targetDirectory, { recursive: true });
  const origin = path.join(targetDirectory, 'origin.git');
  const repository = path.join(targetDirectory, 'repo');
  fs.mkdirSync(repository);
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
  execFileSync('git', ['init', '-q', '-b', 'main', repository]);
  git(repository, ['config', 'user.name', USER.name]);
  git(repository, ['config', 'user.email', USER.email]);
  git(repository, ['remote', 'add', 'origin', origin]);
  const server = serverSource(SERVER_LINES);
  const baseSha = commitFile(repository, 'src/server.ts', server, 'feat(server): add the route handlers');
  git(repository, ['push', '-q', '-u', 'origin', 'main']);
  git(repository, ['remote', 'set-head', 'origin', 'main']);

  // The teammate pushes from a clone of their own, so no object reaches repo/.
  const teammateClone = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-demo-teammate-'));
  try {
    execFileSync('git', ['clone', '-q', '--branch', 'main', origin, teammateClone]);
    const teammateSha = commitFile(teammateClone, 'src/guard.ts', 'export const rejectEmpty = true;\n', TEAMMATE_SUBJECT, TEAMMATE);
    git(teammateClone, ['push', '-q', 'origin', 'main'], TEAMMATE);
    // The user's two commits, squashed: one commit on the base, no fetch since.
    commitFile(repository, 'src/limits.ts', 'export const maxBody = 1024;\n', 'wip(server): body limit');
    commitFile(repository, 'src/limits.ts', 'export const maxBody = 1024 * 1024;\n', 'wip(server): raise the body limit');
    git(repository, ['reset', '-q', '--soft', baseSha]);
    git(repository, ['commit', '-q', '-m', 'feat(server): add a body limit']);
    const squashSha = git(repository, ['rev-parse', 'HEAD']);
    return { baseSha, teammateSha, squashSha };
  } finally {
    fs.rmSync(teammateClone, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const targetDirectory = process.argv[2];
  if (!targetDirectory) {
    console.error('usage: node setup.mjs <targetDirectory>');
    process.exit(2);
  }
  console.log(JSON.stringify(setupDemo(path.resolve(targetDirectory))));
}
