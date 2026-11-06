import { HOUR } from './format.mjs';

const LAST_CODE_POINT = 0x10ffff;
const TIMING = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})\s+-->/;
const ENTITY = /&(?:([a-z]+)|#(\d+)|#x([0-9a-f]+));/gi;
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' };
const TIMED_TEXT_FORMATS = [
  { pattern: /<p\s([^>]*[^>/])>([\s\S]*?)<\/p>/g, start: /\bt="(\d+)"/, perSecond: 1000 },
  { pattern: /<text\s([^>]*[^>/])>([\s\S]*?)<\/text>/g, start: /\bstart="(\d+(?:\.\d+)?)"/, perSecond: 1 },
];

function decodeEntity(match, name, decimal, hex) {
  if (name) return ENTITIES[`&${name};`] ?? match;
  const code = decimal ? Number(decimal) : parseInt(hex, 16);
  return code > 0 && code <= LAST_CODE_POINT ? String.fromCodePoint(code) : match;
}

export function decodeEntities(text) {
  return text.replace(ENTITY, decodeEntity);
}

function cueStart(line) {
  const match = TIMING.exec(line);
  if (!match) return null;
  const [, hours = '0', minutes, seconds, millis] = match;
  return Number(hours) * HOUR + Number(minutes) * 60 + Number(seconds) + Number(millis) / 1000;
}

const VOICE_TAG = /^<v(?:\.[^\s>]*)*\s+([^>]+)>/;
const DIARIZED_PREFIX = /^\[(SPEAKER_\d+)\]:\s*/;

function speakerOf(line) {
  const voice = VOICE_TAG.exec(line);
  if (voice) return voice[1].trim();
  return DIARIZED_PREFIX.exec(line)?.[1] ?? null;
}

function cleanLine(line) {
  return decodeEntities(line.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

export function parseVtt(vtt, { auto = false } = {}) {
  const cues = [];
  let previous = '';
  for (const block of vtt.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n');
    const timingAt = lines.findIndex((line) => line.includes('-->'));
    const start = timingAt < 0 ? null : cueStart(lines[timingAt]);
    if (start === null) continue;
    let speaker = null;
    for (const raw of lines.slice(timingAt + 1)) {
      speaker = speakerOf(raw) ?? speaker;
      const line = cleanLine(raw.replace(DIARIZED_PREFIX, ''));
      if (line === '' || (auto && line === previous)) continue;
      cues.push(speaker ? { start, text: line, speaker } : { start, text: line });
      previous = line;
    }
  }
  return cues;
}

function cuesOf(xml, { pattern, start, perSecond }, auto) {
  const cues = [];
  let previous = '';
  for (const [, attributes, inner] of xml.matchAll(pattern)) {
    const begin = start.exec(attributes);
    const text = decodeEntities(cleanLine(inner));
    if (!begin || text === '' || (auto && text === previous)) continue;
    cues.push({ start: Number(begin[1]) / perSecond, text });
    previous = text;
  }
  return cues;
}

export function parseTimedText(xml, { auto = false } = {}) {
  for (const format of TIMED_TEXT_FORMATS) {
    const cues = cuesOf(xml, format, auto);
    if (cues.length > 0) return cues;
  }
  return [];
}
