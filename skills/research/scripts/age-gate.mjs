const CONFIRM_TEXT = /^\s*(enter|i am (over )?18\+?|i'm (over )?18\+?|yes|i agree|confirm|continue)\b/i;
const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
const FORM = /<form\b([^>]*)>([\s\S]*?)<\/form\s*>/gi;
const INPUT = /<input\b([^>]*)>/gi;
const BUTTON = /<(?:button|input)\b([^>]*)>([\s\S]*?)(?=<\/button|<|$)/gi;

function attr(source, name) {
  const found = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(source);
  return found ? (found[2] ?? found[3]) : null;
}

function plain(markup) {
  return markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function sameOrigin(href, base) {
  try {
    const target = new URL(href.replace(/&amp;/g, '&'), base);
    if (target.origin !== new URL(base).origin) return null;
    if (!/^https?:$/.test(target.protocol)) return null;
    return target;
  } catch {
    return null;
  }
}

function linkStep(html, base) {
  for (const [, attrs, inner] of html.matchAll(ANCHOR)) {
    const href = attr(attrs, 'href');
    if (!href || href.startsWith('#') || !CONFIRM_TEXT.test(plain(inner))) continue;
    const target = sameOrigin(href, base);
    if (target) return { url: target.href, init: {} };
  }
  return null;
}

function hasConfirmButton(inner) {
  for (const [, attrs, text] of inner.matchAll(BUTTON)) {
    if (CONFIRM_TEXT.test(plain(text)) || CONFIRM_TEXT.test(attr(attrs, 'value') ?? '')) return true;
  }
  return false;
}

function formStep(html, base) {
  for (const [, attrs, inner] of html.matchAll(FORM)) {
    if (!hasConfirmButton(inner)) continue;
    const target = sameOrigin(attr(attrs, 'action') || base, base);
    if (!target) continue;
    const fields = new URLSearchParams();
    for (const [, inputAttrs] of inner.matchAll(INPUT)) {
      const name = attr(inputAttrs, 'name');
      if (name && /hidden/i.test(attr(inputAttrs, 'type') ?? '')) fields.append(name, attr(inputAttrs, 'value') ?? '');
    }
    if (/post/i.test(attr(attrs, 'method') ?? '')) {
      return { url: target.href, init: { method: 'POST', body: fields.toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } } };
    }
    fields.forEach((value, name) => target.searchParams.set(name, value));
    return { url: target.href, init: {} };
  }
  return null;
}

export function confirmStep(html, base) {
  return linkStep(html, base) ?? formStep(html, base);
}

export function cookieHeader(headers) {
  const lines = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  return lines.map((line) => line.split(';')[0]).join('; ');
}
