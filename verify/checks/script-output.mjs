import fs from 'node:fs';
import { SCRIPT_OUTPUT_EXEMPT } from '../budgets.mjs';

const DOCS = ['agents/task-runner.md', 'skills/build/references/rolling-window.md'];
const SCRIPT_NAME = /\b([a-z][a-z-]*)\.mjs\b/g;

function namedScripts(repository) {
  const names = DOCS.flatMap((doc) => [...repository.text(repository.join(doc)).matchAll(SCRIPT_NAME)].map((match) => match[1]));
  return [...new Set(names)].map((name) => `skills/build/scripts/${name}.mjs`);
}

export function checkScriptOutput(report, repository) {
  const missing = namedScripts(repository)
    .filter((script) => fs.existsSync(repository.join(script)))
    .filter((script) => !SCRIPT_OUTPUT_EXEMPT.includes(script))
    .filter((script) => !repository.text(repository.join(script)).includes('#script-output'));
  report.assert(
    missing.length === 0,
    'runner script output',
    'every runner-facing build script imports #script-output or is exempt',
    `no #script-output import in ${missing.join(', ')}; route its output through lib/script-output.mjs or list it in SCRIPT_OUTPUT_EXEMPT`
  );
}
