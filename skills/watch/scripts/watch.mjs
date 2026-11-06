import fs from 'node:fs';
import path from 'node:path';
import { transcribe } from './speech.mjs';
import { parseVtt } from './cues.mjs';
import { writeOutputs, headOf } from './outputs.mjs';
import { runYtDlpWithRuntime, ytDlpReason, ytDlpAvailable, ytDlpNeed } from './ytdlp.mjs';
import { pickCaptions, availableLanguages, chaptersOf, folderOf } from './ytdlp-info.mjs';
import { sourceOf } from './video-url.mjs';
import { withKeyframes } from './keyframes.mjs';
import { chaptersFromHtml } from './youtube-chapters.mjs';
import { Unreadable, WATCH_URL, fetchPlayer, fetchWatchPage, checkPlayable, tracksOf, defaultLanguage, pickTrack, languagesOf, readCaptions } from './youtube.mjs';

function languageFailure(id, lang, available) {
  return { failure: `${id}: no captions in language '${lang}'; available: ${available.join(', ')}. Rerun with --lang <code> set to one of them.` };
}

function noTranscript(id, reason) {
  return { failure: `${id}: no transcript: ${reason}` };
}

function missingTool(id, reason) {
  return { failure: `${id}: missing tool: ${reason}` };
}

async function watchBySpeech({ label, url, dir, head, details, why }, options) {
  const speech = await transcribe(url, dir, { ...options, runYtDlp: runYtDlpWithRuntime, ytDlpReason, ytDlpNeed });
  const lead = why ? `${why}; ` : '';
  if (speech.missing) return missingTool(label, `${lead}the video has no captions, and transcribing its audio needs ${speech.missing}, then rerun`);
  if (speech.failure) return noTranscript(label, `${lead}the video has no captions, and ${speech.failure}`);
  const cues = parseVtt(fs.readFileSync(speech.vtt, 'utf8'));
  const duration = details.duration > 0 ? details.duration : Math.ceil(cues.at(-1)?.start ?? 0);
  const chapters = details.chapters(duration);
  return writeOutputs({ dir, cues, duration, chapters, head, captions: `speech:${speech.engine}` }, options);
}

async function watchDirect(id, options, fetchFn) {
  const [player, page] = await Promise.all([fetchPlayer(id, fetchFn, options), fetchWatchPage(id, fetchFn, options)]);
  checkPlayable(player);
  const tracks = tracksOf(player);
  const head = headOf(id, player.videoDetails?.title);
  const lengthSeconds = Number(player.videoDetails?.lengthSeconds);
  if (tracks.length === 0) {
    const details = { duration: lengthSeconds, chapters: (duration) => chaptersFromHtml(page, duration) };
    return watchBySpeech({ label: id, url: `${WATCH_URL}${id}`, dir: path.join(options.out, id), head, details }, options);
  }
  const track = pickTrack(tracks, options.lang, defaultLanguage(player));
  if (!track) return languageFailure(id, options.lang, languagesOf(tracks));
  const { xml, cues } = await readCaptions(track, fetchFn, options);
  const duration = lengthSeconds > 0 ? lengthSeconds : Math.ceil(cues.at(-1).start);
  const dir = path.join(options.out, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'raw.xml'), xml);
  const captions = `${track.auto ? 'auto' : 'manual'}:${track.code}`;
  return writeOutputs({ dir, cues, duration, chapters: chaptersFromHtml(page, duration), head, captions }, options);
}

function ytDlpFailure(why, reason) {
  return why ? `${why}; yt-dlp failed too: ${reason}` : `yt-dlp failed: ${reason}`;
}

async function watchWithYtDlp({ id, url }, options, why) {
  const label = id ?? url;
  const meta = await runYtDlpWithRuntime(['-J', '--write-subs', '--write-auto-subs', '--no-playlist', '--no-warnings', '--', url], options.ytDlpMs);
  if (meta.error) return noTranscript(label, ytDlpFailure(why, ytDlpReason(meta, options)));
  const answer = JSON.parse(meta.stdout);
  const info = answer._type === 'playlist' ? answer.entries[0] : answer;
  if (!info) return noTranscript(label, ytDlpFailure(why, 'it found no video'));
  const folder = id ?? folderOf(info);
  const picked = pickCaptions(info, options.lang);
  const available = availableLanguages(info);
  if (!picked && options.lang && available.length > 0) return languageFailure(folder, options.lang, available);
  const dir = path.join(options.out, folder);
  if (!picked) {
    const details = { duration: info.duration, chapters: () => chaptersOf(info) };
    return watchBySpeech({ label: folder, url, dir, head: headOf(folder, info.title), details, why }, options);
  }
  fs.mkdirSync(dir, { recursive: true });
  const flag = picked.source === 'manual' ? '--write-subs' : '--write-auto-subs';
  const download = await runYtDlpWithRuntime(['--skip-download', flag, '--sub-langs', picked.key, '--sub-format', 'vtt', '--no-warnings', '--no-playlist', '--playlist-items', '1', '-P', dir, '-o', '%(id)s.%(ext)s', '--', url], options.ytDlpMs);
  const vttName = fs.readdirSync(dir).find((name) => name.startsWith(`${info.id}.`) && name.endsWith('.vtt'));
  if (!vttName) return noTranscript(folder, `${why ? `${why}; ` : ''}yt-dlp wrote no ${picked.key} captions: ${ytDlpReason(download, options)}`);
  const raw = path.join(dir, 'raw.vtt');
  fs.renameSync(path.join(dir, vttName), raw);
  const cues = parseVtt(fs.readFileSync(raw, 'utf8'), { auto: picked.source === 'auto' });
  const duration = info.duration ?? Math.ceil(cues.at(-1)?.start ?? 0);
  return writeOutputs({ dir, cues, duration, chapters: chaptersOf(info), head: headOf(folder, info.title), captions: `${picked.source}:${picked.key}` }, options);
}

async function watchSite({ url, host }, options) {
  const need = await ytDlpNeed();
  if (need) return missingTool(url, `reading ${host} videos needs ${need}, then rerun`);
  return watchWithYtDlp({ url }, options);
}

async function watchSource(source, options, fetchFn) {
  if (!source.id) return watchSite(source, options);
  const { id } = source;
  try {
    return await watchDirect(id, options, fetchFn);
  } catch (error) {
    if (!(error instanceof Unreadable)) throw error;
    if (!error.retryable || !(await ytDlpAvailable(options.ytDlpMs))) return noTranscript(id, error.message);
    return watchWithYtDlp({ id, url: `${WATCH_URL}${id}` }, options, error.message);
  }
}

export async function watchOne(input, options, fetchFn = globalThis.fetch) {
  const source = sourceOf(input);
  if (!source) return { failure: `${input}: not a video url or an 11-character YouTube id` };
  const result = await watchSource(source, options, fetchFn);
  return withKeyframes(result, source.id ? `${WATCH_URL}${source.id}` : source.url, options);
}

export function watchGuarded(input, options, fetchFn = globalThis.fetch) {
  return Promise.resolve().then(() => watchOne(input, options, fetchFn)).catch((error) => ({ failure: `${input}: ${error.message}` }));
}
