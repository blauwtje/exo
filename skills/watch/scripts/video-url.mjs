const VIDEO_ID = /^[\w-]{11}$/;
export const YOUTUBE_HOST = /(^|\.)(youtube\.com|youtube-nocookie\.com)$/;
const ID_FOLDERS = new Set(['shorts', 'embed', 'live', 'v']);
const SCHEME = /^[a-z][a-z\d+.-]*:/i;

function hasScheme(text) {
  return SCHEME.test(text) && text.slice(text.indexOf(':')).startsWith('://');
}

export function urlOf(text) {
  try {
    return new URL(hasScheme(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
}

function idFromUrl(url) {
  if (url.hostname === 'youtu.be') return url.pathname.split('/')[1] ?? '';
  if (!YOUTUBE_HOST.test(url.hostname)) return '';
  const [folder, id] = url.pathname.split('/').filter(Boolean);
  return ID_FOLDERS.has(folder) ? id : url.searchParams.get('v') ?? '';
}

export function videoIdOf(input) {
  const text = String(input).trim();
  if (VIDEO_ID.test(text)) return text;
  const url = urlOf(text);
  const id = url ? idFromUrl(url) : '';
  return VIDEO_ID.test(id) ? id : null;
}

export function sourceOf(input) {
  const text = String(input).trim();
  const id = videoIdOf(text);
  if (id) return { id };
  const url = urlOf(text);
  if (!url || !/^https?:$/.test(url.protocol)) return null;
  if (!hasScheme(text) && (!url.hostname.includes('.') || url.username || url.password)) return null;
  if (YOUTUBE_HOST.test(url.hostname) || url.hostname === 'youtu.be') return null;
  return { url: url.href, host: url.hostname };
}
