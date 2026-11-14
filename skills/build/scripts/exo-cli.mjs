#!/usr/bin/env node

import process from 'node:process';
import { isMain } from '#script-flags';
import { Refusal } from './cli-refusal.mjs';
import { configCommand } from './config-command.mjs';
import { SESSION_REFUSAL, insideClaudeCode } from './run-session-env.mjs';
import { approveCommand, runCommand } from './run-command.mjs';
import { claudeCommand, keyCommand, setupCommand } from './setup-commands.mjs';
import { undoCommand } from './run-undo.mjs';
import { statusCommand, waitCommand } from './watch-commands.mjs';

const USAGE = 'usage: exo run [plan] [--detach] [run-plan flags] | exo run --resume <id> | exo approve <id> | exo status [<id>] | exo wait <id> | exo undo <id> [--apply] | exo run config [<key> <value>] | exo key set <provider> | exo claude [--provider <name>] [--effort <level>] [-- <claude args>] | exo setup';

const EXIT_CODE_COMMANDS = {
  undo: undoCommand,
  approve: approveCommand,
  wait: waitCommand,
  run: runCommand
};

function refuseInsideClaudeCode(command, rest) {
  const guarded = command === 'run' || command === 'approve' || (command === 'undo' && rest.includes('--apply'));
  if (guarded && insideClaudeCode()) throw new Refusal(`refused: ${SESSION_REFUSAL}`);
}

async function dispatch(command, rest) {
  if (command === 'setup') return setupCommand();
  if (command === 'key') return keyCommand(rest);
  if (command === 'claude') return claudeCommand(rest);
  if (command === 'run' && rest[0] === 'config') return configCommand(rest.slice(1));
  refuseInsideClaudeCode(command, rest);
  if (command === 'status') return statusCommand(rest);
  if (command === '--help') return process.stdout.write(`${USAGE}\n`);
  if (!Object.hasOwn(EXIT_CODE_COMMANDS, command)) throw new Refusal(USAGE);
  process.exitCode = await EXIT_CODE_COMMANDS[command](rest);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  try {
    await dispatch(command, rest);
  } catch (error) {
    reportRefusal(error);
  }
}

function reportRefusal(error) {
  if (!(error instanceof Refusal)) throw error;
  process.stderr.write(`exo: ${error.message}\n`);
  process.exitCode = 2;
}

if (isMain(import.meta.url)) await main();
