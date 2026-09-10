// Report what a rendered page actually emitted, as evidence for a visual critique.
// The numbers are diagnostics, never scores: more gradients, radii or images is
// not intrinsically better. Emits no rankings and no judgements.
//
//   node scripts/inspect-styles.mjs --url <url> [--viewport <width>x<height>]

import process from 'node:process';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { BROWSER_CAPABILITIES, openDrivenPage, parseFlags, parseViewport, requireUrl, UsageError } from './capture.mjs';

// SURVEY runs inside page.evaluate, where no CDP exists. It therefore reports
// only the DOM-side font channels; inspect() grades them in Node afterwards.
const SURVEY = () => {
  const GENERIC_FAMILIES = new Set([
    'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'math', 'emoji', 'fangsong',
    'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', '-apple-system', 'blinkmacsystemfont'
  ]);
  const PANGRAM = 'Sphinx of black quartz, judge my vow';
  const unquote = (value) => value.trim().replace(/^["']|["']$/g, '');
  const firstNamedFamily = (declaration) => {
    for (const entry of declaration.split(',')) {
      const family = unquote(entry);
      if (family && !GENERIC_FAMILIES.has(family.toLowerCase())) return family;
    }
    return null;
  };
  // A path of :nth-child steps from the root: unique, and resolvable by both
  // document.querySelector and CDP's DOM.querySelector.
  const uniqueSelector = (element) => {
    const steps = [];
    for (let node = element; node && node !== document.documentElement; node = node.parentElement) {
      const parent = node.parentElement;
      if (!parent) break;
      steps.unshift(`${node.localName}:nth-child(${Array.prototype.indexOf.call(parent.children, node) + 1})`);
    }
    return [':root', ...steps].join(' > ');
  };

  const elements = Array.from(document.querySelectorAll('*'));
  const tally = (values) => {
    const counts = new Map();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]));
  };
  const styles = elements.map((element) => ({ element, style: getComputedStyle(element) }));
  const visible = styles.filter(({ element }) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });

  const controlSignature = (style) =>
    [
      style.backgroundColor,
      style.color,
      style.borderWidth,
      style.borderStyle,
      style.borderColor,
      style.borderRadius,
      style.boxShadow,
      style.padding,
      style.fontSize,
      style.fontWeight
    ].join(' | ');

  const buttons = visible.filter(({ element }) =>
    element.matches('button, [role="button"], input[type="button"], input[type="submit"], a.button, .btn'));
  const inputs = visible.filter(({ element }) =>
    element.matches('input:not([type="button"]):not([type="submit"]), select, textarea'));

  const viewportArea = window.innerWidth * window.innerHeight;
  const imageArea = visible
    .filter(({ element }) => element.matches('img, svg, picture, canvas, video'))
    .reduce((total, { element }) => {
      const rect = element.getBoundingClientRect();
      return total + rect.width * rect.height;
    }, 0);

  const bordered = visible.filter(({ style }) =>
    ['Top', 'Right', 'Bottom', 'Left'].some(
      (side) => style[`border${side}Style`] !== 'none' && parseFloat(style[`border${side}Width`]) > 0));

  const faces = Array.from(document.fonts);
  const measure = document.createElement('canvas').getContext('2d');
  const pangramWidth = (font) => {
    measure.font = font;
    return measure.measureText(PANGRAM).width;
  };
  const monospaceWidth = pangramWidth('16px monospace');

  const sampled = new Map();
  for (const { element, style } of visible) {
    const family = firstNamedFamily(style.fontFamily);
    if (family && !sampled.has(family)) sampled.set(family, element);
  }
  const fontRenderCheck = [...sampled.entries()].map(([family, element]) => {
    const quoted = `"${family.replace(/"/g, '')}"`;
    let fontsCheck = false;
    try {
      fontsCheck = document.fonts.check(`16px ${quoted}`);
    } catch {
      fontsCheck = false;
    }
    return {
      family,
      sampleSelector: uniqueSelector(element),
      declared: true,
      loadedFace: faces.some((face) => unquote(face.family).toLowerCase() === family.toLowerCase() && face.status === 'loaded'),
      fontsCheck,
      metricDistinct: Math.abs(pangramWidth(`16px ${quoted}, monospace`) - monospaceWidth) > 0.5
    };
  });

  const visibleCount = (selector) => visible.filter(({ element }) => element.matches(selector)).length;

  return {
    status: 'ok',
    fonts: tally(visible.map(({ style }) => style.fontFamily)),
    backgrounds: tally(visible.map(({ style }) => style.backgroundColor)),
    bordered_element_count: bordered.length,
    box_shadow_patterns: tally(visible.map(({ style }) => style.boxShadow).filter((value) => value !== 'none')),
    border_radius_histogram: tally(visible.map(({ style }) => style.borderRadius).filter((value) => value !== '0px')),
    button_variants: tally(buttons.map(({ style }) => controlSignature(style))),
    input_variants: tally(inputs.map(({ style }) => controlSignature(style))),
    image_area_ratio: viewportArea === 0 ? 0 : Number((imageArea / viewportArea).toFixed(4)),
    gradient_count: visible.filter(({ style }) => style.backgroundImage.includes('gradient')).length,
    backdrop_filter_count: visible.filter(({ style }) => style.backdropFilter !== 'none').length,
    scroll_regions: visible.filter(({ element, style }) =>
      ['auto', 'scroll'].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1).length,
    focusable_elements: document.querySelectorAll(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])').length,
    loaded_fonts: faces.map((face) => ({
      family: unquote(face.family),
      status: face.status,
      weight: face.weight,
      style: face.style
    })),
    font_render_check: fontRenderCheck,
    media_participation: {
      img: visibleCount('img'),
      svg: visibleCount('svg'),
      canvas: visibleCount('canvas'),
      video: visibleCount('video')
    }
  };
};

const normalizeFamily = (value) => value.trim().replace(/^["']|["']$/g, '').toLowerCase();

/**
 * The platform families Chromium actually painted each sampled node with, or
 * `null` per record where CDP could not answer. A non-Chromium engine and a
 * failed CDP call are reported the same way — as absent evidence, never as a
 * silent negative — because both leave the question genuinely unanswered.
 */
async function readPlatformFonts(page, records) {
  const unanswered = records.map(() => null);
  if (records.length === 0) return unanswered;
  let cdp;
  try {
    cdp = await page.context().newCDPSession(page);
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
  } catch {
    return unanswered;
  }
  try {
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
    const resolved = [];
    for (const record of records) {
      try {
        const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: record.sampleSelector });
        if (!nodeId) {
          resolved.push(null);
          continue;
        }
        const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
        resolved.push(fonts.map((font) => font.familyName));
      } catch {
        resolved.push(null);
      }
    }
    return resolved;
  } catch {
    return unanswered;
  } finally {
    await cdp.detach().catch(() => {});
  }
}

/**
 * `definite` requires the platform to name the family it painted with; the full
 * DOM-side combination is only ever `potential`, because every one of those
 * channels answers "this face could be used", not "this face was used".
 */
export function fontConfidence(record, platformFonts) {
  if (platformFonts?.some((name) => normalizeFamily(name) === normalizeFamily(record.family))) return 'definite';
  if (record.loadedFace || record.fontsCheck || record.metricDistinct) return 'potential';
  return 'unknown';
}

export async function inspect({ url, viewport, cwd }) {
  const session = await openDrivenPage({
    cwd,
    url,
    viewport,
    requires: [BROWSER_CAPABILITIES.platformFonts]
  });
  if (!session.page) {
    return {
      status: 'unavailable',
      reason: session.capability.attempts.join('; '),
      hint: 'npm i -D playwright'
    };
  }
  try {
    await session.page.goto(url, { waitUntil: 'load' });
    const report = await session.page.evaluate(SURVEY);
    const platformFonts = await readPlatformFonts(session.page, report.font_render_check);
    report.font_render_check = report.font_render_check.map((record, index) => ({
      ...record,
      platformFonts: platformFonts[index],
      confidence: fontConfidence(record, platformFonts[index])
    }));
    return report;
  } finally {
    await session.close();
  }
}

async function main(argv) {
  const flags = parseFlags(argv, { url: 'value', viewport: 'value' });
  const url = requireUrl(flags.url);
  const viewport = flags.viewport ? parseViewport(flags.viewport) : { width: 1440, height: 900 };
  const report = await inspect({ url, viewport, cwd: process.cwd() });
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
