import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createReadStream, readFileSync, realpathSync } from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { CHROME_TOKENS, escapeHtml } from '#page-chrome';
import {
  capture, CapabilityError, DEFAULT_VIEWPORTS, parseFlags, parseViewport, readJsonFlag, UsageError
} from './capture.mjs';
import { applyNotesTable, renderedAudit, staticAudit } from './check-ui.mjs';
import { isMain } from '#script-flags';

const DEFAULT_TIMEOUT_SECONDS = 600;
const DEFAULT_FRAME = null;

// why: a frame sandboxed without allow-same-origin sends Origin 'null', so a bundled comp's module scripts stay blocked unless the server answers that origin.
const OPAQUE_ORIGIN = 'null';

const CHECK_VIEWPORTS = DEFAULT_VIEWPORTS.map(parseViewport);
const CHECKED_DIRECTORY = 'checked';

const DEFAULT_LABELS = JSON.parse(readFileSync(new URL('../assets/pick-labels.json', import.meta.url), 'utf8'));

const NUMBERED_LABELS = ['fallbackTitle'];
const LANGUAGE_TAG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

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

const DEMO_SHIM = `<script>
(() => {
  const swallow = (event) => {
    const anchor = event.target.closest?.('a[href]');
    if (anchor && !anchor.getAttribute('href').startsWith('#')) event.preventDefault();
  };
  addEventListener('click', swallow, true);
  addEventListener('submit', (event) => event.preventDefault(), true);
  window.open = () => null;
})();
</script>`;

const COMP_RESET = '*,*::before,*::after{box-sizing:border-box}'
  + 'html,body{margin:0;padding:0;width:100%;min-height:100%}'
  + 'img,svg,video,canvas{display:block;max-width:100%}'
  + 'button,input,select,textarea{font:inherit;color:inherit}';

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

const INDEX_MARKER = '{n}';

function requireUrlTemplate(text) {
  if (text === undefined) return null;
  let parsed;
  try {
    parsed = new URL(text.replaceAll(INDEX_MARKER, '0'));
  } catch {
    throw new UsageError(`--url must be an http(s) URL, received '${text}'`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new UsageError(`--url must be an http(s) URL, received '${text}'`);
  if (!text.includes(INDEX_MARKER)) throw new UsageError(`--url needs ${INDEX_MARKER} where the variant index goes, or every tab shows one comp`);
  return text;
}

function requireSourceTemplate(text, urlTemplate) {
  if (urlTemplate === null) {
    if (text !== undefined) throw new UsageError('--source belongs to --url; a served comp is its own source');
    return null;
  }
  if (text === undefined) throw new UsageError('--url needs --source, the folder holding each comp\'s source');
  if (!text.includes(INDEX_MARKER)) throw new UsageError(`--source needs ${INDEX_MARKER} where the variant index goes`);
  return text;
}

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
  }
}

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
  const width = meta?.width ?? fallback?.width ?? null;
  const height = meta?.height ?? fallback?.height ?? null;
  const fits = (value) => value === null || (Number.isInteger(value) && value >= 200);
  if (!fits(width) || !fits(height)) {
    throw new UsageError(`'${directory}/meta.json' needs whole width and height from 200`);
  }
  return width === null ? null : { width, height };
}

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

function readSignature(contract, index) {
  const written = contract?.signature;
  if (written === undefined || written === null) return null;
  if (typeof written !== 'object' || Array.isArray(written)) {
    throw new UsageError(`contract ${index} has a signature that is not an object`);
  }
  const where = `contract ${index} signature`;

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
      code: /^#[0-9a-f]{3,8}$/i.test(value) ? value.toUpperCase() : value
    };
  });

  if (!face && swatches.length === 0) return null;
  return { face, fontHref, swatches };
}

export async function loadVariants(compsDirectory, contractsFile, { frame = DEFAULT_FRAME, url = null, source = null } = {}) {
  if (!compsDirectory) throw new UsageError('--comps is required');
  let root;
  try {
    // why: resolveAsset compares real paths, and on macOS a temp dir resolves into /private.
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
      url: url?.replaceAll(INDEX_MARKER, String(index)) ?? null,
      source: source ? path.resolve(source.replaceAll(INDEX_MARKER, String(index))) : null,
      contract,
      signature: readSignature(contract, index)
    });
  }
  return variants;
}

async function seatReady(variant) {
  if (variant.ready) return true;
  if (variant.url) {
    if (!(await fs.stat(variant.source).catch(() => null))?.isDirectory()) return false;
    const answered = await fetch(variant.url).then((response) => response.ok, () => false);
    variant.ready = answered;
    return answered;
  }
  if (!(await fs.stat(path.join(variant.directory, 'index.html')).catch(() => null))?.isFile()) return false;
  try {
    variant.directory = realpathSync(variant.directory);
  } catch {
    return false;
  }
  variant.ready = true;
  return true;
}

const COMP_POLL_MS = 250;

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

function page(variants, key, { words, recommended, recommendedNote }) {
  const seated = recommended === null
    ? variants
    : [variants[recommended], ...variants.filter((variant) => variant.index !== recommended)];

  const signature = (written) => {
    if (!written) return '';
    const faceName = written.face?.name ?? '';
    const face = written.face
      ? `<span class="face" style="--face:${escapeHtml(written.face.stack)}" title="${escapeHtml(`${words.typeRole}: ${faceName}`)}"><span class="face-sample" aria-hidden="true">Aa</span><span class="words"><span class="role">${escapeHtml(words.typeRole)}</span> <span class="tone">${escapeHtml(faceName)}</span></span></span>`
      : '';
    const swatches = written.swatches.map((swatch) => {
      const tooltip = [swatch.role, swatch.name, swatch.code].filter(Boolean).join(' · ');
      return `<span class="swatch" style="--swatch:${escapeHtml(swatch.value)}" title="${escapeHtml(tooltip)}"><span class="chip" aria-hidden="true"></span><span class="words"><span class="role">${escapeHtml(swatch.role)}</span> <span class="tone">${escapeHtml(swatch.name)}</span> <code>${escapeHtml(swatch.code)}</code></span></span>`;
    }).join('');
    return `<span class="signature">${face}${swatches}</span>`;
  };

  const titleOf = (variant, seat) => variant.contract?.title ?? fillPosition(words.fallbackTitle, seatMark(seat));
  const descriptionOf = (variant) => variant.contract?.description ?? '';

  const tab = (variant, seat) => {
    const title = titleOf(variant, seat);
    const isPick = variant.index === recommended;
    const active = seat === 0;
    return `<button type="button" role="tab" class="tab${isPick ? ' recommended' : ''}" id="tab-${variant.index}" aria-controls="panel-${variant.index}" aria-selected="${active}" tabindex="${active ? 0 : -1}" data-index="${variant.index}" data-description="${escapeHtml(descriptionOf(variant))}"><span class="ordinal">${seatMark(seat)}</span><span class="label" title="${escapeHtml(title)}">${escapeHtml(title)}</span>${isPick ? `<span class="badge">${escapeHtml(words.recommended)}</span>` : ''}${signature(variant.signature)}</button>`;
  };

  // The comp at scale 1, as wide as the panel unless a frame width was set, and
  // as tall as the room left, so the comp scrolls inside its own frame.
  const panel = (variant, seat) => {
    const title = titleOf(variant, seat);
    const width = variant.frame?.width ? ` style="inline-size:${variant.frame.width}px"` : '';
    // A dev-server comp keeps its own origin, because its server answers module
    // scripts for that origin alone. That origin is another port, so the frame
    // still cannot reach this page or post an answer. A served comp shares this
    // page's origin and must stay opaque.
    const sandbox = variant.url ? 'allow-scripts allow-same-origin' : 'allow-scripts';
    const source = variant.url ?? `/k/${key}/v/${variant.index}/index.html`;
    return `<section class="panel" role="tabpanel" id="panel-${variant.index}" aria-labelledby="tab-${variant.index}" data-index="${variant.index}"${seat === 0 ? '' : ' hidden'}><iframe sandbox="${sandbox}" loading="eager" title="${escapeHtml(title)}" src="${escapeHtml(source)}"${width}></iframe></section>`;
  };

  const fontLinks = [...new Set(seated.map((variant) => variant.signature?.fontHref).filter(Boolean))]
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`).join('\n');

  const why = recommendedNote
    ? `<p class="why"><span class="why-mark" aria-hidden="true">&#9733;</span>${escapeHtml(recommendedNote)}</p>`
    : '';
  const first = seated[0];
  const firstTitle = titleOf(first, 0);

  return `<!doctype html>
<html lang="${escapeHtml(words.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(words.title)}</title>
${fontLinks}
<style>
  @layer tokens, base, layout, components;
  @layer tokens {
    :root {
${CHROME_TOKENS}
      /* Dark and neutral whatever the system theme: a light chrome competes
         with each comp's own ground, a dark neutral one recedes behind it. */
      color-scheme: dark;
      --radius-card: 12px;
      --gap: 8px;
      --pad: 12px;
    }
  }
  @layer base {
    * { box-sizing: border-box; }
    html, body { block-size: 100%; overflow: hidden; }
    body {
      margin: 0; color: var(--ink); background: var(--ground);
      font: 14px/1.5 var(--font-stack);
      font-variant-numeric: tabular-nums;
      /* The bar, the strip and the description take what they need and the
         panel every pixel left, which is the comp's own viewport height. */
      display: grid; grid-template-rows: auto auto auto minmax(0, 1fr); row-gap: var(--gap);
      padding: var(--pad);
    }
    ::selection { background: var(--accent); color: var(--accent-ink); }
    :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    [hidden] { display: none !important; }
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
    .tabs { display: flex; gap: 4px; overflow-x: auto; border-block-end: 1px solid var(--border); }
    .panels { display: grid; min-block-size: 0; }
    .panel { display: grid; justify-items: center; min-block-size: 0; }
  }
  @layer components {
    .tab {
      display: inline-flex; align-items: center; gap: 6px; flex: none; max-inline-size: 40ch;
      min-block-size: 36px; padding: 6px 10px; margin-block-end: -1px;
      font: inherit; font-weight: 600; color: var(--ink-muted); cursor: pointer;
      background: transparent; border: 1px solid transparent; border-block-end-color: var(--border);
      border-radius: var(--radius-control) var(--radius-control) 0 0;
      transition: color 160ms cubic-bezier(0.16, 1, 0.3, 1), background-color 160ms cubic-bezier(0.16, 1, 0.3, 1);
    }
    .tab:hover { color: var(--ink); }
    .tab[aria-selected="true"] {
      color: var(--ink); background: var(--surface);
      border-color: var(--border); border-block-end-color: var(--surface);
    }
    .label { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    /* One line, cut with an ellipsis and whole in the tooltip. */
    .description {
      margin: 0; min-block-size: 1.5em; color: var(--ink-muted); font-size: 13px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .ordinal {
      display: grid; place-items: center; inline-size: 20px; block-size: 20px; flex: none;
      border-radius: 999px; background: var(--accent); color: var(--accent-ink);
      font-size: 11px; font-weight: 650;
    }
    /* Filled, not outlined: an outline reads as a direction already chosen, and
       the badge has to carry the recommendation alone. */
    .badge {
      flex: none; padding: 1px 7px; border-radius: 999px;
      font-size: 10.5px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase;
      background: var(--accent); color: var(--accent-ink);
    }
    .signature { display: inline-flex; align-items: center; gap: 4px; flex: none; }
    .signature > span { position: relative; display: grid; place-items: center; }
    .face-sample { font-family: var(--face); font-size: 16px; line-height: 1; padding-inline: 2px 4px; color: var(--ink); }
    .chip {
      inline-size: 14px; block-size: 14px; border-radius: 4px;
      background: var(--swatch);
      border: 1px solid oklch(from var(--ink) l c h / 0.28);
    }
    /* Scale 1, never a transform: the comp is the page at its real size. */
    .panel iframe {
      display: block; border: 1px solid var(--border); border-radius: var(--radius-card);
      inline-size: 100%; max-inline-size: 100%; block-size: 100%;
      background: var(--surface);
    }
    button.choose, .steer input { min-block-size: 32px; border-radius: var(--radius-control); }
    button.choose {
      font: inherit; font-weight: 550; flex: none; padding-inline: 12px; cursor: pointer; white-space: nowrap;
      background: var(--accent); color: var(--accent-ink); border: 1px solid transparent;
      transition: background-color 160ms cubic-bezier(0.16, 1, 0.3, 1);
    }
    button.choose:hover { background: color-mix(in oklch, var(--accent) 88%, var(--ink)); }
    @media (pointer: coarse) { button.choose, .tab { min-block-size: 44px; } }
    .why { display: flex; align-items: baseline; gap: 6px; margin: 0; font-size: 13px; }
    .why-mark { flex: none; color: var(--accent); }
    .steer { display: flex; align-items: center; gap: 8px; flex: 0 1 380px; color: var(--ink-muted); font-size: 13px; }
    .steer input {
      flex: 1; min-inline-size: 0; padding-inline: 10px;
      font: inherit; color: var(--ink); background: var(--surface);
      border: 1px solid var(--border-control); caret-color: var(--accent);
    }
    .alert { margin: 0; font-size: 13px; font-weight: 600; }
    /* Between the click and the answer there is a network hop, and a screen that
       shows nothing for it reads as a click that missed. */
    body.deciding { pointer-events: none; }
    body.deciding .tab:not(.choosing) { opacity: 0.5; }
    .tab.choosing { box-shadow: inset 0 -3px 0 var(--accent); }
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
      button, .tab { transition-duration: 1ms; }
      .done { animation-duration: 1ms; }
    }
  }
</style></head>
<body>
<header>
  <div class="heading"><h1>${escapeHtml(words.title)}</h1><p class="hint">${escapeHtml(words.hint)}</p>${why}<p class="alert" id="alert" role="alert" hidden></p></div>
  <label class="steer"><span>${escapeHtml(words.steer)}</span><input id="steer" type="text" autocomplete="off"></label>
  <button type="button" class="choose" id="choose" data-choose="${first.index}" aria-label="${escapeHtml(`${words.choose}: ${firstTitle}`)}">${escapeHtml(words.choose)}</button>
</header>
<div class="tabs" role="tablist" aria-label="${escapeHtml(words.tabs)}">
${seated.map(tab).join('\n')}
</div>
<p class="description" id="description" title="${escapeHtml(descriptionOf(first))}">${escapeHtml(descriptionOf(first))}</p>
<div class="panels">
${seated.map(panel).join('\n')}
</div>
<script>
  const key = ${JSON.stringify(key)};
  const chooseTemplate = ${JSON.stringify(words.choose)};
  const doneTemplate = ${JSON.stringify(words.done)};
  const failedTemplate = ${JSON.stringify(words.failed)};
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const chooseButton = document.getElementById('choose');
  const description = document.getElementById('description');
  // A tab's seat is where it sits in the strip; its index is the variant it
  // serves. The two stop matching once the recommendation takes the first seat,
  // so the Choose button always carries the index, never the seat.
  let activeSeat = 0;

  function activate(seat, focus) {
    activeSeat = seat;
    tabs.forEach((tab, at) => {
      const on = at === seat;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !on;
    });
    const tab = tabs[seat];
    const title = tab.querySelector('.label').textContent;
    chooseButton.dataset.choose = tab.dataset.index;
    chooseButton.setAttribute('aria-label', chooseTemplate + ': ' + title);
    description.textContent = tab.dataset.description;
    description.title = tab.dataset.description;
    if (focus) tab.focus();
  }

  async function choose(index) {
    const steer = document.getElementById('steer').value;
    const alert = document.getElementById('alert');
    alert.hidden = true;
    for (const each of document.querySelectorAll('button')) each.disabled = true;
    const chosen = document.getElementById('tab-' + index);
    chosen.classList.add('choosing');
    document.body.classList.add('deciding');
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
      document.body.classList.remove('deciding');
      alert.textContent = failedTemplate;
      alert.hidden = false;
      return;
    }
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
    const tab = event.target.closest('[role="tab"]');
    if (tab) activate(tabs.indexOf(tab), true);
  });

  /** The seat a letter names, or null for a key that names none. */
  function seatFromKey(pressed) {
    if (pressed.length !== 1) return null;
    const seat = pressed.toUpperCase().charCodeAt(0) - 65;
    return seat >= 0 && seat < tabs.length ? seat : null;
  }

  // Keys pressed inside a comp stay in its frame, so the comp scrolls; only the
  // picker's own page reads these.
  addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    // The note field invites free text, so a letter typed there is a character,
    // not a tab; without this a note starting "beter met meer wit" shows B.
    if (event.target.closest('textarea, input, [contenteditable]')) return;
    if (event.target.closest('[role="tab"]')) {
      const count = tabs.length;
      const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (step) {
        event.preventDefault();
        return void activate(((activeSeat + step) % count + count) % count, true);
      }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        return void activate(event.key === 'Home' ? 0 : count - 1, true);
      }
    }
    // A letter shows that direction and never chooses it: the answer is the
    // Choose button alone.
    const seat = seatFromKey(event.key);
    if (seat !== null) activate(seat, event.target.closest('[role="tab"]') !== null);
  });
</script></body></html>`;
}

export function send(response, status, type, body) {
  response.writeHead(status, type ? { 'content-type': type } : {});
  response.end(body);
}

export async function resolveAsset(variant, relative) {
  let decoded;
  try {
    decoded = decodeURIComponent(relative);
  } catch {
    return null;
  }
  const target = path.resolve(variant.directory, decoded);
  if (target !== variant.directory && !target.startsWith(variant.directory + path.sep)) return null;
  if (!(await fs.stat(target).catch(() => null))?.isFile()) return null;
  let real;
  try {
    real = realpathSync(target);
  } catch {
    return null;
  }
  return real === variant.directory || real.startsWith(variant.directory + path.sep) ? real : null;
}

export function askedOfLoopback(request, port) {
  return [`127.0.0.1:${port}`, `localhost:${port}`].includes(request.headers.host);
}

export function sentByOwnPage(request, port) {
  const origin = request.headers.origin;
  const foreignOrigin = origin !== undefined
    && ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(origin);
  const isJson = (request.headers['content-type'] ?? '').startsWith('application/json');
  return !foreignOrigin && isJson;
}

async function startServer(variants, key, presentation, onAnswer) {
  const server = http.createServer(async (request, response) => {
    const { port } = server.address();
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    if (!askedOfLoopback(request, port)) return send(response, 403, null, '');

    const asset = new RegExp(`^/k/${key}/v/(\\d+)/(.+)$`).exec(url.pathname);
    if (request.method === 'GET' && asset && variants[Number(asset[1])]) {
      const variant = variants[Number(asset[1])];
      const file = await resolveAsset(variant, asset[2]);
      if (!file) return send(response, 404, null, '');
      const type = MEDIA_TYPES.get(path.extname(file).toLowerCase()) ?? 'application/octet-stream';
      if (!type.startsWith('text/html')) {
        const headers = { 'content-type': type };
        if (request.headers.origin === OPAQUE_ORIGIN) headers['access-control-allow-origin'] = OPAQUE_ORIGIN;
        response.writeHead(200, headers);
        return createReadStream(file).pipe(response);
      }
      const markup = await fs.readFile(file, 'utf8');
      return send(response, 200, type, compDocument(markup, presentation.words.lang));
    }

    if (!onAnswer || url.searchParams.get('key') !== key) return send(response, 403, null, '');
    if (request.method === 'GET' && url.pathname === '/') {
      return send(response, 200, 'text/html; charset=utf-8', page(variants, key, presentation));
    }
    if (request.method !== 'POST' || url.pathname !== '/answer') return send(response, 404, null, '');

    if (!sentByOwnPage(request, port)) return send(response, 403, null, '');

    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      let parsed = null;
      try { parsed = JSON.parse(body); } catch { }
      const variant = Number.isInteger(parsed?.index) ? variants[parsed.index] : undefined;
      if (!variant) return send(response, 400, 'application/json', '{"ok":false}');
      send(response, 200, 'application/json', '{"ok":true}');
      onAnswer({ index: variant.index, label: variant.label, steer: typeof parsed.steer === 'string' ? parsed.steer.trim() : '' });
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const close = () => {
    server.close();
    server.closeAllConnections();
  };
  return { origin, close };
}

async function serve(variants, key, presentation, timeoutSeconds, deadline) {
  let settle;
  const answer = new Promise((resolve, reject) => {
    settle = (error, value) => {
      clearTimeout(timer);
      close();
      if (error) reject(error);
      else resolve(value);
    };
  });
  const { origin, close } = await startServer(variants, key, presentation, (value) => settle(null, value));
  const timer = setTimeout(
    () => settle(new CapabilityError(`ui-design: no choice arrived within ${timeoutSeconds}s; the recommended variant stands`)),
    Math.max(0, deadline - Date.now()));
  return { url: `${origin}/?key=${key}`, answer };
}

async function newestCompTime(directory) {
  let newest = 0;
  for (const entry of await fs.readdir(directory, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const full = path.join(entry.parentPath ?? entry.path, entry.name);
    const relative = path.relative(directory, full);
    if (relative.split(path.sep)[0] === CHECKED_DIRECTORY) continue;
    newest = Math.max(newest, (await fs.stat(full)).mtimeMs);
  }
  return newest;
}

async function requireFreshChecks(variants) {
  for (const variant of variants) {
    const newest = await newestCompTime(variant.source ?? variant.directory);
    for (const { width, height } of CHECK_VIEWPORTS) {
      const names = [`comp-${width}x${height}.png`, `comp-${width}x${height}-fullpage.png`];
      const times = await Promise.all(names.map((name) =>
        fs.stat(path.join(variant.directory, CHECKED_DIRECTORY, name)).then((stat) => stat.mtimeMs, () => -1)));
      if (Math.max(...times) < newest) {
        throw new UsageError(`${variant.label} has no capture at ${width} newer than its comp; run pick.mjs --check and view the captures before the picker`);
      }
    }
  }
}

async function check(variants, words) {
  for (const variant of variants) {
    if (await seatReady(variant)) continue;
    if (variant.url) throw new UsageError(`${variant.label}: ${variant.source} is missing or ${variant.url} does not answer; start the dev server before --check`);
    throw new UsageError(`${variant.label}/index.html is missing; write every comp before --check`);
  }
  const key = randomBytes(8).toString('hex');
  const { origin, close } = await startServer(variants, key, { words }, null);
  let fullPage = true;
  try {
    for (const variant of variants) {
      const url = variant.url ?? `${origin}/k/${key}/v/${variant.index}/index.html`;
      const outputDirectory = path.join(variant.directory, CHECKED_DIRECTORY);
      const shoot = (wholePage) => capture({
        url, viewports: CHECK_VIEWPORTS, fullPage: wholePage, colorScheme: 'no-preference',
        label: 'comp', outputDirectory, cwd: process.cwd()
      });
      let records;
      try {
        ({ records } = await shoot(fullPage));
      } catch (error) {
        if (!(error instanceof CapabilityError) || error.payload?.capability !== 'full-page') throw error;
        process.stderr.write('ui-design: full-page capture needs Playwright; comps captured at the viewport height only\n');
        fullPage = false;
        ({ records } = await shoot(false));
      }

      const staticFindings = await staticAudit(variant.source ?? variant.directory);
      const rendered = await renderedAudit({ url, viewports: CHECK_VIEWPORTS, cwd: process.cwd() });
      const findings = [
        ...staticFindings,
        ...(rendered.fixed?.findings ?? []),
        ...Object.values(rendered.viewports ?? {}).flatMap((entry) => entry.findings ?? [])
      ];
      const report = { static: { status: 'ok', findings: staticFindings }, rendered };
      report.notes = applyNotesTable(findings);
      const checkUi = path.join(outputDirectory, 'check-ui.json');
      await fs.writeFile(checkUi, `${JSON.stringify(report)}\n`);
      process.stdout.write(`${JSON.stringify({
        index: variant.index, captures: records.map((record) => record.path), fullPage, findings: findings.length, checkUi
      })}\n`);
    }
  } finally {
    close();
  }
}

function requireVariant(text, variants) {
  if (text === undefined) return variants;
  const index = Number(text);
  if (!Number.isInteger(index) || !variants[index]) {
    throw new UsageError(`--variant must be a variant index from 0 to ${variants.length - 1}, received '${text}'`);
  }
  return [variants[index]];
}

const USAGE = `Usage:
  node scripts/pick.mjs --comps <dir> --contracts <contracts.json>
                        [--labels <labels.json>] [--intrinsic]
                        [--frame <width>x<height>, default full width]
                        [--recommend <n>] [--recommend-note <one sentence>]
                        [--timeout <seconds, default 600>] [--no-open]
                        [--unchecked]
                        [--url <template> --source <template>]
  node scripts/pick.mjs --check --comps <dir> --contracts <contracts.json>
                        [--labels <labels.json>] [--variant <n>]
                        [--url <template> --source <template>]

Shows every direction comp live, one per tab, and prints {"index","label","steer"} for the choice.
--comps holds variant-0, variant-1, ... each with an index.html; contracts[i] is variant i.
--check captures every comp at 390 and 1440 wide and audits it; the picker refuses stale captures.
--unchecked skips that gate, only when --check exited 3.
--url and --source serve comps from a dev server; '{n}' stands for the variant index.
Exit 2 is a usage error; exit 3 means no browser, comps that never landed, or no answer.
`;

async function main(argv) {
  const flags = parseFlags(argv, {
    comps: 'value', contracts: 'value', frame: 'value', intrinsic: 'boolean',
    labels: 'value', recommend: 'value', 'recommend-note': 'value',
    timeout: 'value', 'no-open': 'boolean', check: 'boolean', unchecked: 'boolean',
    url: 'value', source: 'value', variant: 'value'
  }, { usage: USAGE });
  const urlTemplate = requireUrlTemplate(flags.url);
  const source = requireSourceTemplate(flags.source, urlTemplate);
  if (flags.check) {
    const variants = await loadVariants(flags.comps, flags.contracts, { url: urlTemplate, source });
    return check(requireVariant(flags.variant, variants), await readLabels(flags.labels));
  }
  if (flags.variant !== undefined) throw new UsageError('--variant belongs to --check; the picker shows every comp');
  const timeoutSeconds = requireTimeout(flags.timeout);
  const words = await readLabels(flags.labels);
  const frame = requireFrame(flags.frame);
  const intrinsic = Boolean(flags.intrinsic);
  const variants = await loadVariants(flags.comps, flags.contracts, { frame, url: urlTemplate, source });
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
  if (flags.unchecked) process.stderr.write('ui-design: comps shown unchecked\n');
  else await requireFreshChecks(variants);

  const { url, answer } = await serve(variants, randomBytes(8).toString('hex'), { words, recommended, recommendedNote }, timeoutSeconds, deadline);
  const waitedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  process.stderr.write(`ui-design: every comp landed after ${waitedSeconds}s\n`);
  process.stderr.write(`ui-design: pick URL ${url}\n`);
  if (wantsBrowser) openSystemBrowser(url);
  const chosen = await answer;
  process.stdout.write(`${JSON.stringify(chosen)}\n`);
}

if (isMain(import.meta.url)) {
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
