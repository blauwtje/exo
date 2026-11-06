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

const YOUTUBE_ID = /^(?:youtube-)?([\w-]{11})$/;
const VIMEO_ID = /^vimeo-(\d+)$/;

export function timeLinkOf(id) {
  const youtube = YOUTUBE_ID.exec(String(id));
  if (youtube) return (seconds) => `https://www.youtube.com/watch?v=${youtube[1]}&t=${Math.floor(seconds)}s`;
  const vimeo = VIMEO_ID.exec(String(id));
  if (vimeo) return (seconds) => `https://vimeo.com/${vimeo[1]}#t=${Math.floor(seconds)}s`;
  return null;
}

export function linkedStamp(seconds, withHours, link) {
  const stamp = formatStamp(seconds, withHours);
  return link ? `${stamp}(${link(seconds)})` : stamp;
}

export function formatDuration(seconds) {
  return formatStamp(seconds, true).slice(1, -1);
}

export function renderTranscript(cues, { chapters = [], stampSeconds = DEFAULTS.stampSeconds, withHours = false, link = null } = {}) {
  const output = [];
  let nextStamp = 0;
  let paragraph = null;
  let chapterAt = 0;
  let speaker = null;
  const flush = () => {
    if (paragraph) output.push(paragraph.join(' '));
    paragraph = null;
  };
  for (const cue of cues) {
    while (chapterAt < chapters.length && chapters[chapterAt].start <= cue.start) {
      flush();
      output.push(`## ${chapters[chapterAt].title}`);
      nextStamp = 0;
      speaker = null;
      chapterAt += 1;
    }
    const turn = cue.speaker && cue.speaker !== speaker;
    if (!paragraph || cue.start >= nextStamp || turn) {
      flush();
      paragraph = [linkedStamp(cue.start, withHours, link)];
      nextStamp = cue.start + stampSeconds;
    }
    if (turn) {
      paragraph.push(`${cue.speaker} (guessed):`);
      speaker = cue.speaker;
    }
    paragraph.push(cue.text);
  }
  flush();
  return `${output.join('\n\n')}\n`;
}

export function countWords(cues) {
  return cues.reduce((total, cue) => total + cue.text.split(' ').length, 0);
}
