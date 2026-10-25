#!/usr/bin/env node
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
let target = null, out = '/tmp/look', app = false, shots = true;
const expects = [], states = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') out = args[++i];
  else if (args[i] === '--expect') expects.push(args[++i]);
  else if (args[i] === '--app') app = true;
  else if (args[i] === '--no-shots') shots = false;
  else if (args[i] === '--state') { const [name, ...js] = args[++i].split('='); states.push({ name: name.replace(/[^\w-]/g, '-'), js: js.join('=') }); }
  else target = args[i];
}
if (!target) { console.log('usage: node look.mjs <file-or-url> [--out <dir>] [--app] [--no-shots] [--expect "<text>"]... [--state "<name>=<js>"]...'); process.exit(2); }

async function loadPlaywright() {
  try { return await import('playwright'); } catch {}
  const root = join(homedir(), '.npm', '_npx');
  for (const d of existsSync(root) ? readdirSync(root) : []) {
    const p = join(root, d, 'node_modules', 'playwright', 'index.mjs');
    if (existsSync(p)) return await import(pathToFileURL(p).href);
  }
  return null;
}
const pw = await loadPlaywright();
if (!pw) { console.log('playwright missing: run `npx -y playwright@latest install chromium`'); process.exit(2); }
const chromium = pw.chromium ?? pw.default?.chromium;

const url = /^[a-z]+:\/\//i.test(target) ? target : pathToFileURL(resolve(target)).href;
mkdirSync(out, { recursive: true });

function measure() {
  const parse = (c) => { const m = c.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0]; return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 }; };
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const sel = (el) => { let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; else if (el.classList[0]) s += '.' + el.classList[0]; return s; };
  const rows = [];
  for (const el of document.body.querySelectorAll('*')) {
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0 || r.height === 0 || +cs.opacity === 0) continue;
    if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;
    const label = `${sel(el)} "${text.slice(0, 40)}"`;
    let op = 1, image = false, bg = { r: 255, g: 255, b: 255, a: 1 };
    const chain = [];
    for (let a = el; a; a = a.parentElement) {
      const s = getComputedStyle(a);
      op *= Number(s.opacity);
      if (s.backgroundImage !== 'none') image = true;
      chain.push(parse(s.backgroundColor));
    }
    if (op < 0.05) continue;
    for (const c of chain.reverse()) if (c.a > 0) bg = over(c, bg);
    if (image) rows.push(`SKIP ${label} (background-image, ratio still computed)`);
    const size = parseFloat(cs.fontSize), large = size >= 24 || (size >= 18.66 && +cs.fontWeight >= 700);
    const floor = large ? 3 : 4.5;
    const fill = cs.webkitTextFillColor || cs.color;
    const fg = parse(cs.color), fl = parse(fill);
    let ratio;
    if (fg.a === 0 || fl.a === 0 || cs.webkitTextFillColor === 'rgba(0, 0, 0, 0)') ratio = 1;
    else { const t = over({ ...fl, a: fl.a * op }, bg), l1 = lum(t), l2 = lum(bg); ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
    if (ratio < floor) rows.push(`CONTRAST ${ratio.toFixed(2)} ${floor} ${label}`);
  }
  return rows;
}

function layout(isApp) {
  const rows = [];
  const cap = (kind, list) => { rows.push(...list.slice(0, 5)); if (list.length > 5) rows.push(`${kind} +${list.length - 5} more`); };
  const own = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
  const sel = (el) => { let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; else if (el.classList[0]) s += '.' + el.classList[0]; return s; };
  const shown = (el) => { const cs = getComputedStyle(el), r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0 && +cs.opacity > 0.05; };
  const pinned = (el) => { for (let a = el; a; a = a.parentElement) { const p = getComputedStyle(a).position; if (p === 'fixed' || p === 'sticky') return a; } return null; };
  const clipped = (el) => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const s = getComputedStyle(a); if (s.overflowX !== 'visible' || s.overflowY !== 'visible') return a; } return null; };
  const cut = (r, c) => { const x = Math.max(r.left, c.left), y = Math.max(r.top, c.top), w = Math.min(r.right, c.right) - x, h = Math.min(r.bottom, c.bottom) - y; return w > 0 && h > 0 ? { left: x, top: y, right: x + w, bottom: y + h } : null; };
  const fonts = new Map(), clips = [], boxes = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName) || el.closest('svg')) continue;
    const text = own(el);
    if (!text || !shown(el)) continue;
    const cs = getComputedStyle(el), label = `${sel(el)} "${text.slice(0, 30)}"`;
    if (!el.closest('code, pre, kbd, samp')) { const f = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase(); fonts.set(f, fonts.get(f) ?? label); }
    const r = el.getBoundingClientRect();
    const box = clipped(el);
    if (cs.textOverflow !== 'ellipsis') {
      const c = box ? box.getBoundingClientRect() : { left: 0, right: innerWidth };
      const ellipsisBox = box && getComputedStyle(box).textOverflow === 'ellipsis';
      const partial = r.right > c.left && r.left < c.right && (r.right > c.right + 1 || r.left < c.left - 1);
      const self = ['hidden', 'clip'].includes(cs.overflowX) && el.scrollWidth > el.clientWidth + 1;
      if (!ellipsisBox && (partial || self)) clips.push(`CLIP ${innerWidth} ${label}`);
    }
    const range = document.createRange();
    const lines = [];
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { range.selectNodeContents(n); lines.push(...range.getClientRects()); }
    let area = { left: -1e9, top: -1e9, right: 1e9, bottom: 1e9 };
    for (let a = box; a && area; a = clipped(a)) area = cut(area, a.getBoundingClientRect());
    const kept = area ? lines.map((l) => cut(l, area)).filter((l) => l && l.right - l.left > 3 && l.bottom - l.top > 3) : [];
    if (kept.length) boxes.push({ el, label, lines: kept, layer: pinned(el) });
  }
  const overlaps = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.layer !== b.layer || a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const hit = a.lines.some((x) => b.lines.some((y) => { const c = cut(x, y); return c && c.right - c.left > 3 && c.bottom - c.top > 3; }));
    if (hit) overlaps.push(`OVERLAP ${innerWidth} ${a.label} | ${b.label}`);
  }
  cap('CLIP', clips);
  cap('OVERLAP', overlaps);
  if (fonts.size > 2) rows.push(`FONTS ${fonts.size} ${[...fonts].map(([f, l]) => `${f} (${l})`).join('; ')}`);
  if (isApp && innerWidth >= 1000 && document.documentElement.scrollHeight > innerHeight * 1.05) rows.push(`FIT ${innerWidth} page ${document.documentElement.scrollHeight}px tall, window ${innerHeight}px`);
  if (isApp && innerWidth < 600) {
    const bar = [...document.body.querySelectorAll('*')].some((el) => { const p = getComputedStyle(el).position, r = el.getBoundingClientRect(); return (p === 'fixed' || p === 'sticky') && shown(el) && r.bottom >= innerHeight - 4 && r.height <= 120 && el.querySelectorAll('a, button').length >= 3; });
    if (!bar) rows.push(`NAV ${innerWidth} no bottom tab bar with 3+ links or buttons`);
  }
  return rows;
}

const lines = [];
let fail = 0;
const browser = await chromium.launch();
for (const width of [1440, 768, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.on('console', (m) => { if (m.type() === 'error') { lines.push(`CONSOLE ${m.text().replace(/\s+/g, ' ')}`); fail++; } });
  page.on('pageerror', (e) => { lines.push(`CONSOLE ${String(e.message).replace(/\s+/g, ' ')}`); fail++; });
  page.on('requestfailed', (r) => { lines.push(`CONSOLE requestfailed ${r.url()}`); fail++; });
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(async () => {
    const h = () => document.documentElement.scrollHeight;
    for (let y = 0; y < h(); y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 80)); }
    window.scrollTo(0, h()); await new Promise((r) => setTimeout(r, 80));
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(600);
  if (shots && width !== 768) {
    const shot = join(out, `${width}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    lines.push(`SHOT ${shot}`);
  }
  if (width !== 768) for (const row of await page.evaluate(layout, app)) { lines.push(row); if (!/^\S+ \+\d+ more$/.test(row)) fail++; }
  if (width === 1440) {
    for (const row of await page.evaluate(measure)) { lines.push(row); if (!row.startsWith('SKIP')) fail++; }
    const body = (await page.evaluate(() => {
      const shown = (el) => { const cs = getComputedStyle(el), r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0 && +cs.opacity > 0.05; };
      const controls = [...document.querySelectorAll('a, button, [role=tab], [role=button], [tabindex], label, select option')].filter((c) => shown(c.tagName === 'OPTION' ? c.parentElement : c));
      const keys = (p) => [p.id, ...Object.values(p.dataset)].filter(Boolean);
      const opened = (p) => keys(p).some((k) => controls.some((c) => [...c.attributes].some((a) => a.value === k || a.value === `#${k}` || a.value.split(/\s+/).includes(k))))
        || (p.getAttribute('aria-labelledby') || '').split(/\s+/).some((id) => { const c = id && document.getElementById(id); return c && shown(c); });
      const present = (el) => {
        if (shown(el)) return true;
        let panel = null;
        for (let a = el; a && a !== document.body; a = a.parentElement) if (!shown(a) && (!a.parentElement || shown(a.parentElement) || a.parentElement === document.body)) { panel = a; break; }
        return !!panel && opened(panel);
      };
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), out = [];
      for (let n; (n = w.nextNode());) if (!n.parentElement.closest('script, style, noscript, template') && present(n.parentElement)) out.push(n.textContent);
      return out.join(' ').replace(/\s+/g, ' ');
    })).toLowerCase();
    for (const t of expects) if (!body.includes(t.toLowerCase())) { lines.push(`MISSING "${t}"`); fail++; }
  }
  if (width !== 768 && !app) {
    for (const t of expects) {
      const top = await page.evaluate((needle) => {
        for (const el of document.body.querySelectorAll('*')) {
          const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').toLowerCase();
          if (own.includes(needle) && !el.closest('a, button, nav, header, footer')) return Math.round(el.getBoundingClientRect().top + scrollY);
        }
        return null;
      }, t.toLowerCase());
      if (top !== null && top > 3000) { lines.push(`BELOW ${width} ${top} "${t}"`); fail++; }
    }
  }
  if (width !== 1440) {
    const px = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (px > 0) { lines.push(`OVERFLOW ${width} ${px}`); fail++; }
  }
  await page.close();
}
for (const { name, js } of shots ? states : []) for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  try {
    await page.evaluate(`(async () => { ${js} })()`);
    await page.waitForTimeout(500);
    const shot = join(out, `state-${name}-${width}.png`);
    await page.screenshot({ path: shot });
    lines.push(`SHOT ${shot}`);
  } catch (e) { lines.push(`STATE ${name} ${width} ${String(e.message).split('\n')[0]}`); fail++; }
  await page.close();
}
await browser.close();
console.log([...lines, `LOOK fail=${fail}`].join('\n'));
process.exit(fail > 0 ? 1 : 0);
