// The per-session terse feedback state, and the scoring that fills it. The
// Stop hook writes `{ rate, sentence, phrases }` when a terse reply runs over the
// article limit; the reminder hook reads it on the next prompt and clears it.
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
import { ARTICLES, WORD, chatProse, scoreProse } from '#prose-density';
import { isSessionId } from '#session-record-path';

export const ARTICLE_LIMIT = 2.0;
const SENTENCE_LIMIT = 120;
const PHRASE_LIMIT = 5;
const ARTICLE_PHRASE = new RegExp(`(?<![\\p{L}'’-])(?:${[...ARTICLES].join('|')})\\s+${WORD.source}`, 'giu');
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

function hasArticle(sentence) {
  return (sentence.match(WORD) ?? []).some((word) => ARTICLES.has(word.toLowerCase()));
}

function removeArticles(sentence) {
  return sentence.replace(WORD, (word) => (ARTICLES.has(word.toLowerCase()) ? '' : word));
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

// The first sentence of the chat prose that holds an article, with its
// articles removed and the result cut to 120 characters. Null when none does.
export function tightenSentence(text) {
  const sentences = chatProse(text).split(/(?<=[.!?])\s+/);
  const withArticle = sentences.find(hasArticle);
  if (withArticle === undefined) return null;
  const tight = removeArticles(withArticle).replace(/\s+/g, ' ').trim();
  if (tight.length <= SENTENCE_LIMIT) return tight;
  return `${tight.slice(0, SENTENCE_LIMIT - 1)}…`;
}

// Up to five distinct article-plus-next-word phrases of the chat prose, in
// order and lowercased, such as `the array`.
export function strayPhrases(text) {
  const phrases = chatProse(text).match(ARTICLE_PHRASE) ?? [];
  return [...new Set(phrases.map((phrase) => phrase.toLowerCase().replace(/\s+/g, ' ')))].slice(0, PHRASE_LIMIT);
}

// `{ rate, sentence, phrases }` for a reply over the article limit, otherwise null.
export function feedbackFor(text) {
  const { articleRate } = scoreProse(text);
  if (articleRate <= ARTICLE_LIMIT) return null;
  const sentence = tightenSentence(text);
  return sentence === null ? null : { rate: articleRate, sentence, phrases: strayPhrases(text) };
}
