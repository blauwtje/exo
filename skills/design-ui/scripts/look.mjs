#!/usr/bin/env node
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
let target = null, out = '/tmp/look';
const expects = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') out = args[++i];
  else if (args[i] === '--expect') expects.push(args[++i]);
  else target = args[i];
}
if (!target) { console.log('usage: node look.mjs <file-or-url> [--out <dir>] [--expect "<text>"]...'); process.exit(2); }

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
  const shot = join(out, `${width}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  lines.push(`SHOT ${shot}`);
  if (width === 1440) {
    for (const row of await page.evaluate(measure)) { lines.push(row); if (!row.startsWith('SKIP')) fail++; }
    const body = (await page.evaluate(() => document.body.innerText)).toLowerCase();
    for (const t of expects) if (!body.includes(t.toLowerCase())) { lines.push(`MISSING "${t}"`); fail++; }
  }
  if (width !== 768) {
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
  if (width === 390) {
    const px = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (px > 0) { lines.push(`OVERFLOW 390 ${px}`); fail++; }
  }
  await page.close();
}
await browser.close();
console.log([...lines, `LOOK fail=${fail}`].join('\n'));
process.exit(fail > 0 ? 1 : 0);
