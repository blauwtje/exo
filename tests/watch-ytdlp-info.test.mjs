import assert from 'node:assert/strict';
import { test } from 'node:test';
import { availableLanguages, pickCaptions } from '../skills/watch/scripts/ytdlp-info.mjs';

const TRACK = [{ ext: 'vtt' }];

test('pickCaptions prefers manual over auto and the original auto language', () => {
  const track = [{ ext: 'vtt' }];
  assert.deepEqual(pickCaptions({ language: 'en', subtitles: { en: track }, automatic_captions: { en: track } }), { source: 'manual', key: 'en' });
  assert.deepEqual(pickCaptions({ language: 'nl', subtitles: {}, automatic_captions: { en: track, nl: track, 'nl-orig': track } }), { source: 'auto', key: 'nl-orig' });
  assert.deepEqual(pickCaptions({ language: 'nl', subtitles: { fr: track }, automatic_captions: {} }, 'fr'), { source: 'manual', key: 'fr' });
  assert.equal(pickCaptions({ language: 'en', subtitles: {}, automatic_captions: {} }), null);
  assert.equal(pickCaptions({ language: 'en', subtitles: { en: track }, automatic_captions: {} }, 'de'), null);
});

test('pickCaptions with --lang prefers the exact key, then -orig, then a regional key, and skips live_chat', () => {
  const pick = (keys, lang, group = 'subtitles') => pickCaptions({ language: 'en', [group]: Object.fromEntries(keys.map((key) => [key, TRACK])) }, lang)?.key;
  assert.equal(pick(['en-US', 'en-orig', 'en'], 'en'), 'en');
  assert.equal(pick(['en-US', 'en-orig'], 'en'), 'en-orig');
  assert.equal(pick(['en-US'], 'en'), 'en-US');
  assert.equal(pick(['en', 'en-orig'], 'en', 'automatic_captions'), 'en-orig');
  assert.equal(pickCaptions({ language: 'en', subtitles: { live_chat: TRACK } }), null);
  assert.deepEqual(availableLanguages({ subtitles: { fr: TRACK, live_chat: TRACK }, automatic_captions: { en: TRACK, fr: TRACK, de: [] } }), ['fr', 'en']);
});

test('a manual track in another language beats an automatic track in the video language', () => {
  assert.deepEqual(pickCaptions({ language: 'nl', subtitles: { fr: TRACK }, automatic_captions: { 'nl-orig': TRACK } }), { source: 'manual', key: 'fr' });
});

test('pickCaptions takes the language of the original audio format over an auto-dubbed info.language', () => {
  const formats = [{ language: 'en', format_note: 'English (US) dubbed-auto, medium' }, { language: 'nl', format_note: 'Dutch original (default), medium' }];
  const automatic_captions = { en: TRACK, nl: TRACK, 'en-orig': TRACK };
  assert.deepEqual(pickCaptions({ language: 'en', formats, subtitles: {}, automatic_captions }), { source: 'auto', key: 'nl' });
});

test('pickCaptions falls back to the base language of a regional original format', () => {
  const formats = [{ language: 'pt-BR', format_note: 'original (default)' }];
  assert.deepEqual(pickCaptions({ language: 'pt', formats, subtitles: { en: TRACK, pt: TRACK }, automatic_captions: {} }), { source: 'manual', key: 'pt' });
});

test('pickCaptions reads the original format note of a real dubbed video', () => {
  const formats = [
    { language: 'en-US', format_note: 'American English - original (original)' },
    { language: 'en-US', format_note: 'English (US) original (default), low, DRC' },
    { language: 'ar', format_note: 'العربية - dubbed-auto' },
    { language: 'ar', format_note: 'Arabic, low' },
  ];
  const automatic_captions = { ar: TRACK, 'en-US': TRACK };
  assert.deepEqual(pickCaptions({ language: 'en-US', formats, subtitles: {}, automatic_captions }), { source: 'auto', key: 'en-US' });
});
