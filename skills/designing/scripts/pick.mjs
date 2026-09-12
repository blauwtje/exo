// Blocking live picker for the ui-design skill: every direction comp runs in its
// own frame, all frames at one shared scale inside a single viewport, and the
// script waits for one click and prints the choice. A whole card is the choice,
// so the comps in the grid take no pointer of their own; enlarged, one comp is
// live at its own frame size, scaled whole rather than reflowed, with the other
// seats a key away, and a shim neutralises navigation so a click demonstrates
// without doing anything. A comp that ran past its frame is enlarged whole
// and smaller, never scrolled. The server binds a random localhost port behind a
// per-run key, so nothing else on the machine can read the comps or answer for
// the user. Nothing is written.
//
//   node scripts/pick.mjs --comps <dir> --contracts <contracts.json>
//                         [--labels <labels.json>] [--intrinsic]
//                         [--frame <width>x<height>, default 1280x800]
//                         [--recommend <n>] [--recommend-note <one sentence>]
//                         [--timeout <seconds, default 600>] [--no-open]
//
// --contracts decides the seats: contracts[i] is variant i, and --comps holds
// one directory per variant, named variant-0, variant-1, and so on, each
// carrying an index.html plus its own assets. A seat opens empty and fills the
// moment its own index.html exists, so the tab is up while the comps are still
// being written and nothing waits for the last of three. A variant sets its own
// frame size in an optional meta.json ({"width":<n>,"height":<n>}), which
// --intrinsic honours so a size comparison keeps its size differences at one
// shared scale; that mode lays the grid out from those sizes, so it needs its
// comps written before the run. stdout carries one line,
// {"index","label","steer"}, on exit 0. Exit 2 is a usage error; exit 3 means no
// browser or no answer, and the --recommend variant is then the selection.
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
// to the English string below. --recommend seats that variant first and badges
// it, and --recommend-note puts one plain sentence of reasoning inside that
// card.
//
// Each comp reports the box its text, media and controls occupy, and the grid
// crops every tile to one shared window around those boxes. A comp is judged on
// what it says, and a whole 1280x800 page shrunk into a third of a screen says
// none of it; the window drops the margin nobody is judging and spends the
// width on the part they are. One window for every comp, never one each, so the
// three stay a like-for-like comparison. --intrinsic turns cropping off: there
// the frame size is the thing being compared.

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createReadStream, realpathSync } from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
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
const DEFAULT_LABELS = {
  lang: 'en',
  title: 'Which one do you like best?',
  hint: 'Click one to choose.',
  recommended: 'Recommended',
  fallbackTitle: 'Option {n}',
  choose: 'Choose this',
  zoom: 'Enlarge',
  close: 'Close',
  typeRole: 'Letters',
  steer: 'Want anything changed?',
  done: 'That is your pick. You can close this tab now.',
  failed: 'Your choice did not arrive. Say it in the conversation instead.'
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS);
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
// also measures what the comp actually shows, which is the only place that can
// be measured: the picker owns the frame but may not read inside it.
//
// Backgrounds are deliberately not counted. A ground painted on a wrapper fills
// the frame, so counting it would report every comp as full-bleed and crop
// nothing; text, media and controls are what a chooser reads, and the window
// around them keeps the ground visible behind them anyway.
const DEMO_SHIM = `<script>
(() => {
  const swallow = (event) => {
    const anchor = event.target.closest?.('a[href]');
    if (anchor && !anchor.getAttribute('href').startsWith('#')) event.preventDefault();
  };
  addEventListener('click', swallow, true);
  addEventListener('submit', (event) => event.preventDefault(), true);
  window.open = () => null;

  const CARRIERS = /^(IMG|SVG|VIDEO|CANVAS|PICTURE|IFRAME|INPUT|BUTTON|TEXTAREA|SELECT)$/;
  const carriesContent = (element) => {
    if (CARRIERS.test(element.tagName)) return true;
    for (const node of element.childNodes) {
      if (node.nodeType === 3 && node.data.trim() !== '') return true;
    }
    return false;
  };

  /** The box the comp's own content occupies, in its own pixels. Head elements
   *  hold text too, so the zero-size rect of a title or a style block is what
   *  keeps them out rather than a tag list that would need maintaining. */
  const contentBox = () => {
    const frameWidth = document.documentElement.clientWidth;
    const frameHeight = document.documentElement.clientHeight;
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const element of document.querySelectorAll('*')) {
      if (!carriesContent(element)) continue;
      const style = getComputedStyle(element);
      if (style.visibility === 'hidden' || style.opacity === '0') continue;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      left = Math.min(left, rect.left);
      top = Math.min(top, rect.top);
      right = Math.max(right, rect.right);
      bottom = Math.max(bottom, rect.bottom);
    }
    // A comp made of colour alone has nothing to crop to, and neither has one
    // whose content sits past its own frame; the whole frame is the answer.
    if (!(right > left && bottom > top)) return { left: 0, top: 0, right: frameWidth, bottom: frameHeight };
    return {
      left: Math.max(0, left), top: Math.max(0, top),
      right: Math.min(frameWidth, right), bottom: Math.min(frameHeight, bottom)
    };
  };

  /** How tall the comp really is, so the enlarged view can show all of it. */
  const documentHeight = () =>
    Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0);

  // Two frames after load, because a rect measured mid-layout is a rect of the
  // wrong box, and again once the faces land, because a fallback face reflows
  // every line it sets. The picker takes whichever report arrives last.
  const report = () => requestAnimationFrame(() =>
    requestAnimationFrame(() => parent.postMessage({
      uiDesignContentBox: contentBox(), uiDesignDocumentHeight: documentHeight()
    }, '*')));
  if (document.readyState === 'complete') report();
  else addEventListener('load', report);
  document.fonts?.ready.then(report);
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
// shim is appended either way, because the picker measures and neutralises
// navigation from inside the frame in both cases.
const OPENS_ITS_OWN_DOCUMENT = /^\s*<(?:!doctype|html)\b/i;

function compDocument(markup, lang) {
  if (OPENS_ITS_OWN_DOCUMENT.test(markup)) {
    return markup.includes('</body>')
      ? markup.replace('</body>', `${DEMO_SHIM}\n</body>`)
      : `${markup}\n${DEMO_SHIM}`;
  }
  return `<!doctype html>
<html lang="${escapeHtml(lang)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${COMP_RESET}</style>
</head><body>
${markup}
${DEMO_SHIM}
</body></html>`;
}

function requireTimeout(text) {
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
function headlessReason() {
  if (process.env.CI) return 'CI is set';
  if (process.env.SSH_CONNECTION && !process.env.DISPLAY) return 'SSH session without DISPLAY';
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    return 'no DISPLAY or WAYLAND_DISPLAY';
  }
  return null;
}

function openSystemBrowser(url) {
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

/** One seat per contract, whether its comp exists yet or not: the contracts are
 *  written before any comp, so they are what the screen can be laid out from
 *  while the comps are still arriving. */
export async function loadVariants(compsDirectory, contractsFile, { frame = DEFAULT_FRAME, intrinsic = false } = {}) {
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
    const directory = path.join(root, label);
    // --intrinsic lays the grid out from the comps' own frame sizes, so under it
    // alone a comp has to be on disk before the run; every other mode opens on
    // the shared frame and fills the seat when the file lands.
    if (intrinsic && !(await fs.stat(path.join(directory, 'index.html')).catch(() => null))?.isFile()) {
      throw new UsageError(`--intrinsic needs every comp written first, and '${directory}' has no index.html`);
    }
    variants.push({
      index,
      label,
      directory,
      ready: false,
      frame: intrinsic ? await readFrame(directory, frame) : frame,
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

/** The chooser's own copy, written by the skill in the language the
 *  conversation runs in. Every key is optional: what the file leaves out falls
 *  back to English, so a partial file still yields a screen with no blanks. */
export async function readLabels(labelsFile) {
  if (labelsFile === undefined) return DEFAULT_LABELS;
  const written = await readJsonFlag(labelsFile, '--labels');
  if (written === null || typeof written !== 'object' || Array.isArray(written)) {
    throw new UsageError('--labels file must hold an object of label keys');
  }
  const words = { ...DEFAULT_LABELS };
  for (const [name, value] of Object.entries(written)) {
    if (!LABEL_KEYS.includes(name)) {
      throw new UsageError(`--labels holds unknown key '${name}', expected one of ${LABEL_KEYS.join(', ')}`);
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

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function page(variants, key, { words, recommended, recommendedNote, intrinsic }) {
  // The recommendation is expressed as the first seat rather than as a sentence
  // of chrome above the comps. Every data-* attribute keeps carrying the real
  // variant index, so a reordered screen still answers with the index the comps
  // directory and the caller agreed on.
  const seated = recommended === null
    ? variants
    : [variants[recommended], ...variants.filter((variant) => variant.index !== recommended)];

  // Named roles, never hex: someone deciding between three pictures acts on
  // 'donkere achtergrond' and cannot act on #0e1116. The face is set in itself,
  // so the line shows the typeface rather than describing it.
  // The typeface is one more row of the same legend, not a line of its own:
  // read down the card, the sample sits over the colours and its name over
  // theirs. Every row emits all four cells even when one is empty, because a
  // missing cell would shift the codes out of the column they share.
  const signature = (written) => {
    if (!written) return '';
    const face = written.face
      ? `<li class="face" style="--face:${escapeHtml(written.face.stack)}"><span class="face-sample">Aa</span><span class="role">${escapeHtml(words.typeRole)}</span><span class="tone">${escapeHtml(written.face.name ?? '')}</span><span></span></li>`
      : '';
    const swatches = written.swatches.map((swatch) =>
      `<li style="--swatch:${escapeHtml(swatch.value)}"><span class="chip"></span><span class="role">${escapeHtml(swatch.role)}</span><span class="tone">${escapeHtml(swatch.name)}</span><code>${escapeHtml(swatch.code)}</code></li>`).join('');
    return `<ul class="signature">${face}${swatches}</ul>`;
  };

  // What a chooser reads is the contract's own title and description, written by
  // the skill in the words of the subject. The dealt axis ids stay out of the
  // tile: they name the machinery, not the direction, and 'tide-band-strata'
  // tells someone deciding between three pictures nothing they can act on.
  const tile = (variant, seat) => {
    const mark = seatMark(seat);
    const title = variant.contract?.title ?? fillPosition(words.fallbackTitle, mark);
    const description = variant.contract?.description ?? '';
    const isPick = variant.index === recommended;
    // The crop starts as the whole frame, so the first paint is the comp entire
    // and the window only ever narrows onto content once every comp has said
    // where its own content is.
    // A seat whose comp has not been written yet holds its title and its
    // description and an empty frame, and its controls stay off: nobody chooses
    // or enlarges a direction they cannot see. aria-busy says the same thing
    // without a sentence of copy to translate.
    const source = `/k/${key}/v/${variant.index}/index.html`;
    const waiting = !variant.ready;
    return `<section class="tile${isPick ? ' recommended' : ''}${waiting ? ' pending' : ''}"${waiting ? ' aria-busy="true"' : ''} style="--fw:${variant.frame.width};--fh:${variant.frame.height};--cw:${variant.frame.width};--ch:${variant.frame.height};--cx:0;--cy:0" data-index="${variant.index}" data-source="${source}" data-summary="${escapeHtml(description)}">
    <div class="stage">
      <iframe inert sandbox="allow-scripts" loading="eager" title="${escapeHtml(title)}"${waiting ? '' : ` src="${source}"`}></iframe>
      <button type="button" class="enlarge" data-zoom="${variant.index}"${waiting ? ' disabled' : ''}>${escapeHtml(words.zoom)}</button>
    </div>
    <div class="meta">
      <h2><span class="ordinal">${mark}</span><span class="label">${escapeHtml(title)}</span>${isPick ? `<span class="badge">${escapeHtml(words.recommended)}</span>` : ''}</h2>
      <p class="description">${escapeHtml(description)}</p>
      ${signature(variant.signature)}
    </div>
    ${isPick && recommendedNote ? `<p class="why"><span class="why-mark" aria-hidden="true">&#9733;</span>${escapeHtml(recommendedNote)}</p>` : ''}
    <button type="button" class="pick" data-choose="${variant.index}" aria-label="${escapeHtml(`${words.choose}: ${title}`)}"${waiting ? ' disabled' : ''}></button>
  </section>`;
  };

  // The comps load their own faces inside their frames, which the picker page
  // cannot borrow, so the sample needs the same stylesheet here. Deduplicated,
  // because three variants on one family would otherwise fetch it three times.
  const fontLinks = [...new Set(seated.map((variant) => variant.signature?.fontHref).filter(Boolean))]
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`).join('\n');

  return `<!doctype html>
<html lang="${escapeHtml(words.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(words.title)}</title>
${fontLinks}
<style>
  @layer tokens, base, layout, components;
  @layer tokens {
    :root {
      color-scheme: light dark;
      --ground: light-dark(oklch(0.982 0.003 85), oklch(0.238 0.004 85));
      --surface: light-dark(oklch(1 0 0), oklch(0.292 0.005 85));
      --ink: light-dark(oklch(0.24 0.010 85), oklch(0.955 0.003 85));
      --ink-muted: light-dark(oklch(0.505 0.010 85), oklch(0.735 0.006 85));
      --border: light-dark(oklch(0.885 0.005 85), oklch(0.365 0.006 85));
      /* The hairline that separates surfaces is not the edge that identifies a
         control: that one owes 3:1 against its own fill, so it is its own token. */
      --border-control: light-dark(oklch(0.60 0.010 85), oklch(0.575 0.008 85));
      /* Amber, and only on marks the size of a coin: the comps carry the colour
         being judged, so chrome that competes with them is chrome that lies. */
      --accent: light-dark(oklch(0.52 0.145 52), oklch(0.765 0.135 68));
      --accent-ink: light-dark(oklch(0.99 0 0), oklch(0.22 0.03 68));
      /* Two soft washes over the flat ground, so the comps read as cards
         standing on a surface instead of as cutouts on a sheet. Kept nearly
         neutral on purpose: the comps carry the colour being judged, and a
         tinted ground would be judging it along with them. */
      --wash-warm: light-dark(oklch(0.945 0.030 72 / 0.75), oklch(0.345 0.030 72 / 0.70));
      --wash-cool: light-dark(oklch(0.955 0.022 140 / 0.65), oklch(0.320 0.022 150 / 0.60));
      --font-stack: ui-sans-serif, system-ui, sans-serif;
      --radius-control: 8px;
      --radius-surface: 14px;
      --radius-card: 20px;
      --gap: 18px;
      --pad: 20px;
      --tile-pad: 14px;
      --tile-gap: 12px;
      /* What the legend needs to stay readable: a chip, three words and a hex
         code side by side. The card never leaves the comp's width, so this is
         a floor under the scale, not under the card. */
      --tile-min: 320px;
      --k: 0.3;
      --cols: 1;
    }
  }
  @layer base {
    * { box-sizing: border-box; }
    html, body { block-size: 100%; overflow: hidden; }
    /* Scrolling belongs to the document, never to the row. A row with its own
       overflow-x is given overflow-y with it, and then it clips the very cards
       it was meant to reveal. Released from full height, the body grows past
       the viewport and the page scrolls in whichever direction it has to. */
    html.overflowing, html.overflowing body { overflow: auto; }
    html.overflowing body { block-size: auto; }
    /* Enlarged, the page behind is scenery: a wheel over the panel would scroll
       it out from under the panel, so the document holds still until close. */
    html.zoomed { overflow: hidden; }
    body {
      margin: 0; color: var(--ink);
      background-color: var(--ground);
      /* Sized in viewport units, not ch: a font-relative length is not a valid
         radial-gradient size and drops the whole declaration. */
      background-image:
        radial-gradient(58vw 55vh at 4% -14%, var(--wash-warm), transparent 68%),
        radial-gradient(52vw 50vh at 99% -4%, var(--wash-cool), transparent 64%),
        radial-gradient(74vw 42vh at 50% 114%, var(--wash-warm), transparent 70%);
      background-repeat: no-repeat;
      background-attachment: fixed;
      font: 15px/1.5 var(--font-stack);
      font-variant-numeric: tabular-nums;
      /* Rows sized to their content with the comps taking the rest, so the
         leftover space sits around the comps instead of as one empty band
         under them. */
      display: grid; grid-template-rows: auto 1fr auto; row-gap: var(--gap);
      min-block-size: 100%; padding: var(--pad);
    }
    ::selection { background: var(--accent); color: var(--accent-ink); }
    :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  }
  @layer layout {
    header { display: grid; justify-items: center; row-gap: 1px; text-align: center; }
    h1 { font-size: 18px; font-weight: 650; letter-spacing: -0.012em; margin: 0; }
    .hint { color: var(--ink-muted); font-size: 13px; margin: 0; }
    .grid {
      display: grid; gap: var(--gap);
      grid-template-columns: repeat(var(--cols), max-content);
      /* Safe centring: centred while it fits, and start-aligned the moment it
         does not, because a centred row that overflows puts its first card off
         the edge the scroll cannot reach. */
      justify-content: safe center; align-content: safe center; align-items: stretch;
    }
    /* The card is exactly as wide as the comp it holds, so a long sentence
       wraps instead of widening the card past its own picture. Rows are comp
       then caption, and the caption's row takes the slack, which leaves the
       reason at the bottom and every caption starting at the same height. */
    .tile {
      display: grid; grid-template-rows: auto 1fr;
      row-gap: var(--tile-gap); padding: var(--tile-pad);
      inline-size: calc(var(--cw) * var(--k) * 1px + var(--tile-pad) * 2);
    }
    footer { display: grid; inline-size: 100%; max-inline-size: 640px; margin-inline: auto; }
  }
  @layer components {
    /* The note is the one surface besides the cards: translucent and blurred,
       so the ground's wash carries through it. The title above the comps gets
       no box at all, because a bar around two lines is a bar around nothing. */
    .note {
      padding-inline: 18px; padding-block: 11px;
      background: color-mix(in oklch, var(--surface) 70%, transparent);
      border: 1px solid color-mix(in oklch, var(--border) 72%, transparent);
      border-radius: var(--radius-card);
      backdrop-filter: blur(12px) saturate(1.15);
      box-shadow: 0 1px 2px -1px oklch(from var(--ink) l c h / 0.06);
    }
    /* One card per direction, holding the comp, its name and its button inside
       a single edge: three directions then read as three things to compare,
       where six loose blocks read as six. The card carries the elevation, so
       the comp inside it keeps a hairline and no shadow of its own. */
    .tile {
      position: relative; cursor: pointer;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-card);
      transition: border-color 160ms cubic-bezier(0.16, 1, 0.3, 1), translate 160ms,
                  box-shadow 200ms ease, opacity 200ms ease;
      box-shadow: 0 1px 2px -1px oklch(from var(--ink) l c h / 0.08),
                  0 16px 40px -20px oklch(from var(--ink) l c h / 0.18);
    }
    /* The card is the choice, so one transparent button covers it. A button
       cannot wrap the comp's frame, and a div with a click handler is not
       reachable by keyboard; this way the whole card is one target that
       announces itself. Enlarge sits above it and stays its own control. */
    .pick {
      position: absolute; inset: 0; z-index: 1;
      border: 0; padding: 0; min-block-size: 0;
      background: none; cursor: pointer;
    }
    .tile:hover { border-color: var(--accent); translate: 0 -2px; }
    /* Between the click and the answer there is a network hop, and a screen that
       shows nothing for it reads as a click that missed. The chosen card lifts
       and the rest step back, so the page says which one it is sending before it
       can say that it landed. The others dim whole, comp and all: the comparison
       is over the moment the answer leaves, and a faded card with a bright
       picture still in it reads as one that is somehow still in the running. */
    .grid.deciding { pointer-events: none; }
    .grid.deciding .tile:not(.choosing) { opacity: 0.5; }
    .tile.choosing {
      border-color: var(--accent); translate: 0 -2px;
      box-shadow: 0 0 0 3px color-mix(in oklch, var(--accent) 26%, transparent),
                  0 18px 44px -22px oklch(from var(--ink) l c h / 0.28);
    }
    .pick:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
    /* Comparing three comps happens by eye; trying one happens enlarged. In the
       grid the frame takes no pointer, so every part of the card is the choice.
       The same for the keyboard, which is what inert on the frame carries into
       the comp's own document: without it, tabbing through three directions
       means tabbing through every link inside all three. */
    iframe { pointer-events: none; }
    .zoom iframe { pointer-events: auto; }
    /* A seat waiting for its comp shows the frame it will arrive in and nothing
       else: a blank srcless document paints white, which reads as a comp with a
       white ground rather than as a comp that has not landed. */
    .tile.pending iframe { visibility: hidden; }
    .tile.pending .stage { background: color-mix(in oklab, var(--ink) 6%, transparent); }
    .tile.pending .meta { opacity: 0.55; }
    /* The stage is the crop window, not the frame: the comp keeps its own size
       and is moved under the window, so a narrower window is a closer look
       rather than a smaller picture. */
    .stage {
      position: relative;
      inline-size: calc(var(--cw) * var(--k) * 1px);
      block-size: calc(var(--ch) * var(--k) * 1px);
      overflow: hidden;
      border-radius: max(6px, calc(var(--radius-card) - var(--tile-pad)));
      border: 1px solid var(--border); background: var(--ground);
    }
    iframe {
      inline-size: calc(var(--fw) * 1px); block-size: calc(var(--fh) * 1px);
      border: 0; display: block; transform-origin: top left;
      transform: scale(var(--k)) translate(calc(var(--cx) * -1px), calc(var(--cy) * -1px));
    }
    /* Cropped, the tile shows a part rather than the page, so the way back to
       the whole thing has to stay reachable. It is not painted over the comp
       while nobody is asking for it: a permanent button on all three covers the
       very words being compared, and it is only ever wanted on the one under
       the pointer. Nothing at rest, so nothing to look past. */
    .enlarge {
      position: absolute; inset-block-end: 8px; inset-inline-end: 8px;
      padding-inline: 12px; font-size: 13px;
      background: color-mix(in oklch, var(--surface) 82%, transparent);
      backdrop-filter: blur(6px); z-index: 2;
      opacity: 0; translate: 0 4px; pointer-events: none;
      transition: opacity 140ms ease, translate 140ms ease, border-color 160ms ease;
    }
    /* Hidden but focusable, so pointer-events comes back with the reveal: an
       invisible control that still takes the click is a trap, and the card
       underneath is what a click there is meant to hit. */
    .tile:hover .enlarge, .enlarge:focus-visible {
      opacity: 1; translate: 0 0; pointer-events: auto;
    }
    /* A finger has no hover to reveal it with. */
    @media (hover: none) {
      .enlarge { opacity: 1; translate: 0 0; pointer-events: auto; }
    }
    /* Title, then the sentence that explains it, then the control: reading order
       and visual order agree, and the button spans the comp it belongs to so no
       chooser has to work out which of three it acts on. */
    .meta { display: grid; row-gap: 6px; align-content: start; min-inline-size: 0; }
    h2 {
      display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px;
      font-size: 16px; font-weight: 650; margin: 0; letter-spacing: -0.01em;
      min-inline-size: 0;
    }
    /* Wrapped, not clipped: a title cut to 'Donker en fil…' costs the chooser
       the very word the direction is named for. */
    .label { min-inline-size: 0; overflow-wrap: anywhere; }
    .description { margin: 0; color: var(--ink-muted); font-size: 13px; text-wrap: pretty; }
    /* The material, read rather than guessed: the display face set in itself,
       then one row per colour saying what it is for, what it is called, and the
       code to copy. One grid for every row, so the codes line up down the card
       instead of drifting with the length of each name. */
    .signature {
      display: grid; grid-template-columns: auto minmax(0, auto) minmax(0, 1fr) auto;
      align-items: center; gap: 5px 10px;
      margin: 6px 0 0; padding: 0; list-style: none;
      min-inline-size: 0; font-size: 11.5px; color: var(--ink-muted);
    }
    .signature .role, .signature .tone { min-inline-size: 0; overflow-wrap: anywhere; }
    .signature li { display: contents; }
    .signature .role { color: var(--ink); }
    .signature code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px; letter-spacing: 0.01em; justify-self: end;
      white-space: nowrap;
    }
    .face-sample {
      font-family: var(--face); font-size: 17px; line-height: 1;
      color: var(--ink); justify-self: center;
    }
    /* A paint chip rather than a dot: a colour is judged by its area, and eleven
       pixels of circle is not enough area to tell two dark blues apart. Its own
       hairline, so a chip that matches the card is still a chip. */
    .chip {
      inline-size: 30px; block-size: 18px; border-radius: 6px;
      background: var(--swatch);
      border: 1px solid oklch(from var(--ink) l c h / 0.28);
    }
    /* Its own hairline, so a colour that matches the card is still a dot. */
    .dot {
      inline-size: 11px; block-size: 11px; border-radius: 999px; flex: none;
      background: var(--swatch);
      border: 1px solid oklch(from var(--ink) l c h / 0.25);
    }
    /* Filled, not outlined: an outline anywhere on this card reads as a card
       already chosen, and the badge has to carry the recommendation alone. */
    .badge {
      flex: none; padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 700;
      letter-spacing: 0.03em; text-transform: uppercase;
      background: var(--accent); color: var(--accent-ink); border: 0;
    }
    /* The reason sits inside the card it is about, on its own tinted ground, so
       the recommendation is visible from across the row without a border. */
    .why {
      display: flex; align-items: flex-start; gap: 7px;
      margin: 0; padding: 7px 10px 8px;
      border-radius: 10px; font-size: 12px; text-wrap: pretty;
      background: color-mix(in oklch, var(--accent) 15%, var(--surface));
      color: var(--ink);
    }
    .why-mark { flex: none; color: var(--accent); line-height: 1.35; }
    .ordinal {
      display: grid; place-items: center; inline-size: 22px; block-size: 22px; flex: none;
      border-radius: 999px; background: var(--accent); color: var(--accent-ink);
      font-size: 12px; font-weight: 650;
    }
    button {
      font: inherit; font-weight: 550; min-block-size: 44px; padding-inline: 16px;
      display: inline-flex; align-items: center; justify-content: center; white-space: nowrap;
      border: 1px solid var(--border-control); border-radius: var(--radius-control);
      background: var(--surface); color: var(--ink); cursor: pointer;
      transition: background-color 160ms cubic-bezier(0.16, 1, 0.3, 1),
                  border-color 160ms cubic-bezier(0.16, 1, 0.3, 1), translate 160ms;
    }
    button:hover { border-color: var(--accent); }
    button:active { translate: 0 1px; }
    button.primary { background: var(--accent); color: var(--accent-ink); border-color: transparent; }
    button.primary:hover { background: color-mix(in oklch, var(--accent) 88%, var(--ink)); }
    /* The note is a single field, so the card is the field: a bordered box
       holding a bordered textarea reads as two controls stacked. Focus is shown
       on the card, which is the edge someone actually sees. */
    .note {
      display: grid; row-gap: 2px; padding-block: 12px 14px;
      transition: border-color 160ms ease, box-shadow 160ms ease;
    }
    .note:focus-within {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px color-mix(in oklch, var(--accent) 24%, transparent);
    }
    .note label {
      font-size: 12px; font-weight: 600; letter-spacing: 0.01em;
      color: var(--ink-muted);
    }
    /* The family is named rather than inherited: a textarea's UA font is
       monospace, and font: inherit leaves that in place in enough engines that
       the one free-text field on the page renders unlike the rest of it. */
    .note textarea {
      font-family: var(--font-stack); font-size: 15px; line-height: 1.5;
      color: var(--ink); background: none; border: 0; padding: 0;
      resize: none; caret-color: var(--accent);
    }
    .note textarea:focus-visible { outline: none; }
    /* Enlarge is a jump between two pictures of the same thing, and a jump with
       no travel reads as a page swap: the eye loses which card it opened. Two
       tenths of a second and a hair of scale is the whole distance, kept off
       the comp's own size so nothing about the design appears to change. */
    dialog[open] { display: block; opacity: 1; scale: 1; translate: 0 0; }
    @starting-style { dialog[open] { opacity: 0; scale: 0.985; translate: 0 8px; } }
    dialog[open]::backdrop { background-color: oklch(0 0 0 / 0.58); backdrop-filter: blur(10px) saturate(0.85); }
    @starting-style { dialog[open]::backdrop { background-color: oklch(0 0 0 / 0); backdrop-filter: blur(0px); } }
    /* Enlarged is a room, not a takeover: a margin stays on every side, so the
       row it came from is still there behind the scrim and the eye knows where
       it will land on close. */
    dialog {
      /* Fixed and centred here as well as by the browser's own :modal rule, so
         an engine without that rule still puts the panel on screen. */
      position: fixed; inset: 0; margin: auto;
      inline-size: min(94vw, 1480px); block-size: min(92dvh, 980px);
      padding: 0; border: 1px solid var(--border);
      border-radius: var(--radius-card); background: var(--surface); color: var(--ink);
      overflow: hidden;
      box-shadow: 0 48px 100px -46px oklch(from var(--ink) l c h / 0.6);
      /* The closed state, which is also where the open one starts from. display
         and overlay travel with it so the exit is not cut off at frame one; a
         browser without allow-discrete simply shows and hides it outright. */
      display: none; opacity: 0; scale: 0.985; translate: 0 8px;
      transition: opacity 180ms ease,
                  scale 200ms cubic-bezier(0.16, 1, 0.3, 1),
                  translate 200ms cubic-bezier(0.16, 1, 0.3, 1),
                  display 200ms allow-discrete, overlay 200ms allow-discrete;
    }
    /* Blurred as well as dimmed: behind it lie the same comps in miniature, and
       a legible copy of the picture being judged competes with the enlarged
       one it was opened to replace. */
    dialog::backdrop {
      background-color: oklch(0 0 0 / 0); backdrop-filter: blur(0px);
      transition: background-color 200ms ease, backdrop-filter 200ms ease,
                  display 200ms allow-discrete, overlay 200ms allow-discrete;
    }
    /* A bar across the top, the comp in the middle, its material down the side:
       the enlarged view answers the same three questions the card does. */
    .zoom { display: grid; grid-template: auto minmax(0, 1fr) / minmax(0, 1fr) auto; block-size: 100%; }
    /* The panel takes the opening focus itself. Left to the dialog, focus lands
       on the first seat button, which then wears a focus ring while a different
       seat is the one on screen: two marks, two answers, one screen. */
    .zoom:focus { outline: none; }
    .zoom-bar {
      grid-column: 1 / -1;
      display: flex; align-items: center; gap: 14px;
      padding: 11px 12px 11px 16px;
      border-block-end: 1px solid var(--border);
      background: color-mix(in oklch, var(--surface) 92%, var(--ground));
    }
    .zoom-heading { display: grid; row-gap: 1px; flex: 1; min-inline-size: 0; }
    .zoom-heading strong { font-size: 15px; font-weight: 650; letter-spacing: -0.01em; }
    /* One line, clipped: the card's own sentence is a keystroke away, and what
       the bar owes is which of the three is on screen. */
    .zoom-summary { color: var(--ink-muted); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    /* The seats travel with the comp. One track, one filled seat: which three
       are in play and which one is showing, read in one glance. */
    .zoom-seats {
      display: flex; gap: 3px; flex: none; padding: 3px;
      border-radius: 999px; background: color-mix(in oklch, var(--ink) 8%, transparent);
    }
    .zoom-seats button {
      min-block-size: 32px; min-inline-size: 36px; padding-inline: 8px;
      border: 0; border-radius: 999px; background: none;
      color: var(--ink-muted); font-size: 13px; font-weight: 650;
    }
    .zoom-seats button:hover { color: var(--ink); }
    /* The lit seat carries a hairline as well as a fill: on a dark scheme the
       track is lighter than the panel, so fill alone would mark the seat by
       being darker than its neighbours and read as the one switched off. */
    .zoom-seats button[aria-current="true"] {
      background: var(--surface); color: var(--ink);
      box-shadow: inset 0 0 0 1px var(--border-control),
                  0 1px 2px -1px oklch(from var(--ink) l c h / 0.4);
    }
    .zoom-close { inline-size: 44px; padding-inline: 0; font-size: 15px; flex: none; }
    /* The comp sits on a ground a shade off the panel, so a comp with a white
       page still reads as a page standing on a surface rather than as the
       dialog itself. */
    .zoom-stage {
      display: grid; place-items: center; min-block-size: 0; padding: 20px;
      background: color-mix(in oklch, var(--ink) 5%, var(--ground));
    }
    .zoom-canvas { display: grid; place-items: center; inline-size: 100%; block-size: 100%; min-block-size: 0; }
    /* Sized to the scaled comp, which is what gives the frame its shadow and
       its corners: the shell is the comp's edge, not the room around it. */
    .zoom-shell {
      inline-size: calc(var(--zfw) * var(--zk) * 1px);
      block-size: calc(var(--zfh) * var(--zk) * 1px);
      overflow: hidden; border-radius: 12px;
      border: 1px solid var(--border); background: var(--ground);
      box-shadow: 0 26px 64px -34px oklch(from var(--ink) l c h / 0.5);
    }
    .zoom iframe {
      inline-size: calc(var(--zfw) * 1px); block-size: calc(var(--zfh) * 1px);
      border: 0; display: block;
      transform: scale(var(--zk)); transform-origin: top left;
    }
    /* The legend and the reason follow the comp in, so the enlarged view is not
       the one place the material cannot be read. */
    .zoom-rail {
      inline-size: 320px; overflow: auto;
      display: grid; align-content: start; row-gap: 14px;
      padding: 16px 18px; border-inline-start: 1px solid var(--border);
      background: color-mix(in oklch, var(--surface) 94%, var(--ground));
    }
    .zoom-rail .signature { margin: 0; font-size: 12px; }
    .zoom-size { margin: 0; color: var(--ink-muted); font-size: 11.5px; }
    /* Narrower than this, the rail costs the comp more width than the legend
       under it is worth. */
    @media (max-width: 1040px) { .zoom-rail { display: none; } }
    /* The last thing the screen says. A tick, the name of what was picked, and
       one line: the chooser has already left, so it confirms rather than asks. */
    body.finished { grid-template-rows: 1fr; place-items: center; }
    .done {
      display: grid; justify-items: center; row-gap: 10px; text-align: center;
      padding: 30px 40px 32px; max-inline-size: 36ch;
      background: color-mix(in oklch, var(--surface) 70%, transparent);
      border: 1px solid color-mix(in oklch, var(--border) 72%, transparent);
      border-radius: var(--radius-card);
      backdrop-filter: blur(12px) saturate(1.15);
      box-shadow: 0 1px 2px -1px oklch(from var(--ink) l c h / 0.06),
                  0 24px 60px -34px oklch(from var(--ink) l c h / 0.28);
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
    /* The one line that says the answer never left the tab. It sits under the
       field rather than over the cards, because the cards are still the thing
       to act on if the picker is still up. */
    .alert {
      margin: 8px 0 0; text-align: center; font-size: 13px; font-weight: 600;
      color: var(--ink);
    }
    .alert[hidden] { display: none; }
    @media (prefers-reduced-motion: reduce) {
      button, .note, .tile, .enlarge { transition-duration: 1ms; }
      dialog, dialog::backdrop { transition-duration: 1ms; }
      .done { animation-duration: 1ms; }
    }
  }
</style></head>
<body>
<header><h1>${escapeHtml(words.title)}</h1><p class="hint">${escapeHtml(words.hint)}</p></header>
<div class="grid">
${seated.map(tile).join('\n')}
</div>
<footer><div class="note"><label for="steer">${escapeHtml(words.steer)}</label><textarea id="steer" rows="2"></textarea></div><p class="alert" id="alert" role="alert" hidden></p></footer>
<dialog id="zoom"><div class="zoom" tabindex="-1" autofocus>
  <div class="zoom-bar">
    <span class="ordinal" id="zoom-mark" aria-hidden="true"></span>
    <div class="zoom-heading"><strong id="zoom-title"></strong><span class="zoom-summary" id="zoom-summary"></span></div>
    <div class="zoom-seats" id="zoom-seats" role="group"></div>
    <button type="button" class="primary" id="zoom-choose">${escapeHtml(words.choose)}</button>
    <button type="button" class="zoom-close" id="zoom-close" aria-label="${escapeHtml(words.close)}"><span aria-hidden="true">&#10005;</span></button>
  </div>
  <div class="zoom-stage"><div class="zoom-canvas" id="zoom-canvas"><div class="zoom-shell" id="zoom-shell"><iframe id="zoom-frame" sandbox="allow-scripts" title="${escapeHtml(words.zoom)}"></iframe></div></div></div>
  <aside class="zoom-rail" id="zoom-rail"><p class="zoom-size" id="zoom-size"></p></aside>
</div></dialog>
<script>
  const key = ${JSON.stringify(key)};
  const doneTemplate = ${JSON.stringify(words.done)};
  const failedTemplate = ${JSON.stringify(words.failed)};
  // Under --intrinsic the frames differ on purpose, so a shared crop would be
  // cropping away the very difference being compared.
  const cropping = ${intrinsic ? 'false' : 'true'};
  const tiles = [...document.querySelectorAll('.tile')];
  // A tile's seat is where it sits on screen; its index is the variant it
  // serves. The two stop matching once the recommendation takes the first seat,
  // so anything the chooser aims at a position resolves through this.
  const seatOf = new Map(tiles.map((tile, seat) => [Number(tile.dataset.index), seat]));
  const markOf = (seat) => tiles[seat].querySelector('.ordinal').textContent;

  // Cards in a row read across as much as down, so the legend of one has to sit
  // level with the legend of the next. The rows above it are given the tallest
  // card's height; measured rather than reserved, because how many lines a
  // sentence takes is only known once the card has its width.
  function levelCaptions() {
    for (const part of ['h2', '.description']) {
      const blocks = tiles.map((tile) => tile.querySelector(part)).filter(Boolean);
      if (blocks.length === 0) continue;
      for (const block of blocks) block.style.minBlockSize = '';
      const tallest = Math.max(...blocks.map((block) => block.getBoundingClientRect().height));
      for (const block of blocks) block.style.minBlockSize = tallest + 'px';
    }
  }

  const frameWidths = tiles.map((tile) => parseFloat(tile.style.getPropertyValue('--fw')));
  const frameHeights = tiles.map((tile) => parseFloat(tile.style.getPropertyValue('--fh')));
  // What each tile actually shows. It starts as the whole frame and narrows
  // once every comp has reported, so every measurement below reads it fresh
  // rather than closing over the sizes the page opened with.
  const cropWidths = () => tiles.map((tile) => parseFloat(tile.style.getPropertyValue('--cw')));
  const cropHeights = () => tiles.map((tile) => parseFloat(tile.style.getPropertyValue('--ch')));

  /** The scale a layout of that many columns allows, modelled the way the grid
   *  lays them out: each column as wide as its widest tile, each row as tall
   *  as its tallest, so --intrinsic sizes do not over-reserve. */
  function scaleFor(columns, captionHeight, chromeHeight, gap, pad, tilePad) {
    const widths = cropWidths();
    const heights = cropHeights();
    const rows = Math.ceil(tiles.length / columns);
    let stageWidth = 0;
    for (let column = 0; column < columns; column += 1) {
      let widest = 0;
      for (let index = column; index < tiles.length; index += columns) widest = Math.max(widest, widths[index]);
      stageWidth += widest;
    }
    let stageHeight = 0;
    for (let row = 0; row < rows; row += 1) {
      stageHeight += Math.max(...heights.slice(row * columns, (row + 1) * columns));
    }
    const availableWidth = innerWidth - pad * 2 - gap * (columns - 1) - tilePad * 2 * columns;
    const availableHeight = innerHeight - chromeHeight - (gap + captionHeight) * rows;
    return Math.min(availableWidth / stageWidth, availableHeight / stageHeight);
  }

  // The scale is one number shared by every frame, so tiles differ in size only
  // where their own frame does. The column count is searched instead of fixed at
  // one row: on a tall window two rows of two are twice the size of four in a
  // line, and that unused height was the band that made the comps unreadable.
  // Measured against the viewport rather than against the grid row: a row inside
  // a grid track reports the height it was given, the value being solved for.
  function fit() {
    const styles = getComputedStyle(document.documentElement);
    const gap = parseFloat(styles.getPropertyValue('--gap'));
    const pad = parseFloat(styles.getPropertyValue('--pad'));
    // Everything a tile spends outside its comp, measured as the difference
    // rather than summed from parts: padding, gaps, caption and, on one card,
    // the recommendation. A sum here goes stale the moment a row is added.
    const tilePad = parseFloat(styles.getPropertyValue('--tile-pad'));
    // The card follows the comp's width down, so the comp has to stop where the
    // caption stops being readable. Below this the row scrolls instead, which
    // is honest; a legend truncated to 'Achterg...' is not.
    const tileMin = parseFloat(styles.getPropertyValue('--tile-min'));
    const minScale = (tileMin - tilePad * 2) / Math.min(...cropWidths());
    const captionHeight = Math.max(...tiles.map((tile) =>
      tile.getBoundingClientRect().height - tile.querySelector('.stage').getBoundingClientRect().height));
    const chromeHeight = document.querySelector('header').offsetHeight
      + document.querySelector('footer').offsetHeight
      + gap * 2 + pad * 2;

    let best = { scale: 0, columns: tiles.length };
    for (let columns = 1; columns <= tiles.length; columns += 1) {
      const scale = scaleFor(columns, captionHeight, chromeHeight, gap, pad, tilePad);
      if (scale > best.scale) best = { scale, columns };
    }
    document.documentElement.style.setProperty('--cols', String(best.columns));
    document.documentElement.style.setProperty('--k', String(Math.max(best.scale, minScale)));
    levelCaptions();

    // The estimate above uses the caption height measured at the previous
    // scale, and a caption reflows as the card narrows, so the real layout can
    // still overflow. Measure it and shrink again; if it will not
    // fit at all, scroll rather than hide a control behind overflow:hidden.
    // Measured from the content, not from scrollWidth: under overflow:hidden the
    // document reports the viewport back, so an element pushed off the side is
    // invisible to the very check meant to catch it.
    const needed = () => ({
      width: Math.max(...tiles.map((tile) => tile.getBoundingClientRect().right)) + pad,
      height: document.querySelector('footer').getBoundingClientRect().bottom + pad
    });
    const root = document.documentElement;
    for (let pass = 0; pass < 3; pass += 1) {
      const { width, height } = needed();
      const overflow = Math.max(width / innerWidth, height / innerHeight);
      if (overflow <= 1.001) break;
      const current = parseFloat(getComputedStyle(root).getPropertyValue('--k'));
      root.style.setProperty('--k', String(Math.max(current / overflow, minScale)));
      levelCaptions();
    }
    // A caption has a minimum height its words impose, so past some window size
    // no scale fits. Scrolling is the honest answer there; hiding a direction
    // the user is being asked to compare is not.
    const { width, height } = needed();
    root.classList.toggle('overflowing', width > innerWidth + 1 || height > innerHeight + 1);
  }
  fit();
  addEventListener('resize', fit);

  // Half the frame in each axis. A comp carrying one headline would otherwise
  // crop to that headline, and a direction is judged on how it places things as
  // much as on how it sets them; below this the window stops being a closer
  // look and starts being a different picture.
  const WINDOW_FLOOR = 0.5;
  // Room around the content, so the crop is a margin the designer did not draw
  // rather than a cut through the one they did.
  const WINDOW_MARGIN = 28;
  const contentBoxes = new Map();
  // Per seat, in the comp's own pixels; the enlarged view sizes its frame to it.
  const documentHeights = new Map();

  /** One window over every comp, computed from where all of them put content.
   *  Per-comp windows would give each tile its own size and turn a comparison
   *  into three unrelated pictures, so the union is the whole point. */
  function applyContentWindow() {
    if (contentBoxes.size !== tiles.length) return;
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const box of contentBoxes.values()) {
      left = Math.min(left, box.left);
      top = Math.min(top, box.top);
      right = Math.max(right, box.right);
      bottom = Math.max(bottom, box.bottom);
    }
    const frameWidth = Math.min(...frameWidths);
    const frameHeight = Math.min(...frameHeights);
    left -= WINDOW_MARGIN; top -= WINDOW_MARGIN;
    right += WINDOW_MARGIN; bottom += WINDOW_MARGIN;

    // Grown from the middle, so a window pushed up to the floor keeps the
    // content where the comp put it instead of sliding it into a corner.
    const grow = (near, far, limit) => {
      const shortfall = limit * WINDOW_FLOOR - (far - near);
      if (shortfall > 0) { near -= shortfall / 2; far += shortfall / 2; }
      if (near < 0) { far -= near; near = 0; }
      if (far > limit) { near -= far - limit; far = limit; }
      return [Math.max(0, near), Math.min(limit, far)];
    };
    [left, right] = grow(left, right, frameWidth);
    [top, bottom] = grow(top, bottom, frameHeight);

    for (const tile of tiles) {
      tile.style.setProperty('--cw', String(right - left));
      tile.style.setProperty('--ch', String(bottom - top));
      tile.style.setProperty('--cx', String(left));
      tile.style.setProperty('--cy', String(top));
    }
    fit();
  }

  // The box arrives from a sandboxed frame, so it has a null origin and nothing
  // to check the sender against but the frame handle itself.
  addEventListener('message', (event) => {
    const seat = tiles.findIndex((tile) => tile.querySelector('iframe').contentWindow === event.source);
    if (seat < 0) return;
    const height = event.data?.uiDesignDocumentHeight;
    if (Number.isFinite(height) && height > 0) documentHeights.set(seat, height);
    if (!cropping) return;
    const box = event.data?.uiDesignContentBox;
    if (!box) return;
    const sides = [box.left, box.top, box.right, box.bottom];
    if (!sides.every((side) => Number.isFinite(side))) return;
    if (!(box.right > box.left && box.bottom > box.top)) return;
    contentBoxes.set(seat, box);
    applyContentWindow();
  });

  const dialog = document.getElementById('zoom');
  const zoomFrame = document.getElementById('zoom-frame');
  const zoomShell = document.getElementById('zoom-shell');
  const zoomCanvas = document.getElementById('zoom-canvas');
  const zoomChoose = document.getElementById('zoom-choose');
  const zoomSeats = document.getElementById('zoom-seats');
  const zoomRail = document.getElementById('zoom-rail');
  const zoomSize = document.getElementById('zoom-size');
  // Which seat the dialog is showing, so an arrow key has somewhere to step
  // from and a closed dialog has nothing to step at all.
  let shownSeat = null;

  document.getElementById('zoom-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    zoomFrame.removeAttribute('src');
    shownSeat = null;
    document.documentElement.classList.remove('zoomed');
  });
  // A click that lands on the dialog itself landed on the backdrop: the panel
  // inside covers the element edge to edge, so nothing else can be the target.
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });

  // One seat button per card, marked the way the cards are. Enlarged, the other
  // two directions stay named and one keystroke away, so a comparison does not
  // cost a close, a look and a second enlarge.
  for (const [seat, tile] of tiles.entries()) {
    const seatButton = document.createElement('button');
    seatButton.type = 'button';
    seatButton.dataset.zoom = tile.dataset.index;
    seatButton.textContent = markOf(seat);
    seatButton.setAttribute('aria-label', markOf(seat) + '. ' + tile.querySelector('.label').textContent);
    seatButton.disabled = tile.classList.contains('pending');
    zoomSeats.append(seatButton);
  }

  // The seats the page opened empty. The picker is up before the comps are
  // written, so each seat is filled the moment its own file lands instead of the
  // screen waiting for the last of three. The shared content window still waits
  // for all of them, because a crop applied to two comps and then redrawn for
  // three is not a like-for-like comparison.
  const waiting = new Map(tiles
    .filter((tile) => tile.classList.contains('pending'))
    .map((tile) => [Number(tile.dataset.index), tile]));

  function fill(index) {
    const tile = waiting.get(index);
    if (!tile) return;
    waiting.delete(index);
    tile.classList.remove('pending');
    tile.removeAttribute('aria-busy');
    tile.querySelector('iframe').src = tile.dataset.source;
    for (const control of tile.querySelectorAll('button[disabled]')) control.disabled = false;
    zoomSeats.children[seatOf.get(index)].disabled = false;
  }

  async function fillSeatsAsTheyLand() {
    while (waiting.size > 0) {
      try {
        const answered = await (await fetch('/k/' + key + '/ready')).json();
        for (const index of answered.ready ?? []) fill(index);
      } catch {
        // The server is gone, so the run is over and no seat will ever fill.
        return;
      }
      if (waiting.size === 0) return;
      await new Promise((resolve) => { setTimeout(resolve, 700); });
    }
  }
  fillSeatsAsTheyLand();

  /** The comp at its own frame size, scaled whole to the room it has. Stretched
   *  to the dialog instead, a 1280-wide page reflows into a shape no browser
   *  has, and the enlarged view shows a layout the tile never did. Never past
   *  1: a comp blown up beyond the size it was drawn for is a third design. */
  function fitZoom() {
    if (!dialog.open) return;
    const frameWidth = parseFloat(zoomShell.style.getPropertyValue('--zfw'));
    const frameHeight = parseFloat(zoomShell.style.getPropertyValue('--zfh'));
    const scale = Math.min(zoomCanvas.clientWidth / frameWidth, zoomCanvas.clientHeight / frameHeight, 1);
    zoomShell.style.setProperty('--zk', String(scale));
    zoomSize.textContent = frameWidth + ' \u00d7 ' + frameHeight + ' \u00b7 ' + Math.round(scale * 100) + '%';
  }
  addEventListener('resize', fitZoom);

  // Enlarged is where the comp is actually readable, so it is also where the
  // legend, the reason and the choice live; going back to the overview to pick
  // would mean deciding from the version that could not be read.
  function enlarge(index) {
    const seat = seatOf.get(index);
    const tile = tiles[seat];
    shownSeat = seat;
    // The heading's own text runs the ordinal into the title ("1Warm en rustig"),
    // so the bar takes the label span and marks the seat with the same chip the
    // card wears.
    document.getElementById('zoom-mark').textContent = markOf(seat);
    document.getElementById('zoom-title').textContent = tile.querySelector('.label').textContent;
    document.getElementById('zoom-summary').textContent = tile.dataset.summary;
    for (const seatButton of zoomSeats.children) {
      seatButton.setAttribute('aria-current', String(Number(seatButton.dataset.zoom) === index));
    }
    // Copied off the card rather than rendered a second time: one legend in the
    // page means a card and its enlargement cannot drift apart.
    const material = [tile.querySelector('.signature'), tile.querySelector('.why')]
      .filter(Boolean).map((node) => node.cloneNode(true));
    zoomRail.replaceChildren(...material, zoomSize);
    zoomShell.style.setProperty('--zfw', tile.style.getPropertyValue('--fw'));
    // The comp's whole height, so one that ran past its frame is shown smaller
    // rather than scrolled: the enlarged view is one look, not a page to read down.
    const frameHeight = parseFloat(tile.style.getPropertyValue('--fh'));
    zoomShell.style.setProperty('--zfh', String(Math.max(frameHeight, documentHeights.get(seat) ?? 0)));
    zoomChoose.dataset.index = String(index);
    zoomFrame.src = '/k/' + key + '/v/' + index + '/index.html';
    if (!dialog.open) dialog.showModal();
    document.documentElement.classList.add('zoomed');
    fitZoom();
  }

  /** The seat one step along the row, wrapping, so the last comp is one key
   *  from the first. A seat whose comp has not landed is stepped over rather
   *  than enlarged: there is nothing in it to look at. */
  function stepSeat(step) {
    if (shownSeat === null) return;
    const count = tiles.length;
    for (let taken = 1; taken <= count; taken += 1) {
      const seat = ((shownSeat + step * taken) % count + count) % count;
      const tile = tiles[seat];
      if (tile.classList.contains('pending')) continue;
      enlarge(Number(tile.dataset.index));
      return;
    }
  }
  zoomChoose.addEventListener('click', () => choose(Number(zoomChoose.dataset.index)));

  async function choose(index) {
    const steer = document.getElementById('steer').value;
    const alert = document.getElementById('alert');
    alert.hidden = true;
    for (const each of document.querySelectorAll('button')) each.disabled = true;
    const grid = document.querySelector('.grid');
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
      alert.textContent = failedTemplate;
      alert.hidden = false;
      fit();
      return;
    }
    // The panel replaces the page, and a modal still open when its own element
    // is removed leaves the backdrop painted over the answer.
    if (dialog.open) dialog.close();
    const panel = document.createElement('div');
    panel.className = 'done';
    const mark = document.createElement('div');
    mark.className = 'done-mark';
    mark.textContent = '\u2713';
    mark.setAttribute('aria-hidden', 'true');
    const heading = document.createElement('h1');
    heading.textContent = tiles[seatOf.get(index)].querySelector('.label').textContent;
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
  function seatFromKey(key) {
    if (key.length !== 1) return null;
    const seat = key.toUpperCase().charCodeAt(0) - 65;
    return seat >= 0 && seat < tiles.length ? seat : null;
  }

  addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    // The note field invites free text, so a letter typed there is a character,
    // not a choice; without this a note starting "beter met meer wit" picks B.
    if (event.target.closest('textarea, input, [contenteditable]')) return;
    const seat = seatFromKey(event.key);
    // Enlarged, a letter and an arrow move the view rather than answer with it:
    // someone who opened a comp came to look at it, and the answer is one
    // button away in the bar above it.
    if (dialog.open) {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        stepSeat(event.key === 'ArrowRight' ? 1 : -1);
      } else if (seat !== null) {
        enlarge(Number(tiles[seat].dataset.index));
      }
      return;
    }
    if (seat !== null) choose(Number(tiles[seat].dataset.index));
  });
</script></body></html>`;
}

function send(response, status, type, body) {
  response.writeHead(status, type ? { 'content-type': type } : {});
  response.end(body);
}

/** Resolve one comp asset inside its own variant directory, refusing anything
 *  that escapes it, so a comp cannot serve the rest of the filesystem. */
async function resolveAsset(variant, relative) {
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

/** Serve the picker on a random localhost port. Returns the URL to print and a
 *  promise that resolves on the first valid answer or rejects at the timeout. */
async function serve(variants, key, presentation, timeoutSeconds) {
  let settle;
  const answer = new Promise((resolve, reject) => {
    settle = (error, value) => {
      clearTimeout(deadline);
      server.close();
      server.closeAllConnections();
      if (error) reject(error);
      else resolve(value);
    };
  });
  const server = http.createServer(async (request, response) => {
    const { port } = server.address();
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    const local = [`127.0.0.1:${port}`, `localhost:${port}`].includes(request.headers.host);
    if (!local) return send(response, 403, null, '');

    // Comp assets carry the key in the path, not the query, so a comp's own
    // relative URLs resolve without every stylesheet and font needing a token.
    // The seats the page may fill now. It carries the key in the path for the
    // same reason the assets do, and it is what turns an empty seat into a comp
    // without the chooser reloading anything.
    if (request.method === 'GET' && url.pathname === `/k/${key}/ready`) {
      const ready = [];
      for (const variant of variants) {
        if (await seatReady(variant)) ready.push(variant.index);
      }
      return send(response, 200, 'application/json', JSON.stringify({ ready }));
    }

    const asset = new RegExp(`^/k/${key}/v/(\\d+)/(.+)$`).exec(url.pathname);
    if (request.method === 'GET' && asset && variants[Number(asset[1])]) {
      const variant = variants[Number(asset[1])];
      if (!(await seatReady(variant))) return send(response, 404, null, '');
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
      // Readiness is resolved before the markup so a comp already on disk is
      // painted by the first response, not one poll later.
      for (const variant of variants) await seatReady(variant);
      return send(response, 200, 'text/html; charset=utf-8', page(variants, key, presentation));
    }
    if (request.method !== 'POST' || url.pathname !== '/answer') return send(response, 404, null, '');

    // A comp runs scripts and can read the key out of its own URL, so the key
    // alone no longer proves the picker page sent this. Both of these a comp
    // frame cannot forge: its sandbox gives it a null Origin, and a JSON
    // content-type from an opaque origin needs a preflight this server fails.
    const origin = request.headers.origin;
    const foreignOrigin = origin !== undefined
      && ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(origin);
    const isJson = (request.headers['content-type'] ?? '').startsWith('application/json');
    if (foreignOrigin || !isJson) return send(response, 403, null, '');

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
  const deadline = setTimeout(
    () => settle(new CapabilityError(`ui-design: no choice arrived within ${timeoutSeconds}s; the recommended variant stands`)),
    timeoutSeconds * 1000);
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
  const variants = await loadVariants(flags.comps, flags.contracts, { frame, intrinsic });
  const recommended = requireRecommendation(flags.recommend, variants.length);
  const recommendedNote = requireRecommendationNote(flags['recommend-note'], recommended);
  const wantsBrowser = !flags['no-open'];
  const headless = wantsBrowser ? headlessReason() : null;
  if (headless) {
    throw new CapabilityError(`ui-design: no browser can open here (${headless}); the recommended variant stands`);
  }

  const { url, answer } = await serve(variants, randomBytes(8).toString('hex'), { words, recommended, recommendedNote, intrinsic }, timeoutSeconds);
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
