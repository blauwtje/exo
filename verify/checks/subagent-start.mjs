import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { SUBAGENT_START_BYTES_LOCK } from '../budgets.mjs';

function subagentStartCommands(repository) {
  const hooksFile = repository.join('hooks/hooks.json');
  const entries = JSON.parse(fs.readFileSync(hooksFile, 'utf8')).hooks?.SubagentStart ?? [];
  return entries.flatMap((entry) => entry.hooks ?? []).map((hook) => hook.command);
}

function outputBytes(command, repository) {
  const root = repository.join('.');
  const { TE_SIDECALL, ...environment } = process.env;
  const run = spawnSync(command.replaceAll('${CLAUDE_PLUGIN_ROOT}', root), {
    shell: true,
    input: '{}',
    cwd: root,
    env: { ...environment, CLAUDE_PLUGIN_ROOT: root }
  });
  return run.stdout.length;
}

export function checkSubagentStart(report, repository) {
  const bytes = subagentStartCommands(repository).reduce((total, command) => total + outputBytes(command, repository), 0);
  report.assert(
    bytes <= SUBAGENT_START_BYTES_LOCK.bytes,
    'subagent start text',
    `${bytes} bytes against the ${SUBAGENT_START_BYTES_LOCK.bytes} locked on ${SUBAGENT_START_BYTES_LOCK.measured}`,
    `${bytes} bytes of SubagentStart hook output against the ${SUBAGENT_START_BYTES_LOCK.bytes} locked; every subagent would load it`
  );
}
