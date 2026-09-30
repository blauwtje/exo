// The per-session terse feedback state, and the scoring that fills it. The
// Stop hook writes `{ rate, sentence }` when a terse reply runs over the
// article limit; the reminder hook reads it on the next prompt and clears it.
//
// One JSON object per session at `<configDirectory()>/exo/terse/<id>.json`:
// `{ expand, feedback }`, with `expand` true after a lone `?` and `feedback`
// a `{ rate, sentence }` object or null. The file is deleted once both are
// empty. An invalid session id writes nothing and reads as empty.
// Imported as `#terse-feedback`.

import fs from 'node:fs';
import path from 'node:path';
import { configDirectory } from '#config-directory';
import { chatProse, scoreProse } from '#prose-density';
import { isSessionId } from '#session-record-path';

export const ARTICLE_LIMIT = 2.0;
const SENTENCE_LIMIT = 120;
const EMPTY_STATE = { expand: false, feedback: null };

export function terseStateFile(sessionId) {
  if (!isSessionId(sessionId)) throw new Error(`invalid session id: ${sessionId}`);
  return path.join(configDirectory(), 'exo', 'terse', `${sessionId}.json`);
}

function isFeedback(value) {
  return value !== null && typeof value === 'object' && typeof value.rate === 'number' && typeof value.sentence === 'string';
}

export function readTerseState(sessionId) {
  if (!isSessionId(sessionId)) return { ...EMPTY_STATE };
  try {
    const state = JSON.parse(fs.readFileSync(terseStateFile(sessionId), 'utf8'));
    if (typeof state.expand !== 'boolean' || (state.feedback !== null && !isFeedback(state.feedback))) {
      return { ...EMPTY_STATE };
    }
    return { expand: state.expand, feedback: state.feedback };
  } catch {
    return { ...EMPTY_STATE };
  }
}

export function clearTerseState(sessionId) {
  fs.rmSync(terseStateFile(sessionId), { force: true });
}

export function writeTerseState(sessionId, { expand, feedback }) {
  if (!isSessionId(sessionId)) return;
  if (!expand && feedback === null) {
    clearTerseState(sessionId);
    return;
  }
  const file = terseStateFile(sessionId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ expand, feedback })}\n`);
}

// The first sentence of the chat prose that holds an article, with its
// articles removed and the result cut to 120 characters. Null when none does.
export function tightenSentence(text) {
  const sentences = chatProse(text).split(/(?<=[.!?])\s+/);
  const withArticle = sentences.find((sentence) => /\b(a|an|the)\b/i.test(sentence));
  if (withArticle === undefined) return null;
  const tight = withArticle.replace(/\b(a|an|the)\s+/gi, '').trim();
  if (tight.length <= SENTENCE_LIMIT) return tight;
  return `${tight.slice(0, SENTENCE_LIMIT - 1)}…`;
}

// `{ rate, sentence }` for a reply over the article limit, otherwise null.
export function feedbackFor(text) {
  const { articleRate } = scoreProse(text);
  if (articleRate <= ARTICLE_LIMIT) return null;
  const sentence = tightenSentence(text);
  return sentence === null ? null : { rate: articleRate, sentence };
}
