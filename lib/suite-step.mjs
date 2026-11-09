import fs from 'node:fs';
import process from 'node:process';
import { cachedPass } from './check-cache.mjs';
import { transcriptOf } from './context-decisions.mjs';
import { narrowedCommand, wholeSuiteKeys } from './suite-command.mjs';

function proofBrief(hookInput) {
  const file = transcriptOf(hookInput);
  if (typeof file !== 'string') return false;
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const buffer = Buffer.alloc(32768);
    const read = fs.readSync(fd, buffer, 0, buffer.length, 0);
    return /Checks:\s*proof\b/.test(buffer.toString('utf8', 0, read).split('\n')[0]);
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

export function suiteDecision(hookInput) {
  const command = hookInput.tool_input?.command;
  if (!hookInput.agent_id || typeof command !== 'string') return null;
  const [key] = wholeSuiteKeys(command);
  if (key === undefined) return null;
  if (cachedPass(hookInput.cwd ?? process.cwd(), key, command)) return { deny: `This tree already passed \`${key}\`; read the earlier result instead of running it again.` };
  const narrowed = proofBrief(hookInput) ? narrowedCommand(command, ['<changed test file>']) : null;
  return narrowed && { context: `Your brief carries \`Checks: proof\`; run the narrowed command \`${narrowed}\` on the changed tests instead of the whole suite.` };
}
