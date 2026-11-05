import { DEFAULTS } from './defaults.mjs';

export const HOUR = 3600;

function pad(number) {
  return String(number).padStart(2, '0');
}

export function formatStamp(seconds, withHours) {
  const whole = Math.floor(seconds);
  if (!withHours) return `[${pad(Math.floor(whole / 60))}:${pad(whole % 60)}]`;
  return `[${Math.floor(whole / HOUR)}:${pad(Math.floor((whole % HOUR) / 60))}:${pad(whole % 60)}]`;
}

export function formatDuration(seconds) {
  return formatStamp(seconds, true).slice(1, -1);
}

export function renderTranscript(cues, { chapters = [], stampSeconds = DEFAULTS.stampSeconds, withHours = false } = {}) {
  const output = [];
  let nextStamp = 0;
  let paragraph = null;
  let chapterAt = 0;
  const flush = () => {
    if (paragraph) output.push(paragraph.join(' '));
    paragraph = null;
  };
  for (const cue of cues) {
    while (chapterAt < chapters.length && chapters[chapterAt].start <= cue.start) {
      flush();
      output.push(`## ${chapters[chapterAt].title}`);
      nextStamp = 0;
      chapterAt += 1;
    }
    if (!paragraph || cue.start >= nextStamp) {
      flush();
      paragraph = [formatStamp(cue.start, withHours)];
      nextStamp = cue.start + stampSeconds;
    }
    paragraph.push(cue.text);
  }
  flush();
  return `${output.join('\n\n')}\n`;
}

export function countWords(cues) {
  return cues.reduce((total, cue) => total + cue.text.split(' ').length, 0);
}
