// Deterministic UI checks: source tells that need no browser, and rendered
// accessibility checks that follow WCAG 2.2 AA. The output is a diagnostic set,
// never a beauty score, and the script emits no aggregate quality number.
//
//   node scripts/check-ui.mjs [--url <url>] [--source <dir>] [--viewport <width>x<height>]

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { openDrivenPage, parseFlags, parseViewport, requireUrl, UsageError } from './capture.mjs';
import { isOverusedFamily, loadOverusedFonts } from './overused-fonts.mjs';

const SOURCE_EXTENSIONS = new Set([
  '.css', '.scss', '.html', '.htm', '.js', '.jsx', '.mjs', '.ts', '.tsx', '.vue', '.svelte', '.astro'
]);
const MARKUP_EXTENSIONS = new Set(['.html', '.htm', '.jsx', '.tsx', '.vue', '.svelte', '.astro']);
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'out']);

function finding({ type, confidence, selector, measured, threshold, note }) {
  return { type, confidence, selector, measured, threshold, note };
}

async function* sourceFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name) || entry.name.startsWith('.')) continue;
      yield* sourceFiles(full);
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      yield full;
    }
  }
}

const LINE_TELLS = [
  {
    type: 'transition-all',
    confidence: 'definite',
    pattern: /transition(?:-property)?\s*:\s*[^;}"']*\ball\b/i,
    threshold: 'each transitioned property is named',
    note: 'transition: all animates properties nobody chose'
  },
  {
    type: 'inline-event-handler',
    confidence: 'definite',
    pattern: /\son[a-z]+\s*=\s*["'][^"']/i,
    threshold: 'events wired with addEventListener or the framework idiom',
    note: 'inline event handler in markup'
  },
  {
    type: 'important-override',
    confidence: 'definite',
    pattern: /!\s*important/i,
    threshold: 'overrides resolved through @layer order',
    note: '!important resolves a cascade conflict by weight'
  },
  {
    type: 'placeholder-copy',
    confidence: 'definite',
    pattern: /lorem ipsum|dolor sit amet|your text here|placeholder text/i,
    threshold: 'real copy for the real subject',
    note: 'placeholder copy shipped in the markup'
  },
  {
    type: 'float-layout',
    confidence: 'potential',
    pattern: /(^|[;{\s])float\s*:\s*(left|right)/i,
    threshold: 'float only for text wrapping around an image',
    note: 'float used for layout unless this wraps text around an image'
  },
  {
    type: 'gradient-text',
    confidence: 'definite',
    oncePerFile: true,
    pattern: /(?:-webkit-)?background-clip\s*:\s*text\b/i,
    threshold: 'display text set in one ink',
    note: 'gradient-filled text, the template hero signature'
  },
  {
    // First stop is a color with alpha; position is absent, `circle`, `at center` or `at 50%`.
    type: 'radial-halo',
    confidence: 'potential',
    pattern: /background(?:-image)?\s*:[^;{}]*?radial-gradient\(\s*(?:(?:circle|ellipse)?\s*(?:at\s+(?:center(?:\s+center)?|50%(?:\s+50%)?))?\s*,\s*)?(?:rgba\(|hsla\(|rgba?\([^)]*\/|hsla?\([^)]*\/|#[0-9a-f]{4}\b|#[0-9a-f]{8}\b)/i,
    threshold: 'a ground with a source, direction, or subject-derived shape',
    note: 'centered translucent radial halo behind content'
  },
  {
    type: 'physical-direction-property',
    confidence: 'potential',
    oncePerFile: true,
    pattern: /(?:margin|padding|border|inset)-(?:left|right)\s*:|text-align\s*:\s*(?:left|right)\b/i,
    threshold: 'flow-relative properties, or a recorded reason for a screen-anchored edge',
    note: 'a physical edge does not mirror under dir="rtl"'
  }
];

// Markup tells read over the whole file rather than one line, because the attribute
// that is missing is often several lines below the tag that should carry it.
const OPEN_TAG = (name) => new RegExp(`<${name}\\b[^>]*>`, 'gis');

function tagFindings(text, relative, { tag, type, required, confidence, threshold, note }) {
  const findings = [];
  for (const match of text.matchAll(OPEN_TAG(tag))) {
    if (required.test(match[0])) continue;
    const line = text.slice(0, match.index).split(/\r?\n/).length;
    findings.push(finding({
      type,
      confidence,
      selector: `${relative}:${line}`,
      measured: match[0].replace(/\s+/g, ' ').slice(0, 80),
      threshold,
      note
    }));
  }
  return findings;
}

function markupFindings(text, relative) {
  const findings = [
    ...tagFindings(text, relative, {
      tag: 'svg', type: 'svg-without-viewbox', required: /\bviewBox\s*=/i, confidence: 'definite',
      threshold: 'every inline SVG carries a viewBox',
      note: 'without a viewBox the icon cannot scale to its container and may clip'
    }),
    ...tagFindings(text, relative, {
      tag: 'img', type: 'image-without-alt', required: /\balt\s*=/i, confidence: 'definite',
      threshold: 'every img carries an alt attribute, empty for decorative images',
      note: 'a missing alt is not the same as alt="" and reads as an unnamed image'
    }),
    ...tagFindings(text, relative, {
      tag: 'img', type: 'image-without-dimensions',
      required: /\b(width|height|aspect-ratio|style|class|className)\s*=/i, confidence: 'potential',
      threshold: 'intrinsic width and height, or an aspect-ratio, reserve the space',
      note: 'an image with no reserved space shifts the layout when it arrives'
    })
  ];
  for (const match of text.matchAll(OPEN_TAG('img'))) {
    if (!/\bsrcset\s*=/i.test(match[0]) || /\bsizes\s*=/i.test(match[0])) continue;
    if (!/\d+w[\s"',]/.test(match[0])) continue;
    const line = text.slice(0, match.index).split(/\r?\n/).length;
    findings.push(finding({
      type: 'srcset-without-sizes',
      confidence: 'definite',
      selector: `${relative}:${line}`,
      measured: match[0].replace(/\s+/g, ' ').slice(0, 80),
      threshold: 'a w-descriptor srcset is paired with a sizes attribute',
      note: 'without sizes the browser assumes 100vw and downloads a larger image than the slot needs'
    }));
  }
  if (/<html\b/i.test(text)) {
    findings.push(...tagFindings(text, relative, {
      tag: 'html', type: 'missing-lang-attribute', required: /\blang\s*=/i, confidence: 'definite',
      threshold: 'the html element declares a language',
      note: 'language selects pronunciation, hyphenation, and quotation marks'
    }));
  }
  return findings;
}

function inlineStyleFindings(line, location) {
  const findings = [];
  for (const match of line.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)) {
    const declarations = match[1].split(';').map((part) => part.trim()).filter(Boolean);
    if (declarations.length > 0 && declarations.every((declaration) => declaration.startsWith('--'))) continue;
    findings.push(finding({
      type: 'inline-style-attribute',
      confidence: 'definite',
      selector: location,
      measured: match[1].slice(0, 60),
      threshold: 'only per-instance custom-property data inline',
      note: 'styling belongs in the stylesheet'
    }));
  }
  return findings;
}

function rawValueFindings(line, location, insideTokenBlock) {
  if (insideTokenBlock) return [];
  const findings = [];
  const hex = line.match(/:\s*#[0-9a-fA-F]{3,8}\b/);
  if (hex) {
    findings.push(finding({
      type: 'raw-value-in-component-rule',
      confidence: 'potential',
      selector: location,
      measured: hex[0].trim(),
      threshold: 'colors derived from tokens',
      note: 'raw hex inside a component rule'
    }));
  }
  const pixels = [...line.matchAll(/:\s*(\d+(?:\.\d+)?)px/g)]
    .map((match) => Number(match[1]))
    .filter((value) => value > 3);
  if (pixels.length > 0) {
    findings.push(finding({
      type: 'raw-value-in-component-rule',
      confidence: 'potential',
      selector: location,
      measured: `${pixels[0]}px`,
      threshold: 'spacing, radius and type from tokens',
      note: 'ad-hoc pixel value inside a component rule'
    }));
  }
  return findings;
}

// --- slop tells: font names, markup structure, and rule-level stylesheet reads ---

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
// The tempered `(?:(?!<\/\1>)[\s\S])*?` stops the content at the kicker's own close tag, so
// only a heading directly after that tag matches, never one further down the section.
const KICKER_BEFORE_HEADING =
  /<(\w+)[^>]*\bclass(?:Name)?\s*=\s*["'][^"']*(?:eyebrow|kicker|overline)[^"']*["'][^>]*>(?:(?!<\/\1>)[\s\S])*?<\/\1>\s*<h[12]\b/gi;
const GROUND_SELECTOR = /(?:^|[\s,>+~])(?:body|html|main)(?![\w-])|hero/i;
const NEUTRAL_ALPHA = /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*([\d.]+)\s*\)|rgb\(\s*0\s+0\s+0\s*\/\s*([\d.]+)(%?)\s*\)/i;

function fontFindings(line, location, overused) {
  const match = /font-?family\s*:\s*([^;}\n]+)/i.exec(line);
  if (!match) return [];
  const [primary] = match[1].split(',');
  if (!isOverusedFamily(primary, overused)) return [];
  return [finding({
    type: 'overused-font',
    confidence: 'definite',
    selector: location,
    measured: primary.trim().replace(/^["']|["']$/g, ''),
    threshold: 'a family chosen from candidates the brief can justify',
    note: 'family on the overused list in scripts/overused-fonts.mjs'
  })];
}

function emojiFindings(line, location) {
  const text = line.replace(/<[^>]*>/g, ' ');
  if (!EMOJI.test(text)) return [];
  return [finding({
    type: 'emoji-in-markup',
    confidence: 'definite',
    selector: location,
    measured: text.trim().slice(0, 80),
    threshold: 'one icon family, or real content',
    note: 'emoji in markup text, doing icon or bullet duty unless it is real content'
  })];
}

function kickerFindings(text, relative) {
  return [...text.matchAll(KICKER_BEFORE_HEADING)].map((match) => finding({
    type: 'kicker-above-heading',
    confidence: 'definite',
    selector: `${relative}:${text.slice(0, match.index).split('\n').length}`,
    measured: match[0].replace(/\s+/g, ' ').slice(0, 80),
    threshold: 'hierarchy carried by the heading itself',
    note: 'eyebrow/kicker/overline label stacked over the heading'
  }));
}

/** Flat `selector { body }` pairs; a nested rule yields its innermost selector, at-rules are skipped. */
function cssRules(text, relative) {
  const rules = [];
  for (const match of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].replace(/\/\*[\s\S]*?\*\//g, '').trim().replace(/\s+/g, ' ');
    if (!selector || selector.startsWith('@')) continue;
    const offset = match.index + match[1].length - match[1].trimStart().length;
    rules.push({ selector, body: match[2], location: `${relative}:${text.slice(0, offset).split('\n').length}` });
  }
  return rules;
}

function declaration(body, property) {
  const match = new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*([^;]+)`, 'i').exec(body);
  return match ? match[1].trim() : null;
}

/** A length in CSS px; rem and em scale by 16, anything else is unknown. */
function lengthPx(token) {
  const match = /^(-?\d*\.?\d+)(px|rem|em)?$/.exec(token ?? '');
  if (!match) return null;
  return Number(match[1]) * (match[2] && match[2] !== 'px' ? 16 : 1);
}

/** [x, y, blur, spread?] of a single-layer shadow, or null for layered or unparsable values. */
function shadowLengths(value) {
  if (/,(?![^(]*\))/.test(value)) return null;
  const lengths = value.replace(/[a-z-]+\([^)]*\)|#[0-9a-f]+|\b[a-z]+\b/gi, ' ').trim().split(/\s+/).map(lengthPx);
  return lengths.length >= 3 && lengths.every((length) => length !== null) ? lengths : null;
}

/** A single-layer shadow in plain black at low alpha: the default every template ships. */
function untintedShadow(value, lengths) {
  const alpha = NEUTRAL_ALPHA.exec(value);
  if (!alpha || !lengths) return false;
  const opacity = alpha[1] !== undefined ? Number(alpha[1]) : Number(alpha[2]) / (alpha[3] ? 100 : 1);
  return opacity <= 0.2;
}

function parseColor(token) {
  const hex = /^#([0-9a-f]{3,8})$/i.exec(token);
  if (hex) {
    const digits = hex[1].length <= 4 ? hex[1].replace(/./g, '$&$&') : hex[1];
    if (digits.length !== 6 && digits.length !== 8) return null;
    return [0, 2, 4].map((start) => Number.parseInt(digits.slice(start, start + 2), 16));
  }
  const rgb = /^rgba?\(\s*([\d.]+)(%?)[\s,]+([\d.]+)(%?)[\s,]+([\d.]+)(%?)/i.exec(token);
  if (!rgb) return null;
  return [1, 3, 5].map((index) => Number(rgb[index]) * (rgb[index + 1] ? 2.55 : 1));
}

/** Hue in degrees, or null for a near-grey color whose hue means nothing. */
function hueOf([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta < 8) return null;
  const sector = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return (sector * 60 + 360) % 360;
}

/** Hue in degrees plus the model it was written in, or null for a near-grey stop. */
function stopHue(token) {
  const hsl = /^hsla?\(\s*(-?[\d.]+)(?:deg)?[\s,]+(-?[\d.]+)%/i.exec(token);
  if (hsl) return Number(hsl[2]) < 10 ? null : { model: 'hsl', hue: (Number(hsl[1]) % 360 + 360) % 360 };
  const oklch = /^oklch\(\s*[\d.]+%?[\s,]+([\d.]+)%?[\s,]+(-?[\d.]+)/i.exec(token);
  if (oklch) return Number(oklch[1]) < 0.03 ? null : { model: 'oklch', hue: (Number(oklch[2]) % 360 + 360) % 360 };
  const rgb = parseColor(token);
  const hue = rgb ? hueOf(rgb) : null;
  return hue === null ? null : { model: 'srgb', hue };
}

/** Circular hue distance between the first two stops, or null when they use different models. */
function gradientHueGap(value) {
  const stops = [...value.matchAll(/#[0-9a-f]{3,8}\b|(?:rgba?|hsla?|oklch)\([^)]*\)/gi)]
    .map((match) => stopHue(match[0]))
    .filter(Boolean);
  if (stops.length < 2 || stops[0].model !== stops[1].model) return null;
  const gap = Math.abs(stops[0].hue - stops[1].hue);
  return Math.min(gap, 360 - gap);
}

function ruleFindings(text, relative, shadows) {
  const findings = [];
  for (const { selector, body, location } of cssRules(text, relative)) {
    const where = `${selector} (${location})`;
    const shadow = declaration(body, 'box-shadow');
    const lengths = shadow ? shadowLengths(shadow) : null;
    if (shadow && untintedShadow(shadow, lengths)) {
      const key = shadow.toLowerCase().replace(/\s+/g, ' ');
      if (!shadows.has(key)) shadows.set(key, []);
      shadows.get(key).push({ selector, location });
    }
    if (lengths && lengths[2] >= 16 && /(?:^|[;\s])border\s*:\s*1px\b/i.test(body)) {
      findings.push(finding({
        type: 'thin-border-wide-shadow', confidence: 'potential', selector: where,
        measured: `border 1px with ${lengths[2]}px blur`, threshold: 'one depth cue per surface',
        note: 'hairline border and a wide soft shadow on the same surface'
      }));
    }
    const left = lengthPx((declaration(body, 'border-left(?:-width)?') ?? '').split(/\s+/)[0]);
    const radius = lengthPx((declaration(body, 'border-radius') ?? '').split(/\s+/)[0]);
    if (left !== null && left >= 3 && radius !== null && radius >= 8) {
      findings.push(finding({
        type: 'left-accent-card', confidence: 'potential', selector: where,
        measured: `border-left ${left}px, border-radius ${radius}px`, threshold: 'emphasis from hierarchy, not a stripe',
        note: 'rounded card with a left accent bar'
      }));
    }
    const background = declaration(body, 'background(?:-image)?');
    const gap = background && /linear-gradient\(/i.test(background) && GROUND_SELECTOR.test(selector)
      ? gradientHueGap(background)
      : null;
    if (gap !== null && gap >= 30) {
      findings.push(finding({
        type: 'aggressive-gradient-ground', confidence: 'potential', selector: where,
        measured: `${Math.round(gap)} degrees between the first two stops`, threshold: 'a ground hue the subject justifies',
        note: 'two-hue gradient on a page-level ground'
      }));
    }
  }
  return findings;
}

function uniformShadowFindings(shadows) {
  const findings = [];
  for (const [value, owners] of shadows) {
    const selectors = [...new Set(owners.map((owner) => owner.selector))];
    if (selectors.length < 3) continue;
    findings.push(finding({
      type: 'uniform-card-shadow', confidence: 'potential', selector: selectors.slice(0, 3).join(', '),
      measured: `${value} on ${selectors.length} selectors`, threshold: 'shadow varies with elevation and carries a tint',
      note: 'one untinted black shadow stamped on every surface'
    }));
  }
  return findings;
}

export async function staticAudit(directory) {
  const findings = [];
  const root = path.resolve(directory);
  const stats = await fs.stat(root).catch(() => null);
  if (!stats?.isDirectory()) throw new UsageError(`--source must be a directory: ${directory}`);
  const overused = loadOverusedFonts();
  const shadows = new Map();
  for await (const file of sourceFiles(root)) {
    const relative = path.relative(root, file) || path.basename(file);
    const extension = path.extname(file);
    const isStylesheet = ['.css', '.scss'].includes(extension);
    const isMarkup = MARKUP_EXTENSIONS.has(extension);
    const text = await fs.readFile(file, 'utf8');
    const lines = text.split(/\r?\n/);
    let insideTokenBlock = false;
    const reportedOnce = new Set();
    lines.forEach((line, index) => {
      const location = `${relative}:${index + 1}`;
      if (isStylesheet) {
        if (/:root|@theme|^\s*--/.test(line)) insideTokenBlock = true;
        else if (/^\s*}/.test(line)) insideTokenBlock = false;
      }
      for (const tell of LINE_TELLS) {
        if (!tell.pattern.test(line)) continue;
        if (tell.oncePerFile && reportedOnce.has(tell.type)) continue;
        if (tell.oncePerFile) reportedOnce.add(tell.type);
        findings.push(finding({
          type: tell.type,
          confidence: tell.confidence,
          selector: location,
          measured: line.trim().slice(0, 80),
          threshold: tell.threshold,
          note: tell.note
        }));
      }
      findings.push(...inlineStyleFindings(line, location));
      findings.push(...fontFindings(line, location, overused));
      if (isStylesheet) findings.push(...rawValueFindings(line, location, insideTokenBlock));
      if (isMarkup) findings.push(...emojiFindings(line, location));
    });
    if (isStylesheet) findings.push(...ruleFindings(text, relative, shadows));
    if (isMarkup) findings.push(...kickerFindings(text, relative));
    if (isMarkup) findings.push(...markupFindings(text, relative));
  }
  findings.push(...uniformShadowFindings(shadows));
  return findings;
}

// Passed into both in-page functions rather than written twice: `focusIndicatorFindings`
// compares the two joined strings, so a one-sided edit would silently stop reporting
// missing focus indicators instead of failing.
const FOCUS_SIGNATURE_PROPERTIES = ['outlineStyle', 'outlineWidth', 'outlineColor',
  'boxShadow', 'borderColor', 'backgroundColor', 'color'];

const PAGE_AUDIT = (focusProperties) => {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const paint = canvas.getContext('2d', { willReadFrequently: true });
  const toRgba = (value) => {
    paint.clearRect(0, 0, 1, 1);
    paint.fillStyle = 'rgba(0, 0, 0, 0)';
    paint.fillStyle = value;
    paint.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = paint.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: a / 255 };
  };
  // WCAG 2.x relative luminance, which pins the knee at 0.03928; inspect-render.mjs
  // linearizes against the sRGB spec's 0.04045 instead. Both read 8-bit channels, and
  // no 0..255 value scales into the gap between the two knees (10/255 = 0.039216,
  // 11/255 = 0.043137), so they agree exactly while each cites its own spec.
  const channel = (value) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  const luminance = ({ r, g, b }) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const ratio = (first, second) => {
    const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return Number(((light + 0.05) / (dark + 0.05)).toFixed(2));
  };
  const describe = (element) => {
    const id = element.id ? `#${element.id}` : '';
    const classes = typeof element.className === 'string' && element.className
      ? `.${element.className.trim().split(/\s+/).slice(0, 2).join('.')}`
      : '';
    return `${element.tagName.toLowerCase()}${id}${classes}`;
  };
  const isVisible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' &&
      parseFloat(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
  };
  const effectiveBackground = (element) => {
    let node = element;
    let uncertain = false;
    while (node) {
      const style = getComputedStyle(node);
      if (style.backgroundImage !== 'none') uncertain = true;
      if (parseFloat(style.opacity) < 1) uncertain = true;
      if (style.mixBlendMode !== 'normal') uncertain = true;
      if (style.backdropFilter && style.backdropFilter !== 'none') uncertain = true;
      const background = toRgba(style.backgroundColor);
      if (background.a >= 0.999) return { color: background, uncertain };
      if (background.a > 0) uncertain = true;
      node = node.parentElement;
    }
    return { color: { r: 255, g: 255, b: 255, a: 1 }, uncertain };
  };

  const findings = [];
  const push = (entry) => findings.push(entry);

  const textOwners = Array.from(document.querySelectorAll('body *')).filter((element) => {
    if (!isVisible(element)) return false;
    return Array.from(element.childNodes)
      .some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0);
  });
  for (const element of textOwners) {
    const style = getComputedStyle(element);
    const size = parseFloat(style.fontSize);
    const weight = Number.parseInt(style.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const foreground = toRgba(style.color);
    const background = effectiveBackground(element);
    if (foreground.a < 0.999) background.uncertain = true;
    const measured = ratio(foreground, background.color);
    const threshold = large ? 3 : 4.5;
    if (measured >= threshold) continue;
    push({
      type: large ? 'contrast-large-text' : 'contrast-normal-text',
      confidence: background.uncertain ? 'potential' : 'definite',
      selector: describe(element),
      measured: `${measured}:1 at ${size}px/${weight}`,
      threshold: `${threshold}:1`,
      note: background.uncertain
        ? 'effective background is composited, so the ratio is indeterminate'
        : 'text below the AA contrast minimum'
    });
  }

  const interactiveSelector =
    'a[href], button, input, select, textarea, summary, [role="button"], [role="link"], [role="tab"], [tabindex]:not([tabindex="-1"])';
  const controls = Array.from(document.querySelectorAll(interactiveSelector)).filter(isVisible);
  const boxes = controls.map((element) => ({ element, rect: element.getBoundingClientRect() }));
  const insideText = (element) => {
    const parent = element.parentElement;
    if (!parent) return false;
    const inline = ['inline', 'inline-block', 'inline-flex'].includes(getComputedStyle(element).display);
    const surrounding = Array.from(parent.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent.trim())
      .join('');
    return inline && surrounding.length > 0;
  };
  const spacingClear = (subject) => boxes.every(({ element, rect }) => {
    if (element === subject.element) return true;
    const dx = (subject.rect.left + subject.rect.width / 2) - (rect.left + rect.width / 2);
    const dy = (subject.rect.top + subject.rect.height / 2) - (rect.top + rect.height / 2);
    return Math.hypot(dx, dy) >= 24;
  });
  const equivalentExists = (subject) => boxes.some(({ element, rect }) => {
    if (element === subject.element) return false;
    const sameAction = element.getAttribute('href') === subject.element.getAttribute('href') ||
      element.textContent.trim() === subject.element.textContent.trim();
    return sameAction && rect.width >= 24 && rect.height >= 24;
  });

  for (const box of boxes) {
    const { element, rect } = box;
    const smallest = Math.min(rect.width, rect.height);
    if (smallest < 24) {
      const exempt = insideText(element) || equivalentExists(box) || spacingClear(box);
      if (!exempt) {
        push({
          type: 'target-size-minimum',
          confidence: element.matches('input:not([type]), input[type="checkbox"], input[type="radio"]')
            ? 'unknown'
            : 'definite',
          selector: describe(element),
          measured: `${Math.round(rect.width)}×${Math.round(rect.height)} CSS px`,
          threshold: '24×24 CSS px',
          note: 'below the AA (2.5.8) minimum and no measurable exception applies'
        });
      }
    } else if (smallest < 44) {
      push({
        type: 'target-size-enhanced',
        confidence: 'potential',
        selector: describe(element),
        measured: `${Math.round(rect.width)}×${Math.round(rect.height)} CSS px`,
        threshold: '44×44 CSS px',
        note: 'AAA (2.5.5) advisory only; the AA requirement is already met'
      });
    }

    const style = getComputedStyle(element);
    const borderWidth = parseFloat(style.borderTopWidth);
    if (borderWidth > 0 && style.borderTopStyle !== 'none') {
      const background = effectiveBackground(element.parentElement ?? element);
      const measured = ratio(toRgba(style.borderTopColor), background.color);
      if (measured < 3) {
        push({
          type: 'contrast-non-text-ui',
          confidence: background.uncertain ? 'potential' : 'definite',
          selector: describe(element),
          measured: `${measured}:1`,
          threshold: '3:1',
          note: 'the boundary identifying this control falls below AA non-text contrast'
        });
      }
    }
  }

  const anatomy = new Map();
  for (const element of Array.from(document.querySelectorAll('body *')).filter(isVisible)) {
    const style = getComputedStyle(element);
    const hasSurface = style.boxShadow !== 'none' ||
      toRgba(style.backgroundColor).a > 0 ||
      parseFloat(style.borderTopWidth) > 0;
    if (!hasSurface) continue;
    const signature = [
      style.borderWidth, style.borderStyle, style.borderColor,
      style.borderRadius, style.backgroundColor, style.boxShadow
    ].join(' | ');
    anatomy.set(signature, (anatomy.get(signature) ?? 0) + 1);
  }
  for (const [signature, count] of anatomy) {
    if (count < 6) continue;
    push({
      type: 'repeated-surface-anatomy',
      confidence: 'unknown',
      selector: signature.slice(0, 90),
      measured: `${count} elements`,
      threshold: 'diagnostic, no pass/fail',
      note: 'one surface anatomy repeated across the page'
    });
  }

  // Layout integrity: the three defects a reader calls "buggy" and a render can
  // prove without taste. Rects are measured once and every pass is bounded,
  // because the overlap and gap passes are quadratic.
  const LAYOUT_ELEMENT_LIMIT = 400;
  const related = (first, second) => first.contains(second) || second.contains(first);
  const ownsText = new Set(textOwners);

  // Any overflow other than `visible` clips at the padding box, so a text box
  // is compared on what actually shows. Without this a paragraph cut off by its
  // container still reports its full, unclipped height and reads as overlapping
  // whatever sits below the container.
  const clips = (style) => style.overflowY !== 'visible' || style.overflowX !== 'visible';
  const visibleRect = (element) => {
    const rect = element.getBoundingClientRect();
    let { top, bottom, left, right } = rect;
    for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      if (!clips(getComputedStyle(parent))) continue;
      const bounds = parent.getBoundingClientRect();
      top = Math.max(top, bounds.top);
      bottom = Math.min(bottom, bounds.bottom);
      left = Math.max(left, bounds.left);
      right = Math.min(right, bounds.right);
    }
    return { top, bottom, left, right, width: right - left, height: bottom - top };
  };

  // Clipping counts only where the box cuts off *text*. A box that hides a
  // decorative child - an oversized image, a rotated blob, a bleed glow - is
  // doing what overflow:hidden is for, so the descendant text boxes, not
  // scrollHeight alone, decide. Whether the reader can scroll the rest into
  // view is what separates a definite defect from a region worth a look, and
  // some engines report a stylesheet's `hidden` as `auto`, so the keyword only
  // raises confidence and never gates the finding.
  const clippedBoxes = Array.from(document.querySelectorAll('body *'))
    .filter(isVisible)
    .slice(0, LAYOUT_ELEMENT_LIMIT);
  for (const element of clippedBoxes) {
    const hidesBlock = element.scrollHeight - element.clientHeight > 1;
    const hidesInline = element.scrollWidth - element.clientWidth > 1;
    if (!hidesBlock && !hidesInline) continue;
    const style = getComputedStyle(element);
    const unreachable = [style.overflow, style.overflowY, style.overflowX]
      .some((value) => ['hidden', 'clip'].includes(value));
    const box = element.getBoundingClientRect();
    const carriers = ownsText.has(element) ? [element] : [];
    for (const descendant of element.querySelectorAll('*')) {
      if (ownsText.has(descendant)) carriers.push(descendant);
    }
    let worst = null;
    for (const carrier of carriers) {
      const rect = carrier.getBoundingClientRect();
      const below = hidesBlock ? rect.bottom - box.bottom : 0;
      const past = hidesInline ? rect.right - box.right : 0;
      const amount = Math.max(below, past);
      if (amount <= 2 || (worst && amount <= worst.amount)) continue;
      worst = { amount, axis: below >= past ? 'below' : 'past', carrier };
    }
    if (!worst) continue;
    push({
      type: 'content-clipped',
      confidence: unreachable ? 'definite' : 'potential',
      selector: `${describe(worst.carrier)} inside ${describe(element)}`,
      measured: `${Math.round(worst.amount)}px of text ${worst.axis} the box`,
      threshold: 'no clipped text',
      note: unreachable
        ? 'the box hides text it contains'
        : 'text runs past the box; a scrollable region is the exception'
    });
  }

  // Only block-level text boxes are compared. An inline element that wraps
  // reports one union rect spanning every line it occupies, so two ordinary
  // links in one paragraph would read as overlapping when nothing overlaps.
  const inFlowText = textOwners
    .filter((element) => {
      const style = getComputedStyle(element);
      if (!['static', 'relative'].includes(style.position)) return false;
      return !style.display.startsWith('inline') && style.display !== 'contents';
    })
    .slice(0, LAYOUT_ELEMENT_LIMIT)
    .map((element) => ({ element, rect: visibleRect(element) }))
    .filter(({ rect }) => rect.width > 0 && rect.height > 0);
  for (let first = 0; first < inFlowText.length; first += 1) {
    for (let second = first + 1; second < inFlowText.length; second += 1) {
      const a = inFlowText[first];
      const b = inFlowText[second];
      if (related(a.element, b.element)) continue;
      const sharedInline = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
      const sharedBlock = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
      if (sharedInline <= 2 || sharedBlock <= 2) continue;
      push({
        type: 'element-overlap',
        confidence: 'definite',
        selector: `${describe(a.element)} over ${describe(b.element)}`,
        measured: `${Math.round(sharedInline)}×${Math.round(sharedBlock)}px of shared area`,
        threshold: 'no overlap between in-flow text boxes',
        note: 'two in-flow text blocks occupy the same pixels'
      });
    }
  }

  // Links sitting in a sentence carry their own spacing from the line box, so
  // the same exemption target-size-minimum applies holds here.
  const spaceable = boxes.filter(({ element }) => !insideText(element)).slice(0, LAYOUT_ELEMENT_LIMIT);
  for (let first = 0; first < spaceable.length; first += 1) {
    for (let second = first + 1; second < spaceable.length; second += 1) {
      const a = spaceable[first];
      const b = spaceable[second];
      if (related(a.element, b.element)) continue;
      const gap = Math.max(
        Math.max(a.rect.left - b.rect.right, b.rect.left - a.rect.right),
        Math.max(a.rect.top - b.rect.bottom, b.rect.top - a.rect.bottom)
      );
      if (gap < 0 || gap >= 8) continue;
      push({
        type: 'crowded-controls',
        confidence: 'potential',
        selector: `${describe(a.element)} beside ${describe(b.element)}`,
        measured: `${Math.round(gap)}px gap`,
        threshold: '8px between separate controls',
        note: 'two controls sit close enough to be mis-tapped; a designed group is the exception'
      });
    }
  }

  return {
    findings,
    focusables: controls.map((element, index) => {
      const style = getComputedStyle(element);
      element.setAttribute('data-ui-design-focus-index', String(index));
      return {
        index,
        selector: describe(element),
        signature: focusProperties.map((property) => style[property]).join(' | ')
      };
    })
  };
};

const ACTIVE_SIGNATURE = (focusProperties) => {
  const element = document.activeElement;
  if (!element || element === document.body) return null;
  const style = getComputedStyle(element);
  const index = element.getAttribute('data-ui-design-focus-index');
  return {
    index: index === null ? null : Number(index),
    signature: focusProperties.map((property) => style[property]).join(' | ')
  };
};

async function focusIndicatorFindings(page, focusables) {
  const findings = [];
  const baselines = new Map(focusables.map((entry) => [entry.index, entry]));
  const seen = new Set();
  for (let step = 0; step < Math.min(focusables.length, 40); step += 1) {
    await page.keyboard.press('Tab');
    const active = await page.evaluate(ACTIVE_SIGNATURE, FOCUS_SIGNATURE_PROPERTIES);
    if (!active || active.index === null || seen.has(active.index)) continue;
    seen.add(active.index);
    const baseline = baselines.get(active.index);
    if (!baseline || baseline.signature !== active.signature) continue;
    findings.push(finding({
      type: 'focus-indicator-missing',
      confidence: 'definite',
      selector: baseline.selector,
      measured: 'no computed change under keyboard focus',
      threshold: 'a visible :focus-visible treatment',
      note: 'the control is reachable but keyboard focus is invisible'
    }));
  }
  return findings;
}

async function overflowFindings(page, url) {
  const findings = [];
  for (const width of [360, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(url, { waitUntil: 'load' });
    const measurement = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth
    }));
    if (measurement.scrollWidth <= measurement.innerWidth + 1) continue;
    findings.push(finding({
      type: 'horizontal-overflow',
      confidence: 'definite',
      selector: 'document',
      measured: `${measurement.scrollWidth}px content in a ${measurement.innerWidth}px viewport`,
      threshold: 'no page-level horizontal scroll from 360px through 1440px',
      note: 'the page scrolls horizontally at this width'
    }));
  }
  return findings;
}

// WCAG 2.2 SC 1.4.10 Reflow: 320x256 CSS px is the 400% zoom equivalent of a 1280x1024
// viewport. Vertical scrolling is allowed there; scrolling in two dimensions is not,
// unless the content genuinely requires a two-dimensional layout, which no script decides.
async function reflowFindings(page, url) {
  await page.setViewportSize({ width: 320, height: 256 });
  await page.goto(url, { waitUntil: 'load' });
  const measurement = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth
  }));
  if (measurement.scrollWidth <= measurement.innerWidth + 1) return [];
  return [finding({
    type: 'reflow-two-dimensional',
    confidence: 'potential',
    selector: 'document',
    measured: `${measurement.scrollWidth}px content in a ${measurement.innerWidth}px viewport`,
    threshold: 'no scrolling in two dimensions at 320x256 CSS px (WCAG 2.2 SC 1.4.10)',
    note: 'the page scrolls in both directions at 400% zoom; definite unless the two-dimensional exception applies'
  })];
}

export async function renderedAudit({ url, viewport, cwd }) {
  const session = await openDrivenPage({ cwd, url, viewport });
  if (!session.page) {
    return { status: 'unavailable', reason: session.capability.attempts.join('; ') };
  }
  try {
    const { page } = session;
    const findings = await overflowFindings(page, url);
    findings.push(...(await reflowFindings(page, url)));
    await page.setViewportSize(viewport);
    await page.goto(url, { waitUntil: 'load' });
    const audit = await page.evaluate(PAGE_AUDIT, FOCUS_SIGNATURE_PROPERTIES);
    findings.push(...audit.findings);
    findings.push(...(await focusIndicatorFindings(page, audit.focusables)));
    return { status: 'ok', viewport: `${viewport.width}x${viewport.height}`, findings };
  } finally {
    await session.close();
  }
}

async function main(argv) {
  const flags = parseFlags(argv, { url: 'value', source: 'value', viewport: 'value' });
  if (!flags.url && !flags.source) throw new UsageError('at least one of --url or --source is required');
  const viewport = flags.viewport ? parseViewport(flags.viewport) : { width: 1440, height: 900 };

  const report = {
    static: flags.source
      ? { status: 'ok', findings: await staticAudit(flags.source) }
      : { status: 'unavailable', reason: '--source was not given' },
    rendered: flags.url
      ? await renderedAudit({ url: requireUrl(flags.url), viewport, cwd: process.cwd() })
      : { status: 'unavailable', reason: '--url was not given' }
  };
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    if (error instanceof UsageError) {
      process.stderr.write(`ui-design: ${error.message}\n`);
      process.exitCode = 2;
      return;
    }
    process.stderr.write(`ui-design: ${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
