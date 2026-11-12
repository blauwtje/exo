import { createHash } from 'node:crypto';

function usableKeys(tracks) {
  return Object.keys(tracks ?? {}).filter((key) => key !== 'live_chat' && tracks[key]?.length > 0);
}

export function availableLanguages(info) {
  return [...new Set([info.subtitles, info.automatic_captions].flatMap(usableKeys))];
}

function trackKey(tracks, wanted, preferOriginal = false) {
  const keys = usableKeys(tracks);
  if (keys.length === 0) return null;
  if (wanted) {
    const original = keys.find((key) => key === `${wanted}-orig`);
    return (preferOriginal ? original : undefined)
      ?? keys.find((key) => key === wanted)
      ?? original
      ?? keys.find((key) => key.startsWith(`${wanted}-`))
      ?? null;
  }
  return keys.find((key) => key.endsWith('-orig')) ?? keys.find((key) => key.startsWith('en')) ?? keys[0];
}

function chooseTrack(tracks, language, preferOriginal) {
  const base = language?.split('-')[0];
  return trackKey(tracks, language, preferOriginal)
    ?? (base && base !== language ? trackKey(tracks, base, preferOriginal) : null)
    ?? trackKey(tracks, null);
}

function originalAudioLanguage(info) {
  const original = (info.formats ?? []).find((format) => format.language && /\boriginal\b/i.test(format.format_note ?? ''));
  return original?.language ?? null;
}

export function pickCaptions(info, lang) {
  const wanted = lang ?? originalAudioLanguage(info) ?? info.language ?? null;
  const manual = lang ? trackKey(info.subtitles, lang) : chooseTrack(info.subtitles, wanted);
  if (manual) return { source: 'manual', key: manual };
  const auto = lang ? trackKey(info.automatic_captions, lang, true) : chooseTrack(info.automatic_captions, wanted, true);
  if (auto) return { source: 'auto', key: auto };
  return null;
}

export function chaptersOf(info) {
  return (info.chapters ?? []).map((chapter) => ({
    start: chapter.start_time,
    end: chapter.end_time,
    title: String(chapter.title ?? '').replace(/\s+/g, ' ').trim() || 'Chapter',
  }));
}

function idSuffix(id) {
  if (!/[A-Z]/.test(id)) return '';
  return `-${createHash('sha1').update(id).digest('hex').slice(0, 8)}`;
}

export function folderOf(info) {
  const name = `${info.extractor_key.toLowerCase()}-${info.id}`.replace(/[^\w-]/g, '-');
  return `${name}${idSuffix(info.id)}`;
}
