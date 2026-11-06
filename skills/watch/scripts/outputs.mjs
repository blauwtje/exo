import fs from 'node:fs';
import path from 'node:path';
import { HOUR, linkedStamp, timeLinkOf, formatDuration, renderTranscript, countWords } from './format.mjs';
import { planChunks } from './chunks.mjs';

const TOKENS_PER_WORD = 1.3;
const NON_SPEECH = /\[[^\]]*\]|\([^)]*\)|♪[^♪]*♪|[♪♫]/g;
const NO_SPEECH = 'no speech in this video\n';

function spokenText(text) {
  return text.replace(NON_SPEECH, ' ').replace(/\s+/g, ' ').trim();
}

function spokenCues(cues, duration) {
  const inside = duration > 0 ? cues.filter((cue) => cue.start <= duration) : cues;
  return inside.map((cue) => ({ ...cue, text: spokenText(cue.text) })).filter((cue) => cue.text !== '');
}

function writeChunks(dir, cues, { duration, chapters, withHours, link }, options) {
  const chunks = planChunks(duration, chapters, options.chunkMinutes * 60);
  const folder = path.join(dir, 'chunks');
  fs.mkdirSync(folder, { recursive: true });
  chunks.forEach((chunk, index) => {
    const last = index === chunks.length - 1;
    const inside = cues.filter((cue) => cue.start >= chunk.start && (last || cue.start < chunk.end));
    const named = chapters.filter((chapter) => chapter.end > chunk.start && (last || chapter.start < chunk.end));
    const header = `# ${chunk.title} ${linkedStamp(chunk.start, withHours, link)}-${linkedStamp(chunk.end, withHours, link)}\n\n`;
    const body = renderTranscript(inside, { chapters: named, stampSeconds: options.stampSeconds, withHours, link });
    fs.writeFileSync(path.join(folder, `${String(index + 1).padStart(2, '0')}.txt`), header + body);
  });
  return { folder, count: chunks.length };
}

function summaryLine(fields) {
  return Object.entries(fields).map(([key, value]) => `${key}=${value}`).join(' ');
}

export function writeOutputs({ dir, cues: heard, duration, chapters, head, captions }, options) {
  const cues = spokenCues(heard, duration);
  const withHours = duration >= HOUR || (cues.at(-1)?.start ?? 0) >= HOUR;
  const link = timeLinkOf(head.id);
  const transcript = path.join(dir, 'transcript.txt');
  fs.writeFileSync(transcript, cues.length === 0 ? NO_SPEECH : renderTranscript(cues, { chapters, stampSeconds: options.stampSeconds, withHours, link }));
  const words = countWords(cues);
  const fields = { ...head, duration: formatDuration(duration), captions, words, tokens: Math.round(words * TOKENS_PER_WORD), transcript };
  if (duration > options.chunkMinutes * 120) {
    const chunks = writeChunks(dir, cues, { duration, chapters, withHours, link }, options);
    fields.chunks = `${chunks.folder} (${chunks.count} files)`;
  }
  return { line: summaryLine(fields), transcript, words, duration, dir };
}

export function headOf(id, title) {
  return { id, title: JSON.stringify(String(title ?? '').replace(/\s+/g, ' ').trim()) };
}
