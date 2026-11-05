#!/usr/bin/env node

import process from 'node:process';
import { isMain } from '#script-flags';
import { Refusal } from './cli-refusal.mjs';
import { configCommand } from './config-command.mjs';
import { SESSION_REFUSAL, insideClaudeCode } from './run-session.mjs';
import { approveCommand, runCommand } from './run-command.mjs';
import { claudeCommand, keyCommand, setupCommand } from './setup-commands.mjs';
import { statusCommand, waitCommand } from './watch-commands.mjs';

const USAGE = 'usage: exo run [plan] [--detach] [run-plan flags] | exo run --resume <id> | exo approve <id> | exo status [<id>] | exo wait <id> | exo run config [<key> <value>] | exo key set <provider> | exo claude [--provider <name>] [--effort <level>] [-- <claude args>] | exo setup';

async function dispatch(command, rest) {
  if (command === 'setup') return setupCommand();
  if (command === 'key') return keyCommand(rest);
  if (command === 'claude') return claudeCommand(rest);
  if (command === 'run' && rest[0] === 'config') return configCommand(rest.slice(1));
  if ((command === 'run' || command === 'approve') && insideClaudeCode()) throw new Refusal(`refused: ${SESSION_REFUSAL}`);
  if (command === 'approve') {
    process.exitCode = await approveCommand(rest);
    return;
  }
  if (command === 'status') return statusCommand(rest);
  if (command === 'wait') {
    process.exitCode = await waitCommand(rest);
    return;
  }
  if (command === 'run') {
    process.exitCode = await runCommand(rest);
    return;
  }
  if (command === '--help') return process.stdout.write(`${USAGE}\n`);
  throw new Refusal(USAGE);
}

if (isMain(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  try {
    await dispatch(command, rest);
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    process.stderr.write(`exo: ${error.message}\n`);
    process.exitCode = 2;
  }
}
