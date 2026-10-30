const DURATION = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/;

export function parseDuration(text) {
  const match = String(text).match(DURATION);
  if (!match || match[0] === '') throw new TypeError(`not a duration: ${text}`);
  const [hours, minutes, seconds] = match.slice(1).map((part) => Number(part ?? 0));
  return hours * 3600 + minutes * 60 + seconds;
}
