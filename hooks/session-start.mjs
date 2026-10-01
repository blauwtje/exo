#!/usr/bin/env node
// SessionStart hook on startup, resume, clear and compact: builds one
// additionalContext string, in order: a resume-plan pointer on clear or
// compact, a handoff pointer, a project-memory pointer, the settings line,
// then the body of the route-skills skill (frontmatter dropped), the only
// skill invoked this way because its frontmatter blocks model invocation.
// It runs in Node so a host without `jq` still gets the injection.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { readHookText } from '#hook-input';
import { reset as resetRepeatGuard } from './guards/repeat-guard.mjs';
import { sessionOutput } from '../skills/build/scripts/resume-plan.mjs';

// A hook output string over this many characters reaches the model as a file
// path and a 2,000-character preview, which would cut the rules themselves. The
// pointers and the settings line go first and always, so a cut falls on the
// tail of the route-skills body and is named on stderr.
// verify/budgets.mjs holds the same number as HOOK_OUTPUT_CAP.
const OUTPUT_CAP = 10000;

const root = path.dirname(path.dirname(path.resolve(process.argv[1])));
const configDirectory = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'exo');

// Runs a script of this plugin in its own process, for the two that are not
// importable: settings.mjs and read-guard.mjs run their command at load. Lift
// it by exporting `contextLine` and the read guard's `reset` and importing them.
function runScript(relativePath, argument, input) {
  return spawnSync(process.execPath, [path.join(root, relativePath), argument], { input, encoding: 'utf8' });
}

function git(cwd, ...args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

// A file inside the repository is named from its root, because a full path
// grows with every folder above the checkout; one outside it keeps its full path.
function located(file, top) {
  if (!top) return `\`${file}\``;
  const relative = path.relative(top, file);
  // A linked worktree keeps its handoff and memory under the main checkout, so
  // the relative path climbs out of the root and only the full path resolves.
  if (relative === '' || relative.startsWith('..')) return `\`${file}\``;
  return `\`${relative}\` from the repository root`;
}

// A handoff the user wrote before a clear sits beside the branch it belongs to,
// so a session resuming that work is told where it is instead of searching for
// it. Only the pointer is injected: the file itself is often longer than this
// whole body, and most sessions here are not the one it was written for.
function pointersFor(cwd) {
  let pointers = '';
  // The commit sentence is added only inside a repository, where the reader has
  // a HEAD to compare the file against.
  let staleness = '';
  let scope;
  let handoffFile;
  let top = null;
  const gitDirectory = git(cwd, 'rev-parse', '--absolute-git-dir');
  if (gitDirectory !== null) {
    top = git(cwd, 'rev-parse', '--show-toplevel');
    scope = git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD') ?? '';
    handoffFile = path.join(gitDirectory, 'exo', 'handoff', `${scope}.md`);
    staleness = ' Compare its `Written:` commit with `git rev-parse --short HEAD`.';
  } else {
    scope = path.basename(cwd);
    handoffFile = path.join(configDirectory, 'handoff', `${scope}.md`);
  }
  if (fs.existsSync(handoffFile) && fs.statSync(handoffFile).isFile()) {
    pointers += `A handoff for \`${scope}\` sits at ${located(handoffFile, top)}. Read it only when this session continues that work.${staleness}\n\n`;
  }
  // The project memory belongs to the repository rather than to one branch, so
  // it sits in the common git directory a linked worktree shares. Only the
  // pointer is injected: the body is read by the session that needs it.
  const commonDirectory = git(cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir');
  const memoryFile = commonDirectory === null
    ? path.join(configDirectory, 'memory', path.basename(cwd), 'memory.md')
    : path.join(commonDirectory, 'exo', 'memory.md');
  if (fs.existsSync(memoryFile) && fs.statSync(memoryFile).isFile()) {
    pointers += `A project memory for this repository sits at ${located(memoryFile, top)}. Read it before changing code you have not read here, and run \`/exo:remember\` to change it.\n\n`;
  }
  return pointers;
}

// The route-skills text without its frontmatter; every later `---` line goes
// too, as the awk filter this replaced dropped it.
function skillBody(skillFile) {
  let fences = 0;
  const kept = [];
  for (const line of fs.readFileSync(skillFile, 'utf8').split('\n')) {
    if (line === '---') fences += 1;
    else if (fences >= 2) kept.push(line);
  }
  return kept.join('\n').replace(/\n+$/, '');
}

let input = {};
try {
  input = JSON.parse((await readHookText()) || '{}');
} catch (error) {
  console.error(`exo: session hook input unreadable, ${error.message}`);
}

// The installed copy lives under a versioned cache path, so the status line
// and the skills reach the scripts through this pointer instead of a path that
// rots per bump; a resumed session can run a newer copy than it started on.
fs.mkdirSync(configDirectory, { recursive: true });
fs.writeFileSync(path.join(configDirectory, 'plugin-root'), `${root}\n`);
// The savings ledger and counter left by earlier versions are dead weight now.
fs.rmSync(path.join(configDirectory, 'savings'), { recursive: true, force: true });

// A clear or a compaction empties the context, so the read guard forgets which
// ranges the model still holds and the repeat guard forgets which calls it saw.
let pointers = '';
if (input.source === 'clear' || input.source === 'compact') {
  runScript('hooks/guards/read-guard.mjs', 'reset', JSON.stringify(input));
  try {
    resetRepeatGuard(input);
  } catch (error) {
    console.error(`repeat-guard: ${error.message}`);
  }
  // A plan build left open survives only as its marker, so the cleared
  // session is told to resume it instead of waiting for the user to ask.
  try {
    const runningPlan = sessionOutput(input).replace(/\n+$/, '');
    if (runningPlan) pointers += `${runningPlan}\n\n`;
  } catch (error) {
    console.error(`resume-plan: ${error.message}`);
  }
}

const skillFile = path.join(root, 'skills', 'route-skills', 'SKILL.md');
if (fs.existsSync(skillFile)) {
  if (typeof input.cwd === 'string' && input.cwd !== '') pointers += pointersFor(input.cwd);
  // Skills read project and global choices, such as where spec stores a spec,
  // from this one line instead of opening the settings files themselves.
  const settingsRun = runScript('skills/configure/scripts/settings.mjs', 'context');
  const settings = settingsRun.status === 0 ? settingsRun.stdout.replace(/\n+$/, '') : 'exo settings: unresolved, defaults apply';
  const headText = `${pointers}${settings}\n\n`;
  const room = OUTPUT_CAP - headText.length;
  let body = skillBody(skillFile);
  if (body.length > room) {
    console.error(`exo: route-skills cut by ${body.length - room} characters, the session context would pass ${OUTPUT_CAP}`);
    body = body.slice(0, Math.max(room, 0));
  }
  const additionalContext = `${headText}${body}`;
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } })}\n`);
}
