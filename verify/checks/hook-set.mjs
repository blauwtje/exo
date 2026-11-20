import fs from 'node:fs';
import { isFile } from '../repository.mjs';

const SHIPPED_EVENTS = ['SessionStart', 'UserPromptSubmit'];

function problemsOf(repository) {
  const file = repository.join('hooks', 'hooks.json');
  let hooks;
  try {
    hooks = JSON.parse(fs.readFileSync(file, 'utf8')).hooks;
  } catch (error) {
    return [`hooks/hooks.json cannot be read: ${error.message}`];
  }
  const events = Object.keys(hooks ?? {});
  const eventProblems = events.filter((event) => !SHIPPED_EVENTS.includes(event)).map((event) => `event ${event} is not shipped`);
  const missing = SHIPPED_EVENTS.filter((event) => !events.includes(event)).map((event) => `event ${event} is missing`);
  const shape = SHIPPED_EVENTS.filter((event) => events.includes(event)).filter((event) => {
    const entries = hooks[event];
    return !Array.isArray(entries) || entries.length !== 1 || entries[0]?.hooks?.length !== 1 || entries[0].hooks[0].type !== 'command';
  }).map((event) => `event ${event} must hold one entry with one command hook`);
  const shapeBroken = new Set(shape.map((message) => message.split(' ')[1]));
  const scripts = SHIPPED_EVENTS.filter((event) => events.includes(event) && !shapeBroken.has(event)).flatMap((event) => {
    const hook = hooks[event][0].hooks[0];
    const named = /"?\$\{CLAUDE_PLUGIN_ROOT\}([^"\s]*)/.exec(hook.args?.[0] ?? hook.command ?? '');
    const missingFile = !named ? [`event ${event} command names no script under CLAUDE_PLUGIN_ROOT`]
      : isFile(repository.join(named[1])) ? [] : [`event ${event} command names missing file ${named[1].replace(/^\//, '')}`];
    const slowTimeout = typeof hook.timeout === 'number' ? [] : [`event ${event} timeout is not a number`];
    return [...missingFile, ...slowTimeout];
  });
  return [...eventProblems, ...missing, ...shape, ...scripts];
}

export function checkHookSet(report, repository) {
  const problems = problemsOf(repository);
  report.assert(
    problems.length === 0,
    'hook set',
    { pass: 'hooks.json holds only the two shipped hooks', fail: problems.join('; ') }
  );
}
