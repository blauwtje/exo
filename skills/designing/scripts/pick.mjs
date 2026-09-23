// Blocking live picker for the ui-design skill: every direction comp runs live
// in its own sandboxed frame, all frames whole at one shared scale inside a
// single viewport, and the script waits for one click and prints the choice.
// A comp in the grid takes the pointer, so its hover and motion run where it is
// compared; the Choose button under it is the answer. Enlarged, one comp fills
// the viewport with nothing around it, and a shim neutralises navigation so a
// click demonstrates without doing anything. The server binds a random
// localhost port behind a per-run key, so nothing else on the machine can read
// the comps or answer for the user. Nothing is written.
//
//   node scripts/pick.mjs --comps <dir> --contracts <contracts.json>
//                         [--labels <labels.json>] [--intrinsic]
//                         [--frame <width>x<height>, default 1280x800]
//                         [--recommend <n>] [--recommend-note <one sentence>]
//                         [--timeout <seconds, default 600>] [--no-open]
//
// --contracts decides the seats: contracts[i] is variant i, and --comps holds
// one directory per variant, named variant-0, variant-1, and so on, each
// carrying an index.html plus its own assets. The script waits until every
// seat's index.html exists and only then prints the URL and opens the tab, so
// the chooser never looks at an empty card. A variant sets its own frame size
// in an optional meta.json ({"width":<n>,"height":<n>}), which --intrinsic
// honours so a size comparison keeps its size differences at one shared scale.
// stdout carries one line, {"index","label","steer"}, on exit 0. Exit 2 is a
// usage error; exit 3 means no browser, comps that never all landed, or no
// answer, and the --recommend variant is then the selection.
//
// A comp file opening with <!doctype or <html is served as it stands. Anything
// else is a fragment, and the server wraps it in the document shell, so a comp
// carries its own markup and its own CSS and nothing every comp would repeat.
// That shell is structural only, never a font, a colour or a spacing scale: a
// shared visual theme across comps would destroy the comparison this picker
// exists for.
//
// --labels carries the screen's own copy, written by the skill in the language
// the conversation runs in: an object with any of title, hint, recommended,
// fallbackTitle, choose, zoom, close, typeRole, steer, done, failed, plus lang,
// the language tag that copy is written in. Only fallbackTitle keeps a {n}
// placeholder, which stands for the seat's letter. Whatever it omits falls back
// to its English string in assets/pick-labels.json. --recommend seats that variant first and badges
// it, and --recommend-note puts one plain sentence of reasoning inside that
// card.

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createReadStream, readFileSync, realpathSync } from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { CHROME_TOKENS, escapeHtml } from '#page-chrome';
import { CapabilityError, parseFlags, parseViewport, readJsonFlag, UsageError } from './capture.mjs';

const DEFAULT_TIMEOUT_SECONDS = 600;
// A three-up comparison is width-bound, so the frame decides how large the
// comp's own content lands on screen: at 1280 it reads where 1440 did not,
// and it is still a real desktop viewport rather than a flattering one.
const DEFAULT_FRAME = { width: 1280, height: 800 };

// The last resort, reached only for a key the --labels file leaves out. A flag
// cannot know what language the session runs in, so this script ships no
// vocabulary to pick from: the skill writes the screen's copy in the
// conversation's own language on every run, and one English string per key is
// what keeps the picker usable when a key is missing. {n} is a variant's
// position.
const DEFAULT_LABELS = JSON.parse(readFileSync(new URL('../assets/pick-labels.json', import.meta.url), 'utf8'));

// The one label that carries a variant's seat mark; dropping {n} would leave a
// tile headed 'Option .' with no way to tell which of three it is.
const NUMBERED_LABELS = ['fallbackTitle'];
// lang is the document's language attribute rather than copy: a screen reader
// announcing Dutch words as English is unusable, so the file carrying the words
// also names which language they are. It lands in an HTML attribute, so its
// shape is checked instead of escaped.
const LANGUAGE_TAG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

// A seat is marked by its letter, so a chooser says 'B' rather than counting.
// Past Z there is no letter left, and a picker that far along has bigger
// problems than its marks; the number keeps it correct rather than clever.
const seatMark = (seat) => (seat < 26 ? String.fromCharCode(65 + seat) : String(seat + 1));

const fillPosition = (template, mark) => template.replaceAll('{n}', mark);

const MEDIA_TYPES = new Map(Object.entries({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8'
}));

// Injected into every served comp document. The frame is sandboxed without
// allow-forms, allow-popups, or allow-top-navigation, so this covers the one
// gap that leaves: a same-frame link would replace the comp being compared. It
// also hands the picker the keys that close and step the enlarged view, which
// stop reaching the picker once a click has put focus inside the comp.
const DEMO_SHIM = `<script>
(() => {
  const swallow = (event) => {
    const anchor = event.target.closest?.('a[href]');
    if (anchor && !anchor.getAttribute('href').startsWith('#')) event.preventDefault();
  };
  addEventListener('click', swallow, true);
  addEventListener('submit', (event) => event.preventDefault(), true);
  window.open = () => null;

  const PICKER_KEYS = ['Escape', 'ArrowLeft', 'ArrowRight'];
  addEventListener('keydown', (event) => {
    if (!PICKER_KEYS.includes(event.key)) return;
    if (event.target.closest?.('input, textarea, select, [contenteditable]')) return;
    parent.postMessage({ uiDesignKey: event.key }, '*');
  });
})();
</script>`;

// The shell a fragment is served inside. Every declaration here removes a user
// agent's opinion rather than adding one of this script's: no family, no size,
// no colour, no spacing, because the ground, the type, the palette and the
// technique are the direction and they live in the comp. Controls inherit so
// the comp's own type reaches its buttons and fields, which the user agent
// otherwise overrides with a system face the direction never chose.
const COMP_RESET = '*,*::before,*::after{box-sizing:border-box}'
  + 'html,body{margin:0;padding:0;width:100%;min-height:100%}'
  + 'img,svg,video,canvas{display:block;max-width:100%}'
  + 'button,input,select,textarea{font:inherit;color:inherit}';

// A comp that wrote its own <head> owns the whole document and keeps it; the
// shim is appended either way, because the picker neutralises navigation and
// forwards its keys from inside the frame in both cases.
const OPENS_ITS_OWN_DOCUMENT = /^\s*<(?:!doctype|html)\b/i;

export function compDocument(markup, lang, shim = DEMO_SHIM) {
  if (OPENS_ITS_OWN_DOCUMENT.test(markup)) {
    return markup.includes('</body>')
      ? markup.replace('</body>', `${shim}\n</body>`)
      : `${markup}\n${shim}`;
  }
  return `<!doctype html>
<html lang="${escapeHtml(lang)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${COMP_RESET}</style>
</head><body>
${markup}
${shim}
</body></html>`;
}

export function requireTimeout(text) {
  if (text === undefined) return DEFAULT_TIMEOUT_SECONDS;
  const seconds = Number(text);
  if (!Number.isInteger(seconds) || seconds < 1) {
    throw new UsageError(`--timeout must be a whole number of seconds from 1, received '${text}'`);
  }
  return seconds;
}

function requireFrame(text) {
  if (text === undefined) return DEFAULT_FRAME;
  try {
    return parseViewport(text);
  } catch {
    throw new UsageError(`--frame must be <width>x<height>, received '${text}'`);
  }
}

// The recommended variant is dealt the first seat, so the badge on the leading
// tile is the whole statement and no sentence of chrome has to name a number.
// The tiles stay identical in size and treatment, so the seat is the only
// steer, and the chooser can still disagree with one click on any other.
function requireRecommendation(text, count) {
  if (text === undefined) return null;
  const index = Number(text);
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    throw new UsageError(`--recommend must be a variant index from 0 to ${count - 1}, received '${text}'`);
  }
  return index;
}

function requireRecommendationNote(text, recommended) {
  if (text === undefined) return null;
  if (recommended === null) {
    throw new UsageError('--recommend-note needs --recommend, because it explains that pick');
  }
  if (typeof text !== 'string' || text.trim() === '') {
    throw new UsageError('--recommend-note must be a non-empty sentence');
  }
  return text.trim();
}

// CI, a display-less SSH session, or a display-less Linux box cannot show a
// tab. --no-open skips the check because the caller then opens the URL itself.
export function headlessReason() {
  if (process.env.CI) return 'CI is set';
  if (process.env.SSH_CONNECTION && !process.env.DISPLAY) return 'SSH session without DISPLAY';
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    return 'no DISPLAY or WAYLAND_DISPLAY';
  }
  return null;
}

export function openSystemBrowser(url) {
  const command = process.platform === 'darwin' ? { file: 'open', args: [url] }
    : process.platform === 'win32' ? { file: process.env.ComSpec ?? 'cmd.exe', args: ['/c', 'start', '', url] }
      : { file: 'xdg-open', args: [url] };
  try {
    const child = spawn(command.file, command.args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    // The URL is already on stderr, so the user can open it by hand.
  }
}

/** A variant's own frame size, used only under --intrinsic; the shared --frame
 *  wins otherwise, so a direction comparison stays a like-for-like one. */
async function readFrame(directory, fallback) {
  let text;
  try {
    text = await fs.readFile(path.join(directory, 'meta.json'), 'utf8');
  } catch {
    return fallback;
  }
  let meta;
  try {
    meta = JSON.parse(text);
  } catch {
    throw new UsageError(`'${directory}/meta.json' is not valid JSON`);
  }
  const width = meta?.width ?? fallback.width;
  const height = meta?.height ?? fallback.height;
  if (!Number.isInteger(width) || width < 200 || !Number.isInteger(height) || height < 200) {
    throw new UsageError(`'${directory}/meta.json' needs whole width and height from 200`);
  }
  return { width, height };
}

// A CSS value written by the skill lands in a style attribute. Escaping keeps it
// inside the quotes; these characters are what would let it add declarations or
// fetch something once it is in there.
const CSS_VALUE_BREAKERS = /[;{}<>\\]|url\s*\(/i;

function requireCssValue(value, where) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new UsageError(`${where} must be a non-empty string`);
  }
  if (CSS_VALUE_BREAKERS.test(value)) {
    throw new UsageError(`${where} may not hold ; { } < > \\ or url(`);
  }
  return value.trim();
}

/** The one-glance material summary under a comp: the display face set in
 *  itself, and what each colour is for. Every part is optional, so a contract
 *  written before this existed still renders a tile. */
function readSignature(contract, index) {
  const written = contract?.signature;
  if (written === undefined || written === null) return null;
  if (typeof written !== 'object' || Array.isArray(written)) {
    throw new UsageError(`contract ${index} has a signature that is not an object`);
  }
  const where = `contract ${index} signature`;

  // The name is the contract's own type.display.family, never a second copy in
  // the signature: two places to write a typeface is two places to get it wrong.
  const faceName = contract.type?.display?.family;
  const face = written.typeface === undefined
    ? null
    : { name: typeof faceName === 'string' ? faceName : null, stack: requireCssValue(written.typeface, `${where}.typeface`) };

  let fontHref = null;
  if (written.fontHref !== undefined) {
    if (typeof written.fontHref !== 'string' || !written.fontHref.startsWith('https://')) {
      throw new UsageError(`${where}.fontHref must be an https URL`);
    }
    fontHref = written.fontHref;
  }

  const colors = written.colors ?? [];
  if (!Array.isArray(colors)) throw new UsageError(`${where}.colors must be an array`);
  // Four is where a legend stops being a glance and starts being a table.
  if (colors.length > 4) throw new UsageError(`${where}.colors holds ${colors.length} entries, at most 4 fit`);
  const swatches = colors.map((entry, position) => {
    const at = `${where}.colors[${position}]`;
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new UsageError(`${at} must be an object with role and value`);
    }
    if (typeof entry.role !== 'string' || entry.role.trim() === '') {
      throw new UsageError(`${at}.role must be a non-empty string`);
    }
    if (entry.name !== undefined && (typeof entry.name !== 'string' || entry.name.trim() === '')) {
      throw new UsageError(`${at}.name must be a non-empty string when it is given`);
    }
    const value = requireCssValue(entry.value, `${at}.value`);
    return {
      role: entry.role.trim(),
      name: entry.name?.trim() ?? '',
      value,
      // A hex is read letter by letter, so one case throughout beats whatever
      // the contract happened to be typed in.
      code: /^#[0-9a-f]{3,8}$/i.test(value) ? value.toUpperCase() : value
    };
  });

  if (!face && swatches.length === 0) return null;
  return { face, fontHref, swatches };
}

/** One seat per contract. Every seat starts on the shared frame; main swaps in
 *  each comp's own meta.json size under --intrinsic once every comp exists. */
export async function loadVariants(compsDirectory, contractsFile, { frame = DEFAULT_FRAME } = {}) {
  if (!compsDirectory) throw new UsageError('--comps is required');
  let root;
  try {
    // Canonical, because resolveAsset compares real paths: on macOS a comps
    // tree under /tmp or a temp dir resolves into /private, and a variant
    // directory that still carried the symlinked spelling would match nothing.
    root = realpathSync(compsDirectory);
  } catch {
    throw new UsageError(`--comps directory '${compsDirectory}' cannot be read`);
  }

  const container = await readJsonFlag(contractsFile, '--contracts');
  if (!Array.isArray(container?.contracts)) throw new UsageError('--contracts file carries no contracts array');
  if (container.contracts.length === 0) throw new UsageError('--contracts file carries no contracts');

  const variants = [];
  for (const [index, contract] of container.contracts.entries()) {
    const label = `variant-${index}`;
    variants.push({
      index,
      label,
      directory: path.join(root, label),
      ready: false,
      frame,
      contract,
      signature: readSignature(contract, index)
    });
  }
  return variants;
}

/** True once the seat's own index.html exists. The realpath is taken here and
 *  not at load time, because the directory a comp lands in did not exist when
 *  the run started and resolveAsset compares real paths. */
async function seatReady(variant) {
  if (variant.ready) return true;
  if (!(await fs.stat(path.join(variant.directory, 'index.html')).catch(() => null))?.isFile()) return false;
  try {
    variant.directory = realpathSync(variant.directory);
  } catch {
    return false;
  }
  variant.ready = true;
  return true;
}

// How often the comps directory is checked while the session is still writing.
const COMP_POLL_MS = 250;

/** Resolves once every seat's index.html exists. The tab opens only after
 *  this, because a card that fills in later makes the chooser wait twice. */
async function waitForEveryComp(variants, deadline, timeoutSeconds) {
  for (;;) {
    const readiness = await Promise.all(variants.map(seatReady));
    if (readiness.every(Boolean)) return;
    if (Date.now() >= deadline) {
      throw new CapabilityError(`ui-design: not every comp landed within ${timeoutSeconds}s; the recommended variant stands`);
    }
    await new Promise((resolve) => { setTimeout(resolve, COMP_POLL_MS); });
  }
}

/** The chooser's own copy, written by the skill in the language the
 *  conversation runs in. Every key is optional: what the file leaves out falls
 *  back to English, so a partial file still yields a screen with no blanks.
 *  `defaults` names the keys a screen knows; the sketch tab passes its own. */
export async function readLabels(labelsFile, defaults = DEFAULT_LABELS) {
  if (labelsFile === undefined) return defaults;
  const written = await readJsonFlag(labelsFile, '--labels');
  if (written === null || typeof written !== 'object' || Array.isArray(written)) {
    throw new UsageError('--labels file must hold an object of label keys');
  }
  const labelKeys = Object.keys(defaults);
  const words = { ...defaults };
  for (const [name, value] of Object.entries(written)) {
    if (!labelKeys.includes(name)) {
      throw new UsageError(`--labels holds unknown key '${name}', expected one of ${labelKeys.join(', ')}`);
    }
    if (typeof value !== 'string' || value.trim() === '') {
      throw new UsageError(`--labels key '${name}' must be a non-empty string`);
    }
    if (name === 'lang' && !LANGUAGE_TAG.test(value)) {
      throw new UsageError(`--labels key 'lang' must be a language tag such as nl or pt-BR, received '${value}'`);
    }
    if (NUMBERED_LABELS.includes(name) && !value.includes('{n}')) {
      throw new UsageError(`--labels key '${name}' must keep the {n} placeholder for the variant number`);
    }
    words[name] = value;
  }
  return words;
}

// The chrome lives in `#page-chrome`; the sketch tab reads it here, beside the
// other picker parts it imports.
export { CHROME_TOKENS, escapeHtml };

function page(variants, key, { words, recommended, recommendedNote }) {
  // The recommendation is expressed as the first seat rather than as a sentence
  // of chrome above the comps. Every data-* attribute keeps carrying the real
  // variant index, so a reordered screen still answers with the index the comps
  // directory and the caller agreed on.
  const seated = recommended === null
    ? variants
    : [variants[recommended], ...variants.filter((variant) => variant.index !== recommended)];

  // The material as a row of chips in the caption: the face set in itself, then
  // one chip per colour. A caption line has no room to print the words, so they
  // stay in the markup for a screen reader and in the tooltip for a pointer.
  const signature = (written) => {
    if (!written) return '';
    const faceName = written.face?.name ?? '';
    const face = written.face
      ? `<li class="face" style="--face:${escapeHtml(written.face.stack)}" title="${escapeHtml(`${words.typeRole}: ${faceName}`)}"><span class="face-sample" aria-hidden="true">Aa</span><span class="words"><span class="role">${escapeHtml(words.typeRole)}</span> <span class="tone">${escapeHtml(faceName)}</span></span></li>`
      : '';
    const swatches = written.swatches.map((swatch) => {
      const tooltip = [swatch.role, swatch.name, swatch.code].filter(Boolean).join(' · ');
      return `<li style="--swatch:${escapeHtml(swatch.value)}" title="${escapeHtml(tooltip)}"><span class="chip" aria-hidden="true"></span><span class="words"><span class="role">${escapeHtml(swatch.role)}</span> <span class="tone">${escapeHtml(swatch.name)}</span> <code>${escapeHtml(swatch.code)}</code></span></li>`;
    }).join('');
    return `<ul class="signature">${face}${swatches}</ul>`;
  };

  // What a chooser reads is the contract's own title and description, written by
  // the skill in the words of the subject. The dealt axis ids stay out of the
  // tile: they name the machinery, not the direction.
  const tile = (variant, seat) => {
    const mark = seatMark(seat);
    const title = variant.contract?.title ?? fillPosition(words.fallbackTitle, mark);
    const description = variant.contract?.description ?? '';
    const isPick = variant.index === recommended;
    const source = `/k/${key}/v/${variant.index}/index.html`;
    return `<section class="tile${isPick ? ' recommended' : ''}" style="--fw:${variant.frame.width};--fh:${variant.frame.height}" data-index="${variant.index}" data-source="${source}">
    <div class="stage"><iframe sandbox="allow-scripts" loading="eager" title="${escapeHtml(title)}" src="${source}"></iframe></div>
    <div class="caption">
      <div class="naming">
        <h2><span class="ordinal">${mark}</span><span class="label" title="${escapeHtml(title)}">${escapeHtml(title)}</span>${isPick ? `<span class="badge">${escapeHtml(words.recommended)}</span>` : ''}</h2>
        <p class="description" title="${escapeHtml(description)}">${escapeHtml(description)}</p>
      </div>
      ${signature(variant.signature)}
      <button type="button" class="enlarge" data-zoom="${variant.index}" aria-label="${escapeHtml(`${words.zoom}: ${title}`)}"><span aria-hidden="true">&#x2922;</span></button>
      <button type="button" class="choose" data-choose="${variant.index}" aria-label="${escapeHtml(`${words.choose}: ${title}`)}">${escapeHtml(words.choose)}</button>
    </div>
  </section>`;
  };

  // The comps load their own faces inside their frames, which the picker page
  // cannot borrow, so the sample needs the same stylesheet here. Deduplicated,
  // because three variants on one family would otherwise fetch it three times.
  const fontLinks = [...new Set(seated.map((variant) => variant.signature?.fontHref).filter(Boolean))]
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`).join('\n');

  const why = recommendedNote
    ? `<p class="why"><span class="why-mark" aria-hidden="true">&#9733;</span>${escapeHtml(recommendedNote)}</p>`
    : '';

  return `<!doctype html>
<html lang="${escapeHtml(words.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(words.title)}</title>
${fontLinks}
<style>
  @layer tokens, base, layout, components;
  @layer tokens {
    :root {
${CHROME_TOKENS}
      /* Black around an enlarged comp whose shape differs from the window's, so
         the letterbox reads as no part of any direction. */
      --letterbox: oklch(0 0 0);
      --radius-card: 12px;
      --gap: 12px;
      --pad: 12px;
      --k: 0.3;
      --cols: 1;
    }
  }
  @layer base {
    * { box-sizing: border-box; }
    html, body { block-size: 100%; overflow: hidden; }
    body {
      margin: 0; color: var(--ink); background: var(--ground);
      font: 14px/1.5 var(--font-stack);
      font-variant-numeric: tabular-nums;
      /* The header takes what its one line needs and the grid every pixel left,
         which is the room fit() solves the scale against. */
      display: grid; grid-template-rows: auto minmax(0, 1fr); row-gap: var(--gap);
      padding: var(--pad);
    }
    ::selection { background: var(--accent); color: var(--accent-ink); }
    :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .words {
      position: absolute; inline-size: 1px; block-size: 1px;
      overflow: hidden; clip-path: inset(50%); white-space: nowrap;
    }
  }
  @layer layout {
    header { display: flex; align-items: center; gap: 16px; min-block-size: 36px; }
    .heading { display: flex; align-items: baseline; flex-wrap: wrap; gap: 2px 12px; flex: 1; min-inline-size: 0; }
    h1 { font-size: 16px; font-weight: 650; letter-spacing: -0.01em; margin: 0; }
    .hint { margin: 0; color: var(--ink-muted); font-size: 13px; }
    .grid {
      display: grid; gap: var(--gap); min-block-size: 0;
      grid-template-columns: repeat(var(--cols), max-content);
      justify-content: center; align-content: center;
    }
    /* Hidden until every comp has loaded, so the cards arrive together instead
       of one by one. */
    .grid:not(.ready) { visibility: hidden; }
    .tile { inline-size: calc(var(--fw) * var(--k) * 1px + 2px); }
  }
  @layer components {
    /* The card is the comp plus one caption row and nothing else: no padding
       around the picture, so every pixel the scale earns goes to the comp. */
    .tile {
      display: grid; overflow: hidden;
      background: var(--surface);
      border: 1px solid var(--border); border-radius: var(--radius-card);
      transition: border-color 160ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease;
    }
    .tile:hover, .tile:focus-within { border-color: var(--accent); }
    .stage {
      inline-size: calc(var(--fw) * var(--k) * 1px);
      block-size: calc(var(--fh) * var(--k) * 1px);
      overflow: hidden; background: var(--ground);
    }
    /* Live at its own frame size and scaled whole, so the comp keeps the layout
       it was composed for and its hover and motion run under the pointer. */
    .stage iframe {
      display: block; border: 0;
      inline-size: calc(var(--fw) * 1px); block-size: calc(var(--fh) * 1px);
      transform: scale(var(--k)); transform-origin: top left;
    }
    .caption {
      display: flex; align-items: center; gap: 8px; min-inline-size: 0;
      padding: 6px 6px 6px 10px;
      border-block-start: 1px solid var(--border);
    }
    .naming { display: grid; flex: 1; min-inline-size: 0; }
    h2 {
      display: flex; align-items: center; gap: 6px; min-inline-size: 0;
      margin: 0; font-size: 14px; font-weight: 650; letter-spacing: -0.01em;
    }
    /* One line each, cut with an ellipsis and whole in the tooltip: a caption
       that wraps makes one card taller than the next. */
    .label, .description { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .description { margin: 0; color: var(--ink-muted); font-size: 12.5px; }
    .ordinal {
      display: grid; place-items: center; inline-size: 20px; block-size: 20px; flex: none;
      border-radius: 999px; background: var(--accent); color: var(--accent-ink);
      font-size: 11px; font-weight: 650;
    }
    /* Filled, not outlined: an outline anywhere on this card reads as a card
       already chosen, and the badge has to carry the recommendation alone. */
    .badge {
      flex: none; padding: 1px 7px; border-radius: 999px;
      font-size: 10.5px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase;
      background: var(--accent); color: var(--accent-ink);
    }
    .signature { display: flex; align-items: center; gap: 4px; flex: none; margin: 0; padding: 0; list-style: none; }
    .signature li { position: relative; display: grid; place-items: center; }
    .face-sample { font-family: var(--face); font-size: 16px; line-height: 1; padding-inline: 2px 4px; color: var(--ink); }
    .chip {
      inline-size: 16px; block-size: 16px; border-radius: 4px;
      background: var(--swatch);
      border: 1px solid oklch(from var(--ink) l c h / 0.28);
    }
    button {
      font: inherit; font-weight: 550; flex: none;
      min-block-size: 32px; min-inline-size: 32px; padding-inline: 12px;
      display: inline-flex; align-items: center; justify-content: center; white-space: nowrap;
      border: 1px solid var(--border-control); border-radius: var(--radius-control);
      background: var(--surface); color: var(--ink); cursor: pointer;
      transition: background-color 160ms cubic-bezier(0.16, 1, 0.3, 1),
                  border-color 160ms cubic-bezier(0.16, 1, 0.3, 1);
    }
    button:hover { border-color: var(--accent); }
    @media (pointer: coarse) { button { min-block-size: 44px; min-inline-size: 44px; } }
    .enlarge { padding-inline: 0; font-size: 15px; }
    .choose { background: var(--accent); color: var(--accent-ink); border-color: transparent; }
    .choose:hover { background: color-mix(in oklch, var(--accent) 88%, var(--ink)); }
    .why { display: flex; align-items: baseline; gap: 6px; margin: 0; font-size: 13px; }
    .why-mark { flex: none; color: var(--accent); }
    .steer { display: flex; align-items: center; gap: 8px; flex: 0 1 380px; color: var(--ink-muted); font-size: 13px; }
    .steer input {
      flex: 1; min-inline-size: 0; min-block-size: 32px; padding-inline: 10px;
      font: inherit; color: var(--ink); background: var(--surface);
      border: 1px solid var(--border-control); border-radius: var(--radius-control);
      caret-color: var(--accent);
    }
    .alert { margin: 0; font-size: 13px; font-weight: 600; }
    .alert[hidden] { display: none; }
    /* Between the click and the answer there is a network hop, and a screen that
       shows nothing for it reads as a click that missed. */
    .grid.deciding { pointer-events: none; }
    .grid.deciding .tile:not(.choosing) { opacity: 0.5; }
    .tile.choosing {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px color-mix(in oklch, var(--accent) 26%, transparent);
    }
    /* Enlarged is the comp and nothing else: the whole viewport, no margin, no
       bar, no rail. */
    dialog {
      position: fixed; inset: 0; margin: 0; padding: 0; border: 0;
      inline-size: 100vw; block-size: 100dvh; max-inline-size: none; max-block-size: none;
      background: var(--letterbox); overflow: hidden;
      display: none; opacity: 0;
      transition: opacity 180ms ease, display 200ms allow-discrete, overlay 200ms allow-discrete;
    }
    dialog[open] { display: grid; place-items: center; opacity: 1; }
    @starting-style { dialog[open] { opacity: 0; } }
    dialog::backdrop {
      background-color: var(--letterbox);
      transition: display 200ms allow-discrete, overlay 200ms allow-discrete;
    }
    .full-shell {
      inline-size: calc(var(--zfw) * var(--zk) * 1px);
      block-size: calc(var(--zfh) * var(--zk) * 1px);
      overflow: hidden;
    }
    .full-shell iframe {
      display: block; border: 0;
      inline-size: calc(var(--zfw) * 1px); block-size: calc(var(--zfh) * 1px);
      transform: scale(var(--zk)); transform-origin: top left;
    }
    /* Invisible until the pointer or the keyboard reaches it, so the comp fills
       the screen; it covers the comp's own top-right 44px, the one place a click
       there closes instead of demonstrating. */
    .full-close {
      position: fixed; inset-block-start: 8px; inset-inline-end: 8px; z-index: 1;
      min-inline-size: 44px; min-block-size: 44px; padding-inline: 0; font-size: 15px;
      opacity: 0; transition: opacity 140ms ease;
    }
    .full-close:hover, .full-close:focus-visible { opacity: 1; }
    /* The last thing the screen says. A tick, the name of what was picked, and
       one line: the chooser has already left, so it confirms rather than asks. */
    body.finished { grid-template-rows: 1fr; place-items: center; }
    .done {
      display: grid; justify-items: center; row-gap: 10px; text-align: center;
      padding: 30px 40px 32px; max-inline-size: 36ch;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-card);
      animation: settle 320ms cubic-bezier(0.16, 1, 0.3, 1) both;
    }
    .done-mark {
      inline-size: 42px; block-size: 42px; border-radius: 999px;
      display: grid; place-items: center; font-size: 21px; line-height: 1;
      background: var(--accent); color: var(--accent-ink);
    }
    .done h1 { font-size: 20px; }
    .done p { margin: 0; color: var(--ink-muted); font-size: 14px; text-wrap: pretty; }
    @keyframes settle { from { opacity: 0; scale: 0.97; translate: 0 6px; } }
    @media (prefers-reduced-motion: reduce) {
      button, .tile, .full-close { transition-duration: 1ms; }
      dialog, dialog::backdrop { transition-duration: 1ms; }
      .done { animation-duration: 1ms; }
    }
  }
</style></head>
<body>
<header>
  <div class="heading"><h1>${escapeHtml(words.title)}</h1><p class="hint">${escapeHtml(words.hint)}</p>${why}<p class="alert" id="alert" role="alert" hidden></p></div>
  <label class="steer"><span>${escapeHtml(words.steer)}</span><input id="steer" type="text" autocomplete="off"></label>
</header>
<div class="grid">
${seated.map(tile).join('\n')}
</div>
<dialog id="full" aria-label="${escapeHtml(words.zoom)}">
  <div class="full-shell" id="full-shell"><iframe id="full-frame" sandbox="allow-scripts" title="${escapeHtml(words.zoom)}"></iframe></div>
  <button type="button" class="full-close" id="full-close" aria-label="${escapeHtml(words.close)}"><span aria-hidden="true">&#10005;</span></button>
</dialog>
<script>
  const key = ${JSON.stringify(key)};
  const doneTemplate = ${JSON.stringify(words.done)};
  const failedTemplate = ${JSON.stringify(words.failed)};
  const grid = document.querySelector('.grid');
  const tiles = [...document.querySelectorAll('.tile')];
  // A tile's seat is where it sits on screen; its index is the variant it
  // serves. The two stop matching once the recommendation takes the first seat,
  // so anything the chooser aims at a position resolves through this.
  const seatOf = new Map(tiles.map((tile, seat) => [Number(tile.dataset.index), seat]));
  const frameWidths = tiles.map((tile) => parseFloat(tile.style.getPropertyValue('--fw')));
  const frameHeights = tiles.map((tile) => parseFloat(tile.style.getPropertyValue('--fh')));

  /** The largest shared scale at which every comp, whole, fits the room in that
   *  many columns. Each column is as wide as its widest frame and each row as
   *  tall as its tallest, so --intrinsic sizes do not over-reserve. Never past
   *  1: a comp blown up beyond the size it was drawn for is a third design. */
  function scaleFor(columns, room, captionHeight, gap) {
    const rows = Math.ceil(tiles.length / columns);
    let stageWidth = 0;
    for (let column = 0; column < columns; column += 1) {
      let widest = 0;
      for (let index = column; index < tiles.length; index += columns) widest = Math.max(widest, frameWidths[index]);
      stageWidth += widest;
    }
    let stageHeight = 0;
    for (let row = 0; row < rows; row += 1) {
      stageHeight += Math.max(...frameHeights.slice(row * columns, (row + 1) * columns));
    }
    // Each tile spends two pixels of border on either axis.
    const availableWidth = room.width - gap * (columns - 1) - 2 * columns;
    const availableHeight = room.height - gap * (rows - 1) - (captionHeight + 2) * rows;
    return Math.min(availableWidth / stageWidth, availableHeight / stageHeight, 1);
  }

  // The column count is searched rather than fixed at one row: in a 16:10
  // window three 16:10 comps in two rows are larger than three in a line.
  function fit() {
    const gap = parseFloat(getComputedStyle(grid).rowGap);
    const room = grid.getBoundingClientRect();
    const captionHeight = Math.max(...tiles.map((tile) => tile.querySelector('.caption').getBoundingClientRect().height));
    let best = { scale: 0, columns: tiles.length };
    for (let columns = 1; columns <= tiles.length; columns += 1) {
      const scale = scaleFor(columns, room, captionHeight, gap);
      if (scale > best.scale) best = { scale, columns };
    }
    document.documentElement.style.setProperty('--cols', String(best.columns));
    document.documentElement.style.setProperty('--k', String(best.scale));
  }
  fit();

  // The cards appear together once every comp has loaded, or after two seconds
  // for a comp still waiting on a remote face, so no card is seen empty beside
  // a neighbour that is already drawn.
  const REVEAL_CAP_MS = 2000;
  const loads = tiles.map((tile) => new Promise((resolve) => {
    tile.querySelector('iframe').addEventListener('load', resolve, { once: true });
  }));
  Promise.race([Promise.all(loads), new Promise((resolve) => { setTimeout(resolve, REVEAL_CAP_MS); })])
    .then(() => grid.classList.add('ready'));

  const dialog = document.getElementById('full');
  const fullFrame = document.getElementById('full-frame');
  const fullShell = document.getElementById('full-shell');
  // Which seat the enlarged view is showing, so an arrow key has somewhere to
  // step from and a closed view has nothing to step at all.
  let shownSeat = null;

  document.getElementById('full-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    fullFrame.removeAttribute('src');
    shownSeat = null;
  });
  // A click on the dialog itself landed on the letterbox, outside the comp.
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });

  /** The comp at its own frame size, scaled to fill the viewport along its
   *  tighter axis. A comp composed for the window's shape fills it edge to edge;
   *  any other shape is centred on the letterbox, never cropped or reflowed. */
  function fitFull() {
    if (!dialog.open) return;
    const frameWidth = parseFloat(fullShell.style.getPropertyValue('--zfw'));
    const frameHeight = parseFloat(fullShell.style.getPropertyValue('--zfh'));
    const scale = Math.min(innerWidth / frameWidth, innerHeight / frameHeight);
    fullShell.style.setProperty('--zk', String(scale));
  }
  addEventListener('resize', () => { fit(); fitFull(); });

  function enlarge(index) {
    const seat = seatOf.get(index);
    const tile = tiles[seat];
    shownSeat = seat;
    fullShell.style.setProperty('--zfw', tile.style.getPropertyValue('--fw'));
    fullShell.style.setProperty('--zfh', tile.style.getPropertyValue('--fh'));
    fullFrame.title = tile.querySelector('.label').textContent;
    dialog.dataset.index = String(index);
    fullFrame.src = tile.dataset.source;
    if (!dialog.open) dialog.showModal();
    fitFull();
  }

  /** The seat one step along the row, wrapping, so the last comp is one key
   *  from the first. */
  function stepSeat(step) {
    if (shownSeat === null) return;
    const count = tiles.length;
    const seat = ((shownSeat + step) % count + count) % count;
    enlarge(Number(tiles[seat].dataset.index));
  }

  // A click inside the enlarged comp moves focus into its frame, where the
  // page's own keys no longer arrive; the comp's shim forwards these three.
  addEventListener('message', (event) => {
    if (event.source !== fullFrame.contentWindow) return;
    const forwarded = event.data?.uiDesignKey;
    if (forwarded === 'Escape') dialog.close();
    if (forwarded === 'ArrowRight' || forwarded === 'ArrowLeft') stepSeat(forwarded === 'ArrowRight' ? 1 : -1);
  });

  async function choose(index) {
    const steer = document.getElementById('steer').value;
    const alert = document.getElementById('alert');
    alert.hidden = true;
    for (const each of document.querySelectorAll('button')) each.disabled = true;
    const chosen = tiles[seatOf.get(index)];
    chosen.classList.add('choosing');
    grid.classList.add('deciding');
    // The picker has a timeout and the tab outlives it, so a click can land on
    // a server that has already gone. Confirming a choice nobody received would
    // send the user away from the one place they can still answer.
    let delivered = false;
    try {
      delivered = (await fetch('/answer?key=' + encodeURIComponent(key), {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ index, steer })
      })).ok;
    } catch { delivered = false; }
    if (!delivered) {
      for (const each of document.querySelectorAll('button')) each.disabled = false;
      chosen.classList.remove('choosing');
      grid.classList.remove('deciding');
      if (dialog.open) dialog.close();
      alert.textContent = failedTemplate;
      alert.hidden = false;
      return;
    }
    // The panel replaces the page, and a modal still open when its own element
    // is removed leaves the backdrop painted over the answer.
    if (dialog.open) dialog.close();
    const panel = document.createElement('div');
    panel.className = 'done';
    const mark = document.createElement('div');
    mark.className = 'done-mark';
    mark.textContent = '✓';
    mark.setAttribute('aria-hidden', 'true');
    const heading = document.createElement('h1');
    heading.textContent = chosen.querySelector('.label').textContent;
    const note = document.createElement('p');
    note.textContent = doneTemplate;
    panel.append(mark, heading, note);
    document.body.className = 'finished';
    document.body.replaceChildren(panel);
  }

  document.addEventListener('click', (event) => {
    const chooser = event.target.closest('button[data-choose]');
    if (chooser) return void choose(Number(chooser.dataset.choose));
    const zoomer = event.target.closest('button[data-zoom]');
    if (zoomer) enlarge(Number(zoomer.dataset.zoom));
  });

  /** The seat a letter names, or null for a key that names none. */
  function seatFromKey(pressed) {
    if (pressed.length !== 1) return null;
    const seat = pressed.toUpperCase().charCodeAt(0) - 65;
    return seat >= 0 && seat < tiles.length ? seat : null;
  }

  addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    // The note field invites free text, so a letter typed there is a character,
    // not a choice; without this a note starting "beter met meer wit" picks B.
    if (event.target.closest('textarea, input, [contenteditable]')) return;
    const seat = seatFromKey(event.key);
    // Enlarged, a letter and an arrow move the view, and Enter answers with the
    // comp on screen, because nothing else is on screen to click.
    if (dialog.open) {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        stepSeat(event.key === 'ArrowRight' ? 1 : -1);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        choose(Number(dialog.dataset.index));
      } else if (seat !== null) {
        enlarge(Number(tiles[seat].dataset.index));
      }
      return;
    }
    if (seat !== null) choose(Number(tiles[seat].dataset.index));
  });
</script></body></html>`;
}

export function send(response, status, type, body) {
  response.writeHead(status, type ? { 'content-type': type } : {});
  response.end(body);
}

/** Resolve one comp asset inside its own variant directory, refusing anything
 *  that escapes it, so a comp cannot serve the rest of the filesystem. */
export async function resolveAsset(variant, relative) {
  let decoded;
  try {
    decoded = decodeURIComponent(relative);
  } catch {
    return null; // A lone '%' in a comp's own URL is a missing asset, not a crash.
  }
  const target = path.resolve(variant.directory, decoded);
  if (target !== variant.directory && !target.startsWith(variant.directory + path.sep)) return null;
  if (!(await fs.stat(target).catch(() => null))?.isFile()) return null;
  // The prefix check is string arithmetic, so it clears `..` but not a symlink
  // pointing out of the tree; resolve the real path before serving the bytes.
  let real;
  try {
    real = realpathSync(target);
  } catch {
    return null;
  }
  return real === variant.directory || real.startsWith(variant.directory + path.sep) ? real : null;
}

/** True when the request names this server by its loopback address, which a
 *  page on another site rebinding its own name to 127.0.0.1 cannot do. */
export function askedOfLoopback(request, port) {
  return [`127.0.0.1:${port}`, `localhost:${port}`].includes(request.headers.host);
}

/** True when an answer can only have come from this server's own page. A
 *  served frame runs scripts and can read the key out of its own URL, so the
 *  key alone proves nothing. Both of these a frame cannot forge: its sandbox
 *  gives it a null Origin, and a JSON content-type from an opaque origin needs
 *  a preflight this server fails. */
export function sentByOwnPage(request, port) {
  const origin = request.headers.origin;
  const foreignOrigin = origin !== undefined
    && ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(origin);
  const isJson = (request.headers['content-type'] ?? '').startsWith('application/json');
  return !foreignOrigin && isJson;
}

/** Serve the picker on a random localhost port. Returns the URL to print and a
 *  promise that resolves on the first valid answer or rejects at the deadline,
 *  which the wait for the comps has already spent part of. */
async function serve(variants, key, presentation, timeoutSeconds, deadline) {
  let settle;
  const answer = new Promise((resolve, reject) => {
    settle = (error, value) => {
      clearTimeout(timer);
      server.close();
      server.closeAllConnections();
      if (error) reject(error);
      else resolve(value);
    };
  });
  const server = http.createServer(async (request, response) => {
    const { port } = server.address();
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    if (!askedOfLoopback(request, port)) return send(response, 403, null, '');

    // Comp assets carry the key in the path, not the query, so a comp's own
    // relative URLs resolve without every stylesheet and font needing a token.
    const asset = new RegExp(`^/k/${key}/v/(\\d+)/(.+)$`).exec(url.pathname);
    if (request.method === 'GET' && asset && variants[Number(asset[1])]) {
      const variant = variants[Number(asset[1])];
      const file = await resolveAsset(variant, asset[2]);
      if (!file) return send(response, 404, null, '');
      const type = MEDIA_TYPES.get(path.extname(file).toLowerCase()) ?? 'application/octet-stream';
      if (!type.startsWith('text/html')) {
        response.writeHead(200, { 'content-type': type });
        return createReadStream(file).pipe(response);
      }
      const markup = await fs.readFile(file, 'utf8');
      return send(response, 200, type, compDocument(markup, presentation.words.lang));
    }

    if (url.searchParams.get('key') !== key) return send(response, 403, null, '');
    if (request.method === 'GET' && url.pathname === '/') {
      return send(response, 200, 'text/html; charset=utf-8', page(variants, key, presentation));
    }
    if (request.method !== 'POST' || url.pathname !== '/answer') return send(response, 404, null, '');

    if (!sentByOwnPage(request, port)) return send(response, 403, null, '');

    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      let parsed = null;
      try { parsed = JSON.parse(body); } catch { /* answered below as a bad request */ }
      const variant = Number.isInteger(parsed?.index) ? variants[parsed.index] : undefined;
      if (!variant) return send(response, 400, 'application/json', '{"ok":false}');
      send(response, 200, 'application/json', '{"ok":true}');
      settle(null, { index: variant.index, label: variant.label, steer: typeof parsed.steer === 'string' ? parsed.steer.trim() : '' });
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const timer = setTimeout(
    () => settle(new CapabilityError(`ui-design: no choice arrived within ${timeoutSeconds}s; the recommended variant stands`)),
    Math.max(0, deadline - Date.now()));
  return { url: `http://127.0.0.1:${server.address().port}/?key=${key}`, answer };
}

async function main(argv) {
  const flags = parseFlags(argv, {
    comps: 'value', contracts: 'value', frame: 'value', intrinsic: 'boolean',
    labels: 'value', recommend: 'value', 'recommend-note': 'value',
    timeout: 'value', 'no-open': 'boolean'
  });
  const timeoutSeconds = requireTimeout(flags.timeout);
  const words = await readLabels(flags.labels);
  const frame = requireFrame(flags.frame);
  const intrinsic = Boolean(flags.intrinsic);
  const variants = await loadVariants(flags.comps, flags.contracts, { frame });
  const recommended = requireRecommendation(flags.recommend, variants.length);
  const recommendedNote = requireRecommendationNote(flags['recommend-note'], recommended);
  const wantsBrowser = !flags['no-open'];
  const headless = wantsBrowser ? headlessReason() : null;
  if (headless) {
    throw new CapabilityError(`ui-design: no browser can open here (${headless}); the recommended variant stands`);
  }

  const startedAt = Date.now();
  const deadline = startedAt + timeoutSeconds * 1000;
  await waitForEveryComp(variants, deadline, timeoutSeconds);
  if (intrinsic) {
    for (const variant of variants) variant.frame = await readFrame(variant.directory, frame);
  }

  const { url, answer } = await serve(variants, randomBytes(8).toString('hex'), { words, recommended, recommendedNote }, timeoutSeconds, deadline);
  const waitedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  process.stderr.write(`ui-design: every comp landed after ${waitedSeconds}s\n`);
  process.stderr.write(`ui-design: pick URL ${url}\n`);
  if (wantsBrowser) openSystemBrowser(url);
  const chosen = await answer;
  process.stdout.write(`${JSON.stringify(chosen)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    if (error instanceof UsageError) {
      process.stderr.write(`ui-design: ${error.message}\n`);
      process.exitCode = 2;
      return;
    }
    if (error instanceof CapabilityError) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 3;
      return;
    }
    process.stderr.write(`ui-design: ${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
