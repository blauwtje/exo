// The per-session terse feedback state; the reminder hook reads it on the
// next prompt and clears it.
//
// One JSON object per session at `<configDirectory()>/exo/terse/<id>.json`:
// `{ expand, feedback, display }`, with `expand` true after a lone `?`,
// `feedback` a `{ rate, sentence, phrases }` object or null (`phrases` at most
// five article-plus-next-word strings, absent in an older file), and `display` the
// `{ messageId, inFence }` fence state the display filter carries between the
// flushes of one message, or null. The file is deleted once all three are
// empty, and a file with no `display` key reads as `display: null`. An invalid session id writes nothing and reads as empty.
// Imported as `#terse-feedback`.

import fs from 'node:fs';
import path from 'node:path';
import { configDirectory } from '#config-directory';
import { isSessionId } from '#session-record-path';

export const ARTICLE_LIMIT = 2.0;
const EMPTY_STATE = { expand: false, feedback: null, display: null };

// `isSessionId` coerces undefined and null to a matching string, so a missing
// id is rejected here.
function isValidId(sessionId) {
  return typeof sessionId === 'string' && isSessionId(sessionId);
}

export function terseStateFile(sessionId) {
  if (!isValidId(sessionId)) throw new Error(`invalid session id: ${sessionId}`);
  return path.join(configDirectory(), 'exo', 'terse', `${sessionId}.json`);
}

function isFeedback(value) {
  if (value === null || typeof value !== 'object') return false;
  if (typeof value.rate !== 'number' || typeof value.sentence !== 'string') return false;
  return value.phrases === undefined || (Array.isArray(value.phrases) && value.phrases.every((phrase) => typeof phrase === 'string'));
}

function isDisplay(value) {
  return value !== null && typeof value === 'object' && typeof value.messageId === 'string' && typeof value.inFence === 'boolean';
}

export function readTerseState(sessionId) {
  if (!isValidId(sessionId)) return { ...EMPTY_STATE };
  try {
    const state = JSON.parse(fs.readFileSync(terseStateFile(sessionId), 'utf8'));
    if (typeof state.expand !== 'boolean' || (state.feedback !== null && !isFeedback(state.feedback))) {
      return { ...EMPTY_STATE };
    }
    const display = isDisplay(state.display) ? { messageId: state.display.messageId, inFence: state.display.inFence } : null;
    return { expand: state.expand, feedback: state.feedback, display };
  } catch {
    return { ...EMPTY_STATE };
  }
}

export function clearTerseState(sessionId) {
  fs.rmSync(terseStateFile(sessionId), { force: true });
}

export function writeTerseState(sessionId, { expand, feedback, display = null }) {
  if (!isValidId(sessionId)) return;
  if (!expand && feedback === null && display === null) {
    clearTerseState(sessionId);
    return;
  }
  const file = terseStateFile(sessionId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const state = display === null ? { expand, feedback } : { expand, feedback, display };
  fs.writeFileSync(file, `${JSON.stringify(state)}\n`);
}
