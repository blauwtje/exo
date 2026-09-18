#!/usr/bin/env node
// Books which skill handled each request, so a session can be asked afterwards
// which skills fired and which turns matched none, without paying a judge.
// UserPromptSubmit opens the turn, PreToolUse on Skill names what fired in it,
// and Stop closes it: a turn that closes with no skill named books `none`, the
// case worth seeing. No request text is stored: the record holds a skill name
// and a count, never the prompt. Only the main thread is booked, because a
// delegate shares the session id while answering its own prompt, and counting
// it would hide a main-thread turn that routed to nothing. EXO_SAVINGS=off or
// `enabled: false` books nothing.
//
//   node routing.mjs open    UserPromptSubmit hook: stdin is the hook JSON
//   node routing.mjs fired   PreToolUse hook on Skill: stdin is the hook JSON
//   node routing.mjs close   Stop hook: stdin is the hook JSON
//
// A routing fault never blocks a turn: any error exits 0 with no output.

import fs from 'node:fs';
import process from 'node:process';
import { savingsEnabled, updateSession } from './record.mjs';

const SKILL_PREFIX = 'exo:';

// The record holds bare exo skill names; another plugin's skill keeps the
// prefix that tells it apart.
function skillName(toolInput) {
  const name = toolInput?.skill;
  if (typeof name !== 'string' || name === '') return null;
  if (name.startsWith(SKILL_PREFIX)) return name.slice(SKILL_PREFIX.length);
  return name;
}

// The session this call books against, or null when there is none to book.
function bookingSession(hookInput) {
  if (!savingsEnabled()) return null;
  if (typeof hookInput.session_id !== 'string') return null;
  if (typeof hookInput.agent_id === 'string') return null;
  return hookInput.session_id;
}

function open(hookInput) {
  const sessionId = bookingSession(hookInput);
  if (sessionId === null) return;
  updateSession(sessionId, (session) => {
    session.routing.open = true;
    session.routing.fired = false;
    return true;
  });
}

function fired(hookInput) {
  const sessionId = bookingSession(hookInput);
  if (sessionId === null) return;
  const name = skillName(hookInput.tool_input);
  if (name === null) return;
  updateSession(sessionId, (session) => {
    session.routing.skills[name] = (session.routing.skills[name] ?? 0) + 1;
    session.routing.fired = true;
    return true;
  });
}

// A Stop without an open turn books nothing: the turn it would close was
// already counted, or began before this session was booked.
function close(hookInput) {
  const sessionId = bookingSession(hookInput);
  if (sessionId === null) return;
  updateSession(sessionId, (session) => {
    if (!session.routing.open) return false;
    if (!session.routing.fired) session.routing.none += 1;
    session.routing.open = false;
    session.routing.fired = false;
    return true;
  });
}

const COMMANDS = { open, fired, close };

try {
  const hookInput = JSON.parse(fs.readFileSync(0, 'utf8'));
  const command = COMMANDS[process.argv[2]];
  if (command !== undefined) command(hookInput);
} catch (error) {
  console.error(`routing: ${error.message}`);
}
