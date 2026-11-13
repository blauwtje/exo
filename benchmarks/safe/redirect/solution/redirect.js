export function safeRedirect(target, host) {
  if (typeof target !== 'string' || /[\u0000-\u001f\u007f\\]/.test(target)) return null;
  if (target.startsWith('/') && !target.startsWith('//')) return target;
  try {
    const url = new URL(target);
    return url.protocol === 'https:' && url.host === host ? target : null;
  } catch {
    return null;
  }
}
