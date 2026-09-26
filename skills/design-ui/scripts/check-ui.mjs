// Deterministic UI checks: source tells that need no browser, and rendered
// accessibility checks that follow WCAG 2.2 AA. The output is a diagnostic set,
// never a beauty score, and the script emits no aggregate quality number.
//
//   node scripts/check-ui.mjs [--url <url>] [--source <dir>] [--viewport <width>x<height>]
//                             [--baseline <earlier check-ui JSON>]
//
// A --baseline run also reads confirmed false positives from docs/design/check-ui-ignore.json
// under the working directory: a JSON array of { "type", "file", "reason" } strings, where
// file is the path in the finding's selector, without its :line.

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { DEFAULT_VIEWPORTS, openDrivenPage, parseFlags, parseViewport, requireUrl, UsageError } from './capture.mjs';
import { isOverusedFamily, loadOverusedFonts } from './overused-fonts.mjs';

const SOURCE_EXTENSIONS = new Set([
  '.css', '.scss', '.html', '.htm', '.js', '.jsx', '.mjs', '.ts', '.tsx', '.vue', '.svelte', '.astro'
]);
const MARKUP_EXTENSIONS = new Set(['.html', '.htm', '.jsx', '.tsx', '.vue', '.svelte', '.astro']);
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'out']);

function finding({ type, confidence, selector, measured, threshold, note }) {
  return { type, confidence, selector, measured, threshold, note };
}

const BLOCK_COMMENT = String.raw`\/\*[\s\S]*?(?:\*\/|(?![\s\S]))`;
const MARKUP_COMMENT = String.raw`<!--[\s\S]*?(?:-->|(?![\s\S]))`;
const LINE_COMMENT = String.raw`(?<=^|[ \t])\/\/[^\n]*`;

// Blanks comments to spaces and keeps newlines, so every line number still matches the file.
// Strings are not tracked, because an apostrophe in markup text would open a false string:
// a string holding ` //` or `/*` loses the text after it.
function stripComments(text, extension) {
  const kinds = [BLOCK_COMMENT];
  if (MARKUP_EXTENSIONS.has(extension)) kinds.push(MARKUP_COMMENT);
  if (extension !== '.css') kinds.push(LINE_COMMENT);
  const comments = new RegExp(kinds.join('|'), 'gm');
  return text.replace(comments, (comment) => comment.replace(/[^\r\n]/g, ' '));
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

const PURPLE_UTILITY = /\b(?:bg|text|from|via|to|border|ring|fill|stroke|shadow)-(?:indigo|violet|purple)-(?:50|[1-9]00|950)\b/;

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
    type: 'invented-content',
    confidence: 'potential',
    skipsStylesheets: true,
    pattern: /\b(?:John|Jane) (?:Doe|Smith)\b|\bJoe Bloggs\b/,
    threshold: 'a person the brief or the repository names',
    note: 'stock placeholder name in place of a real person'
  },
  {
    type: 'invented-content',
    confidence: 'potential',
    skipsStylesheets: true,
    pattern: /\b(?:Acme|Globex|Initech|Contoso|Fabrikam)\b/,
    threshold: 'a company the brief or the repository names',
    note: 'sample company name in place of a real one'
  },
  {
    type: 'invented-content',
    confidence: 'potential',
    skipsStylesheets: true,
    // One leading digit followed only by zeros or nines, such as $10, $49, $100 or $19.99.
    pattern: /[$€£](?:[1-9]0+|[1-9]?9+)(?:\.(?:00|99))?(?![\d,.]?\d)/,
    threshold: 'a price the brief or the repository states',
    note: 'round placeholder price with no source'
  },
  {
    type: 'invented-content',
    confidence: 'potential',
    skipsStylesheets: true,
    // A user count with three or more digits, a thousands group, a k or m suffix or a plus; a decimal rating out of five; four stars or more.
    pattern: /(?:\b\d{1,3}(?:,\d{3})+|\b\d+(?:\.\d+)?\s?[km]\b|\b\d{3,}|\b\d+\+)\+?\s+(?:happy |active |satisfied )?(?:users|customers|teams|companies|businesses|developers|clients|members)\b|\b[3-5]\.\d\s*(?:\/\s*5\b|out of 5\b|stars?\b)|[★⭐]{4,}/i,
    threshold: 'a figure the brief or the repository sources',
    note: 'user count or rating with no source'
  },
  {
    type: 'invented-content',
    confidence: 'potential',
    skipsStylesheets: true,
    pattern: /\b[A-Z][a-z]+ [A-Z][a-z]+,\s*(?:CEO|CTO|COO|CFO|Co-founder|Founder|Head of|VP of)\b/,
    threshold: 'a quote the brief or the repository sources',
    note: 'testimonial attribution with no source'
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
  },
  {
    type: 'purple-palette',
    confidence: 'potential',
    oncePerFile: true,
    // paletteFindings reports a stylesheet, where a utility and a color literal compete for the first purple.
    skipsStylesheets: true,
    pattern: PURPLE_UTILITY,
    threshold: 'an accent hue the subject justifies',
    note: 'indigo, violet or purple utility class, the default generated palette'
  },
  {
    type: 'monospace-label',
    confidence: 'potential',
    // The lookbehind skips a class on a code, pre, kbd or samp tag opened on the same line.
    pattern: /(?<!<(?:code|pre|kbd|samp)\b[^<>]*)\bclass(?:Name)?\s*=\s*["'](?=[^"']*\bfont-mono\b)(?=[^"']*(?:\buppercase\b|\btext-xs\b|\btracking-))[^"']*["']/,
    threshold: 'monospace for code and tabular figures only',
    note: 'font-mono utility on a small, uppercase or tracked label'
  }
];

// Markup tells read over the whole file rather than one line, because the attribute
// that is missing is often several lines below the tag that should carry it.
const OPEN_TAG = (name) => new RegExp(`<${name}\\b[^>]*>`, 'gis');

function tagFindings(text, relative, starts, { tag, type, required, confidence, threshold, note }) {
  const findings = [];
  for (const match of text.matchAll(OPEN_TAG(tag))) {
    if (required.test(match[0])) continue;
    findings.push(finding({
      type,
      confidence,
      selector: `${relative}:${lineNumber(starts, match.index)}`,
      measured: match[0].replace(/\s+/g, ' ').slice(0, 80),
      threshold,
      note
    }));
  }
  return findings;
}

function markupFindings(text, relative, starts) {
  const findings = [
    ...tagFindings(text, relative, starts, {
      tag: 'svg', type: 'svg-without-viewbox', required: /\bviewBox\s*=/i, confidence: 'definite',
      threshold: 'every inline SVG carries a viewBox',
      note: 'without a viewBox the icon cannot scale to its container and may clip'
    }),
    ...tagFindings(text, relative, starts, {
      tag: 'img', type: 'image-without-alt', required: /\balt\s*=/i, confidence: 'definite',
      threshold: 'every img carries an alt attribute, empty for decorative images',
      note: 'a missing alt is not the same as alt="" and reads as an unnamed image'
    }),
    ...tagFindings(text, relative, starts, {
      tag: 'img', type: 'image-without-dimensions',
      required: /\b(width|height|aspect-ratio|style|class|className)\s*=/i, confidence: 'potential',
      threshold: 'intrinsic width and height, or an aspect-ratio, reserve the space',
      note: 'an image with no reserved space shifts the layout when it arrives'
    })
  ];
  for (const match of text.matchAll(OPEN_TAG('img'))) {
    if (!/\bsrcset\s*=/i.test(match[0]) || /\bsizes\s*=/i.test(match[0])) continue;
    if (!/\d+w[\s"',]/.test(match[0])) continue;
    findings.push(finding({
      type: 'srcset-without-sizes',
      confidence: 'definite',
      selector: `${relative}:${lineNumber(starts, match.index)}`,
      measured: match[0].replace(/\s+/g, ' ').slice(0, 80),
      threshold: 'a w-descriptor srcset is paired with a sizes attribute',
      note: 'without sizes the browser assumes 100vw and downloads a larger image than the slot needs'
    }));
  }
  if (/<html\b/i.test(text)) {
    findings.push(...tagFindings(text, relative, starts, {
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
const GROUND_SUBJECT = /^(?:body|html|main)(?![\w-])|hero/i;
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

/** Offsets where each line begins: entry 0 is line 1's start, and so on. */
function lineStarts(text) {
  const starts = [0];
  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) {
    starts.push(index + 1);
  }
  return starts;
}

/** The 1-based line for a character offset, found by binary search over precomputed line starts. */
function lineNumber(starts, offset) {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (starts[mid] <= offset) low = mid;
    else high = mid - 1;
  }
  return low + 1;
}

function kickerFindings(text, relative, starts) {
  return [...text.matchAll(KICKER_BEFORE_HEADING)].map((match) => finding({
    type: 'kicker-above-heading',
    confidence: 'definite',
    selector: `${relative}:${lineNumber(starts, match.index)}`,
    measured: match[0].replace(/\s+/g, ' ').slice(0, 80),
    threshold: 'hierarchy carried by the heading itself',
    note: 'eyebrow/kicker/overline label stacked over the heading'
  }));
}

/** Flat `selector { body }` pairs; a nested rule yields its innermost selector, at-rules are skipped. */
function cssRules(text, relative, starts) {
  const rules = [];
  for (const match of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].replace(/\/\*[\s\S]*?\*\//g, '').trim().replace(/\s+/g, ' ');
    if (!selector || selector.startsWith('@')) continue;
    const offset = match.index + match[1].length - match[1].trimStart().length;
    rules.push({ selector, body: match[2], location: `${relative}:${lineNumber(starts, offset)}` });
  }
  return rules;
}

/** The rightmost compound of each selector in a list: the element the rule styles. */
function selectorSubjects(selector) {
  return selector.split(',').map((part) => {
    const compounds = part.trim().split(/\s*[\s>+~]\s*/);
    return compounds[compounds.length - 1];
  });
}

/** A rule that styles the page ground itself: body, html, main or a hero, not an element inside one. */
function isGroundSelector(selector) {
  return selectorSubjects(selector).some((subject) => GROUND_SUBJECT.test(subject));
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

/** The first length of a space-separated value in px, such as a border shorthand's width or a radius's first corner. */
function firstLengthPx(value) {
  const [first] = (value ?? '').trim().split(/\s+/);
  return lengthPx(first);
}

/** The largest corner of a border-radius value in px, or null when no corner is a known length. */
function largestRadiusPx(value) {
  const corners = (value ?? '').trim().split(/[\s/]+/).map(lengthPx).filter((corner) => corner !== null);
  return corners.length > 0 ? Math.max(...corners) : null;
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

/** Eight hex digits with alpha, or null for a token that is no 3, 4, 6 or 8 digit hex color. */
function hexDigits(token) {
  const hex = /^#([0-9a-f]{3,8})$/i.exec(token);
  if (!hex) return null;
  const digits = hex[1].length <= 4 ? hex[1].replace(/./g, '$&$&') : hex[1];
  if (digits.length === 6) return `${digits}ff`;
  return digits.length === 8 ? digits : null;
}

/** The arguments of a functional color, comma or space separated, with the alpha after a slash as the fourth. */
function colorArguments(token) {
  const inner = /^[a-z]+\(([^)]*)\)$/i.exec(token);
  return inner ? inner[1].trim().split(/[\s,/]+/) : [];
}

/** A number, or a percentage scaled so that 100% is `full`. */
function colorNumber(argument, full) {
  const value = Number.parseFloat(argument);
  return argument.endsWith('%') ? (value / 100) * full : value;
}

/** sRGB channels from hsl(), after css-color-4's hslToRgb. */
function hslChannels(hue, saturation, lightness) {
  const amount = saturation * Math.min(lightness, 1 - lightness);
  return [0, 8, 4].map((offset) => {
    const position = (offset + hue / 30) % 12;
    return 255 * (lightness - amount * Math.max(-1, Math.min(position - 3, 9 - position, 1)));
  });
}

/** sRGB channels 0-255 of a hex, rgb() or hsl() token; oklch() and var() are not converted. */
function parseColor(token) {
  const digits = hexDigits(token);
  if (digits) return [0, 2, 4].map((start) => Number.parseInt(digits.slice(start, start + 2), 16));
  const args = colorArguments(token);
  if (args.length < 3) return null;
  let channels = null;
  if (/^rgba?\(/i.test(token)) channels = args.slice(0, 3).map((argument) => colorNumber(argument, 255));
  if (/^hsla?\(/i.test(token)) {
    const hue = ((Number.parseFloat(args[0]) % 360) + 360) % 360;
    const saturation = colorNumber(args[1], 100) / 100;
    const lightness = colorNumber(args[2], 100) / 100;
    channels = hslChannels(hue, saturation, lightness);
  }
  return channels?.every(Number.isFinite) ? channels : null;
}

/** Opacity from 0 to 1; a token without alpha is opaque. */
function alphaOf(token) {
  const digits = hexDigits(token);
  if (digits) return Number.parseInt(digits.slice(6), 16) / 255;
  const alpha = colorArguments(token)[3];
  return alpha === undefined ? 1 : colorNumber(alpha, 1);
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

/** Linear-light sRGB channel from a gamma-encoded 0-255 channel (css-color-4's sRGB-to-linear step). */
function linearChannel(channel) {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function degrees(angle) {
  return ((angle % 360) + 360) % 360;
}

/** OKLCH lightness (0 to 1), chroma and hue of an oklch() token or of any token parseColor reads,
 *  via the Ottosson OKLab conversion; null otherwise. An oklch chroma of 100% is 0.4. */
function oklchOf(token) {
  if (/^oklch\(/i.test(token)) {
    const args = colorArguments(token);
    if (args.length < 3) return null;
    const color = { lightness: colorNumber(args[0], 1), chroma: colorNumber(args[1], 0.4), hue: degrees(Number.parseFloat(args[2])) };
    return Object.values(color).every(Number.isFinite) ? color : null;
  }
  const rgb = parseColor(token);
  if (!rgb) return null;
  const [lr, lg, lb] = rgb.map(linearChannel);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const lightness = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const greenRed = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const blueYellow = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  const hue = degrees((Math.atan2(blueYellow, greenRed) * 180) / Math.PI);
  return { lightness, chroma: Math.hypot(greenRed, blueYellow), hue };
}

// OKLCH chroma from which a color reads as clearly saturated rather than an ink-derived tint, in any notation.
const SATURATED_CHROMA = 0.08;

/** Hue in degrees and the model it was written in, for comparing two gradient stops, and whether the color is
 *  clearly saturated; null for a near-grey stop. */
function stopHue(token) {
  const color = oklchOf(token);
  if (!color) return null;
  const saturated = color.chroma >= SATURATED_CHROMA;
  if (/^hsla?\(/i.test(token)) {
    const [hue, saturation] = colorArguments(token);
    return colorNumber(saturation, 100) < 10 ? null : { model: 'hsl', hue: degrees(Number.parseFloat(hue)), saturated };
  }
  if (/^oklch\(/i.test(token)) return color.chroma < 0.03 ? null : { model: 'oklch', hue: color.hue, saturated };
  const hue = hueOf(parseColor(token));
  return hue === null ? null : { model: 'srgb', hue, saturated };
}

/** Circular hue distance between the first two stops, or null when they use different models. */
function gradientHueGap(value) {
  const stops = [...value.matchAll(COLOR_TOKEN)]
    .map((match) => stopHue(match[0]))
    .filter(Boolean);
  if (stops.length < 2 || stops[0].model !== stops[1].model) return null;
  const gap = Math.abs(stops[0].hue - stops[1].hue);
  return Math.min(gap, 360 - gap);
}

const COLOR_TOKEN = /#[0-9a-f]{3,8}\b|(?:rgba?|hsla?|oklch)\([^)]*\)/gi;
// Indigo through purple as an oklch hue, whichever notation the token is written in.
const PURPLE_HUES = [275, 310];
// Red through amber and gold reads as a signal color, not neon, however bright it is.
const WARM_HUES = [20, 100];
const GROUND_DECLARATION = /(?:^|[;\s])(background(?:-color)?|--[\w-]+)\s*:\s*([^;]+)/gi;
// A ground custom property is named from these words only, such as --bg, --page-bg or --color-background;
// --card-bg, --bg-overlay and --foreground name something else. A design-system prefix such as --bs- is not
// read; add it to GROUND_SCOPES to read it.
const GROUND_NOUNS = new Set(['bg', 'background', 'ground', 'canvas', 'page', 'paper']);
const GROUND_SCOPES = new Set(['color', 'colour', 'body', 'app', 'site', 'main', 'root', 'base', 'default', 'global']);

function isGroundProperty(property) {
  if (!property.startsWith('--')) return true;
  const words = property.slice(2).toLowerCase().split('-').filter(Boolean);
  const namesGround = words.some((word) => GROUND_NOUNS.has(word));
  return namesGround && words.every((word) => GROUND_NOUNS.has(word) || GROUND_SCOPES.has(word));
}

export function isPurple(token) {
  const color = oklchOf(token);
  if (!color || color.chroma < SATURATED_CHROMA) return false;
  return color.hue >= PURPLE_HUES[0] && color.hue <= PURPLE_HUES[1];
}

/** A bright, strongly saturated color outside the warm band: fluorescent green, cyan, magenta or yellow. */
export function isNeon(token) {
  const color = oklchOf(token);
  if (!color || color.lightness < 0.7 || color.chroma < 0.13) return false;
  return color.hue < WARM_HUES[0] || color.hue > WARM_HUES[1];
}

/** A near-black color opaque enough to be the ground; a translucent overlay sets no ground. */
export function isNearBlack(token) {
  const rgb = parseColor(token);
  return rgb !== null && Math.max(...rgb) <= 48 && alphaOf(token) >= 0.9;
}

/** A warm off-white: light, low in chroma, hue between orange and yellow. */
export function isCream(token) {
  const rgb = parseColor(token);
  if (!rgb || Math.min(...rgb) < 200 || Math.max(...rgb) < 235) return false;
  const hue = hueOf(rgb);
  return hue !== null && hue >= 25 && hue <= 65;
}

/** Color literals a page-level ground declares, directly or through a ground-named custom property; var() is not resolved. */
function groundColors(rules) {
  const colors = [];
  for (const { selector, body, location } of rules) {
    if (!isGroundSelector(selector) && !/:root\b/.test(selector)) continue;
    for (const [, property, value] of body.matchAll(GROUND_DECLARATION)) {
      if (!isGroundProperty(property)) continue;
      const tokens = value.match(COLOR_TOKEN) ?? [];
      for (const token of tokens) colors.push({ token, where: `${selector} (${location})` });
    }
  }
  return colors;
}

/** File-level palette reads: a cream ground, a purple accent, and neon over a near-black ground. */
function paletteFindings(text, relative, starts, rules) {
  const findings = [];
  const grounds = groundColors(rules);
  for (const ground of grounds) {
    if (!isCream(ground.token)) continue;
    findings.push(finding({
      type: 'cream-ground', confidence: 'potential', selector: ground.where,
      measured: ground.token, threshold: 'a ground color the subject justifies',
      note: 'warm cream or beige page ground, the default editorial template'
    }));
  }
  const colors = [];
  for (const match of text.matchAll(COLOR_TOKEN)) {
    colors.push({ token: match[0], location: `${relative}:${lineNumber(starts, match.index)}` });
  }
  const purpleLiteral = [...text.matchAll(COLOR_TOKEN)].find((match) => isPurple(match[0]));
  const purpleUtility = [...text.matchAll(new RegExp(PURPLE_UTILITY.source, 'g'))][0];
  const [firstPurple] = [purpleLiteral, purpleUtility].filter(Boolean).sort((first, second) => first.index - second.index);
  const purple = firstPurple && { token: firstPurple[0], location: `${relative}:${lineNumber(starts, firstPurple.index)}` };
  if (purple) {
    findings.push(finding({
      type: 'purple-palette', confidence: 'potential', selector: purple.location,
      measured: purple.token, threshold: 'an accent hue the subject justifies',
      note: 'indigo, violet or purple accent, the default generated palette'
    }));
  }
  const darkGround = grounds.find((ground) => isNearBlack(ground.token));
  const neon = darkGround ? colors.find((color) => isNeon(color.token)) : undefined;
  if (neon) {
    findings.push(finding({
      type: 'neon-on-dark', confidence: 'potential', selector: neon.location,
      measured: `${neon.token} over ${darkGround.token}`, threshold: 'accent brightness chosen against the ground',
      note: 'saturated neon color on a near-black ground'
    }));
  }
  return findings;
}

const BORDER_SIDES = ['left', 'right', 'top', 'bottom', 'inline-start', 'inline-end', 'block-start', 'block-end'];
// A btn-, button- or cta- class names a button unless the rest of it names the container around buttons.
const BUTTON_SUBJECT =
  /(?:^|\.)(?:button|btn|cta)(?:-(?!(?:group|section|bar|toolbar|row|list|wrapper|container|area|block|box|banner|panel|grid|stack)(?![\w-]))[\w-]+)?(?![\w-])/i;
// A JSX expression in the open tag may hold `=>`; the tempered content stops at the control's own close tag.
const PILL_CONTROL =
  /<(button|a)\b(?:[^>{]|\{[^}]*\})*?\bclass(?:Name)?\s*=\s*["'][^"']*\brounded-full\b(?:[^>{]|\{[^}]*\})*>((?:(?!<\/\1>)[\s\S])*)<\/\1>/gi;

/** The one visible border side at least 3px wide, or null when no side or several sides are. */
function accentEdge(body) {
  const wide = [];
  for (const side of BORDER_SIDES) {
    const value = declaration(body, `border-${side}(?:-width)?`) ?? '';
    if (/\b(?:transparent|none|hidden)\b/i.test(value)) continue;
    const width = firstLengthPx(value);
    if (width !== null && width >= 3) wide.push({ side, width });
  }
  return wide.length === 1 ? wide[0] : null;
}

// Below this blur a zero-offset shadow is a hairline edge, not a halo.
const HALO_MIN_BLUR = 4;

/** A hued shadow centered on its element and blurred 4px or more, at any saturation, or offset, blurred 12px or more
 *  and clearly saturated; a var() color is not resolved and a layered shadow is not read. */
function tintedGlowFindings(body, where) {
  const findings = [];
  for (const property of ['box-shadow', 'text-shadow']) {
    const value = declaration(body, property);
    if (!value || /\binset\b/i.test(value)) continue;
    const lengths = shadowLengths(value);
    const [token] = value.match(COLOR_TOKEN) ?? [];
    const hue = token ? stopHue(token) : null;
    if (!lengths || !hue) continue;
    const [offsetX, offsetY, blur] = lengths;
    const centered = offsetX === 0 && offsetY === 0 && blur >= HALO_MIN_BLUR;
    if (!centered && !(blur >= 12 && hue.saturated)) continue;
    findings.push(finding({
      type: 'tinted-glow', confidence: 'potential', selector: where,
      measured: `${property} ${offsetX}px ${offsetY}px ${blur}px ${token}`,
      threshold: 'shadows that model light, in a neutral or ground-derived tone',
      note: 'colored glow: a zero-offset halo or an accent-tinted shadow'
    }));
  }
  return findings;
}

/** A button rule whose radius makes a pill: 100px or more, or Tailwind v4's infinite radius. */
function pillButtonFindings(selector, body, where) {
  const radius = declaration(body, 'border-radius');
  const isButton = selectorSubjects(selector).some((subject) => BUTTON_SUBJECT.test(subject));
  if (!radius || !isButton) return [];
  const width = firstLengthPx(radius);
  const isPill = /infinity/i.test(radius) || (width !== null && width >= 100);
  if (!isPill) return [];
  return [finding({
    type: 'pill-button', confidence: 'potential', selector: where,
    measured: `border-radius ${radius}`, threshold: 'button shape set by the component system',
    note: 'fully rounded pill on a button rule'
  })];
}

/** Three or more labelled buttons or links in one markup file carrying Tailwind's rounded-full; an icon-only
 *  control, with no text between its tags, is a round icon button rather than a pill. A label passed only as a
 *  JSX expression, such as {label}, reads as no text and is missed. */
function pillMarkupFindings(text, relative, starts) {
  const labelled = (match) => match[2].replace(/<[^>]*>|\{[^}]*\}/g, '').trim() !== '';
  const pills = [...text.matchAll(PILL_CONTROL)].filter(labelled);
  if (pills.length < 3) return [];
  return [finding({
    type: 'pill-button', confidence: 'potential', selector: `${relative}:${lineNumber(starts, pills[0].index)}`,
    measured: `${pills.length} buttons or links with rounded-full`, threshold: 'button shape set by the component system',
    note: 'fully rounded pill on every button'
  })];
}

const CUBIC_BEZIER = /cubic-bezier\(\s*[\d.]+\s*,\s*(-?[\d.]+)\s*,\s*[\d.]+\s*,\s*(-?[\d.]+)\s*\)/gi;
const BOUNCE_NAME =
  /\banimate-bounce\b|@keyframes\s+[\w-]*bounce|animation(?:-name)?\s*:[^;]*\bbounce|\bbounce\s*:\s*(?:0?\.\d*[1-9]|1\b)/i;
// card or tile as a word of a class name, so .feature-card and .productCard match and .scorecard does not.
const CARD_SELECTOR = /(?:^|[^a-zA-Z])(?:[cC]ard|[tT]ile)s?(?![a-z])|[a-z](?:Card|Tile)s?(?![a-z])/;
const MONOSPACE = /\bmono(?:space)?\b|courier|menlo|consolas|monaco|fira code/i;
const CODE_SELECTOR = /(?:^|[\s,>+~.])(?:code|pre|kbd|samp)(?![\w])/i;

/** Easing that overshoots its end: a cubic-bezier y outside 0 to 1, a bounce animation, or a spring bounce above 0. */
function bounceFindings(line, location) {
  const curves = [...line.matchAll(CUBIC_BEZIER)];
  const overshoots = curves.some((curve) => [curve[1], curve[2]].some((y) => Number(y) < 0 || Number(y) > 1));
  if (!overshoots && !BOUNCE_NAME.test(line)) return [];
  return [finding({
    type: 'bounce-easing', confidence: 'potential', selector: location,
    measured: line.trim().slice(0, 80), threshold: 'easing that settles without overshoot',
    note: 'bounce, elastic or overshooting easing'
  })];
}

/** A one-shot animation on a card or tile rule: the same entrance stamped on every card. A looping
 *  animation is a loading or status state, not an entrance. */
function cardEntranceFindings(selector, body, where) {
  const animation = declaration(body, 'animation(?:-name)?');
  if (!animation || /^none\b/i.test(animation) || !CARD_SELECTOR.test(selector)) return [];
  const iterations = declaration(body, 'animation-iteration-count') ?? '';
  if (/\binfinite\b/i.test(`${animation} ${iterations}`)) return [];
  return [finding({
    type: 'card-entrance', confidence: 'potential', selector: where,
    measured: `animation ${animation}`, threshold: 'motion that marks a state change, not every card arriving',
    note: 'entrance animation on a card rule'
  })];
}

/** A monospace family on a non-code rule that also sets it small, uppercase or tracked. */
function monospaceLabelFindings(selector, body, where) {
  const family = declaration(body, 'font-family');
  if (!family || !MONOSPACE.test(family) || CODE_SELECTOR.test(selector)) return [];
  const size = lengthPx(declaration(body, 'font-size'));
  const tracking = lengthPx(declaration(body, 'letter-spacing'));
  const uppercase = /\buppercase\b/i.test(declaration(body, 'text-transform') ?? '');
  const isLabel = uppercase || (size !== null && size <= 13) || (tracking !== null && tracking > 0);
  if (!isLabel) return [];
  return [finding({
    type: 'monospace-label', confidence: 'potential', selector: where,
    measured: family, threshold: 'monospace for code and tabular figures only',
    note: 'monospace label worn to look technical'
  })];
}

function ruleFindings(rules, shadows) {
  const findings = [];
  for (const { selector, body, location } of rules) {
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
    const edge = accentEdge(body);
    const radius = largestRadiusPx(declaration(body, 'border-radius'));
    if (edge && radius !== null && radius >= 8) {
      findings.push(finding({
        type: 'edge-accent-card', confidence: 'potential', selector: where,
        measured: `border-${edge.side} ${edge.width}px, border-radius ${radius}px`, threshold: 'emphasis from hierarchy, not a stripe',
        note: 'rounded card with a colored stripe on one edge'
      }));
    }
    findings.push(...tintedGlowFindings(body, where));
    findings.push(...pillButtonFindings(selector, body, where));
    findings.push(...cardEntranceFindings(selector, body, where));
    findings.push(...monospaceLabelFindings(selector, body, where));
    const background = declaration(body, 'background(?:-image)?');
    const gap = background && /linear-gradient\(/i.test(background) && isGroundSelector(selector)
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
    const source = await fs.readFile(file, 'utf8');
    const text = stripComments(source, extension);
    // Only the whole-file reads below need offsets turned into line numbers.
    const starts = isStylesheet || isMarkup ? lineStarts(text) : [];
    const lines = text.split(/\r?\n/);
    // The depth at whose contents raw values are exempt (a :root/@theme block, or a
    // rule that declares a custom property), or null outside any such block. Set from
    // brace counts rather than "line starts with }" so a one-line block such as
    // `:root { --gap: 8px; }` closes before the next rule's declarations are read.
    let braceDepth = 0;
    let tokenBlockDepth = null;
    const reportedOnce = new Set();
    lines.forEach((line, index) => {
      const location = `${relative}:${index + 1}`;
      let insideTokenBlock = false;
      if (isStylesheet) {
        const opens = (line.match(/\{/g) || []).length;
        const closes = (line.match(/\}/g) || []).length;
        if (tokenBlockDepth === null && opens > 0 && /:root\b|@theme\b/.test(line)) {
          tokenBlockDepth = braceDepth + 1;
        } else if (tokenBlockDepth === null && /^\s*--/.test(line)) {
          tokenBlockDepth = braceDepth;
        }
        insideTokenBlock = tokenBlockDepth !== null;
        braceDepth += opens - closes;
        if (tokenBlockDepth !== null && braceDepth < tokenBlockDepth) tokenBlockDepth = null;
      }
      for (const tell of LINE_TELLS) {
        if (tell.skipsStylesheets && isStylesheet) continue;
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
      findings.push(...bounceFindings(line, location));
      if (isStylesheet) findings.push(...rawValueFindings(line, location, insideTokenBlock));
      if (isMarkup) findings.push(...emojiFindings(line, location));
    });
    if (isStylesheet) {
      const rules = cssRules(text, relative, starts);
      findings.push(...ruleFindings(rules, shadows));
      findings.push(...paletteFindings(text, relative, starts, rules));
    }
    if (isMarkup) findings.push(...kickerFindings(text, relative, starts));
    if (isMarkup) findings.push(...markupFindings(text, relative, starts));
    if (isMarkup) findings.push(...pillMarkupFindings(text, relative, starts));
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
  // ratio()/luminance() read only r/g/b; a translucent color has to be composited
  // (source-over) against its effective background first, or it measures as its
  // unblended channel values, e.g. a black border at 50% opacity would read as
  // opaque black regardless of what shows through it.
  const blend = (foreground, background) => {
    if (foreground.a >= 1) return foreground;
    const mix = (channel) => foreground.a * foreground[channel] + (1 - foreground.a) * background[channel];
    return { r: mix('r'), g: mix('g'), b: mix('b'), a: 1 };
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
    const measured = ratio(blend(foreground, background.color), background.color);
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
    const borderColor = toRgba(style.borderTopColor);
    // A fully transparent border (e.g. `border-transparent` used for layout) composites
    // to the background itself and draws no visible boundary, so it identifies nothing
    // to hold to the non-text contrast minimum.
    if (borderWidth > 0 && style.borderTopStyle !== 'none' && borderColor.a > 0) {
      const background = effectiveBackground(element.parentElement ?? element);
      const measured = ratio(blend(borderColor, background.color), background.color);
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

export async function renderedAudit({ url, viewports, cwd }) {
  const session = await openDrivenPage({ cwd, url, viewport: viewports[0] });
  if (!session.page) {
    return { status: 'unavailable', reason: session.capability.attempts.join('; ') };
  }
  try {
    const { page } = session;
    const fixedFindings = await overflowFindings(page, url);
    fixedFindings.push(...(await reflowFindings(page, url)));

    const perViewport = {};
    for (const viewport of viewports) {
      const key = `${viewport.width}x${viewport.height}`;
      await page.setViewportSize(viewport);
      await page.goto(url, { waitUntil: 'load' });
      // A same-document navigation (e.g. the page only stripped a URL fragment
      // via history.replaceState) does not reload the document, so focus left
      // over from the previous viewport's Tab pass would otherwise survive
      // into this viewport's baseline audit. Force a real reload per viewport.
      await page.reload({ waitUntil: 'load' });
      const audit = await page.evaluate(PAGE_AUDIT, FOCUS_SIGNATURE_PROPERTIES);
      const focusFindings = await focusIndicatorFindings(page, audit.focusables);
      const findings = [...audit.findings, ...focusFindings].map((entry) => ({ ...entry, viewport: key }));
      perViewport[key] = { status: 'ok', findings };
    }
    return { status: 'ok', viewports: perViewport, fixed: { findings: fixedFindings } };
  } finally {
    await session.close();
  }
}

// The finding names the design-ui docs restate live in one asset; verify pins
// each doc list to it.
const FINDING_LISTS = JSON.parse(readFileSync(new URL('../assets/check-ui-findings.json', import.meta.url), 'utf8'));
// The slop tropes visual-critique.md names that this script detects.
export const DECORATIVE_TELLS = Object.freeze(FINDING_LISTS.decorativeTells);
export const ALWAYS_BLOCKING = new Set(FINDING_LISTS.alwaysBlocking);

// A selector ends in `file:line` for a line-level finding and in `rule (file:line)` for a rule-level one.
const RULE_LOCATION = /\(([^()]*):\d+\)$/;

function findingFile(entry) {
  const ruleLocation = RULE_LOCATION.exec(entry.selector);
  return ruleLocation ? ruleLocation[1] : entry.selector.replace(/:\d+$/, '');
}

/** The selector without its line number, so a finding keeps its key when lines above it shift. */
function comparisonKey(entry) {
  const selector = entry.selector.replace(/:\d+(\)?)$/, '$1');
  return `${entry.type}|${selector}|${entry.measured}|${entry.viewport ?? ''}`;
}

/** Every finding the report carries: static, the fixed-width checks, and each viewport's own. */
function reportFindings(report) {
  if (typeof report?.static?.status !== 'string') return null;
  const staticFindings = report?.static?.findings ?? [];
  if (!Array.isArray(staticFindings)) return null;
  const rendered = report?.rendered;
  const renderedFindings = [];
  if (rendered && typeof rendered === 'object') {
    if (!Array.isArray(rendered.fixed?.findings ?? [])) return null;
    renderedFindings.push(...(rendered.fixed?.findings ?? []));
    const viewports = rendered.viewports ?? {};
    if (typeof viewports !== 'object') return null;
    for (const entry of Object.values(viewports)) {
      if (!Array.isArray(entry?.findings)) return null;
      renderedFindings.push(...entry.findings);
    }
  }
  const findings = [...staticFindings, ...renderedFindings];
  const wellFormed = findings.every((entry) => typeof entry?.type === 'string' && typeof entry.selector === 'string');
  return wellFormed ? findings : null;
}

/** {type: {threshold, note}} from the first finding seen per type, in report order. */
export function notesTable(findings) {
  const table = {};
  for (const entry of findings) {
    if (!Object.hasOwn(table, entry.type)) table[entry.type] = { threshold: entry.threshold, note: entry.note };
  }
  return table;
}

/**
 * Drops threshold/note from each finding, in place, when it equals its type's table entry.
 * Lossless: a finding plus the table's entry for its type reconstructs the dropped fields.
 */
export function applyNotesTable(findings) {
  const table = notesTable(findings);
  for (const entry of findings) {
    const noted = table[entry.type];
    if (entry.threshold === noted.threshold) delete entry.threshold;
    if (entry.note === noted.note) delete entry.note;
  }
  return table;
}

const SUMMARY_LINE_LIMIT = 10;
const SUMMARY_BLOCK_LIMIT = 8;

function summaryLabel(report, entry) {
  if (entry.viewport) return entry.viewport;
  return (report.rendered?.fixed?.findings ?? []).includes(entry) ? 'fixed' : 'static';
}

/** At most 10 lines in place of the JSON report: counts, then up to 8 blocking findings. */
function summaryLines(report, findings, comparison) {
  const viewportCounts = Object.entries(report.rendered?.viewports ?? {})
    .map(([viewport, value]) => `${viewport}=${value.findings?.length ?? 0}`);
  const header = [
    `static=${report.static?.findings?.length ?? 0}`,
    `fixed=${report.rendered?.fixed?.findings?.length ?? 0}`,
    ...viewportCounts
  ];
  if (report.comparison) {
    const counts = report.comparison.counts;
    header.push(
      `before=${counts.before}`, `after=${counts.after}`, `new=${counts.new}`,
      `predating=${counts.predating}`, `ignored=${counts.ignored}`, `blocking=${counts.blocking}`
    );
  }
  const lines = [header.join(' ')];
  const blockingSet = new Set(comparison.blocking);
  const blocking = findings.filter((entry) => blockingSet.has(entry));
  const shown = blocking.slice(0, Math.min(SUMMARY_BLOCK_LIMIT, SUMMARY_LINE_LIMIT - lines.length));
  for (const entry of shown) {
    lines.push(`BLOCK ${summaryLabel(report, entry)} ${entry.type} ${entry.selector} ${entry.measured}`);
  }
  const remaining = blocking.length - shown.length;
  if (remaining > 0 && lines.length < SUMMARY_LINE_LIMIT) lines.push(`... ${remaining} more`);
  return lines;
}

async function readBaseline(file) {
  const text = await fs.readFile(file, 'utf8').catch(() => null);
  if (text === null) throw new UsageError(`--baseline cannot be read: ${file}`);
  let report;
  try {
    report = JSON.parse(text);
  } catch {
    throw new UsageError(`--baseline is not JSON: ${file}`);
  }
  const findings = reportFindings(report);
  if (!findings) throw new UsageError(`--baseline holds no check-ui findings: ${file}`);
  return findings;
}

export function compareFindings(baselineFindings, currentFindings, ignoreEntries = []) {
  const unmatched = new Map();
  for (const entry of baselineFindings) {
    const key = comparisonKey(entry);
    unmatched.set(key, (unmatched.get(key) ?? 0) + 1);
  }
  const added = [];
  const ignored = [];
  const blocking = [];
  let predating = 0;
  for (const entry of currentFindings) {
    const file = findingFile(entry);
    const ignoreEntry = ignoreEntries.find((candidate) => candidate.type === entry.type && candidate.file === file);
    if (ignoreEntry) {
      ignored.push({ ...entry, reason: ignoreEntry.reason });
      continue;
    }
    const key = comparisonKey(entry);
    const baselineCount = unmatched.get(key) ?? 0;
    const isNew = baselineCount === 0;
    if (isNew) {
      added.push(entry);
    } else {
      unmatched.set(key, baselineCount - 1);
      predating += 1;
    }
    const isBlocking = ALWAYS_BLOCKING.has(entry.type) || (isNew && entry.confidence === 'definite');
    if (isBlocking) blocking.push(entry);
  }
  const counts = {
    before: baselineFindings.length,
    after: currentFindings.length,
    predating,
    new: added.length,
    ignored: ignored.length,
    blocking: blocking.length
  };
  return { counts, new: added, ignored, blocking };
}

const IGNORE_FILE = path.join('docs', 'design', 'check-ui-ignore.json');
const IGNORE_FIELDS = ['type', 'file', 'reason'];
// Every type this script reports; an ignore entry naming another type, such as a renamed one, matches nothing.
const FINDING_TYPES = new Set([
  ...DECORATIVE_TELLS,
  'inline-event-handler', 'important-override', 'placeholder-copy', 'float-layout', 'physical-direction-property',
  'svg-without-viewbox', 'image-without-alt', 'image-without-dimensions', 'srcset-without-sizes',
  'missing-lang-attribute', 'inline-style-attribute', 'raw-value-in-component-rule', 'contrast-large-text',
  'contrast-normal-text', 'target-size-minimum', 'target-size-enhanced', 'contrast-non-text-ui',
  'repeated-surface-anatomy', 'content-clipped', 'element-overlap', 'crowded-controls', 'focus-indicator-missing',
  'horizontal-overflow', 'reflow-two-dimensional'
]);

async function readIgnoreEntries(directory) {
  const file = path.join(directory, IGNORE_FILE);
  const text = await fs.readFile(file, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (text === null) return [];
  let entries;
  try {
    entries = JSON.parse(text);
  } catch {
    throw new UsageError(`${IGNORE_FILE} is not JSON`);
  }
  if (!Array.isArray(entries)) throw new UsageError(`${IGNORE_FILE} must hold an array of entries`);
  entries.forEach((entry, index) => {
    for (const field of IGNORE_FIELDS) {
      const value = entry?.[field];
      if (typeof value !== 'string' || value.trim() === '') {
        throw new UsageError(`${IGNORE_FILE} entry ${index}: ${field} must be a non-empty string`);
      }
    }
    if (!FINDING_TYPES.has(entry.type)) {
      process.stderr.write(`ui-design: ${IGNORE_FILE} entry ${index}: unknown type ${entry.type}, so it ignores nothing\n`);
    }
    const ruleLocation = RULE_LOCATION.exec(entry.file);
    if (ruleLocation) {
      const warning = `entry ${index}: file ${entry.file} names a rule and its line; write ${ruleLocation[1]}`;
      process.stderr.write(`ui-design: ${IGNORE_FILE} ${warning}\n`);
    }
  });
  return entries;
}

async function main(argv) {
  const flags = parseFlags(argv,
    { url: 'value', source: 'value', viewport: 'list', baseline: 'value', summary: 'boolean' });
  if (!flags.url && !flags.source) throw new UsageError('at least one of --url or --source is required');
  const viewports = flags.viewport ? flags.viewport.map(parseViewport) : [parseViewport(DEFAULT_VIEWPORTS.at(-1))];
  const baselineFindings = flags.baseline ? await readBaseline(flags.baseline) : null;

  const report = {
    static: flags.source
      ? { status: 'ok', findings: await staticAudit(flags.source) }
      : { status: 'unavailable', reason: '--source was not given' },
    rendered: flags.url
      ? await renderedAudit({ url: requireUrl(flags.url), viewports, cwd: process.cwd() })
      : { status: 'unavailable', reason: '--url was not given' }
  };
  const findings = reportFindings(report) ?? [];
  let comparison = null;
  if (baselineFindings) {
    const ignoreEntries = await readIgnoreEntries(process.cwd());
    comparison = compareFindings(baselineFindings, findings, ignoreEntries);
    report.comparison = comparison;
  }
  report.notes = applyNotesTable(findings);

  if (flags.summary) {
    for (const line of summaryLines(report, findings, comparison ?? compareFindings([], findings, []))) {
      process.stdout.write(`${line}\n`);
    }
  } else {
    process.stdout.write(`${JSON.stringify(report)}\n`);
  }
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
