import fs from 'node:fs';

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
  return [...eventProblems, ...missing, ...shape];
}

export function checkHookSet(report, repository) {
  const problems = problemsOf(repository);
  report.assert(
    problems.length === 0,
    'hook set',
    { pass: 'hooks.json holds only the two shipped hooks', fail: problems.join('; ') }
  );
}
