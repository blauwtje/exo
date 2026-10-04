// Behavioral tests for pick.mjs: the usage contract, one answered round driven
// by a fake browser (fetch against the printed URL), the refusal to serve
// anything outside a variant directory, and the no-answer timeout.
// No system browser opens: every run passes --no-open. The frame tests drive a
// headless browser when one resolves and skip otherwise.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { describe, it } from 'node:test';
import { openDrivenPage } from '../skills/design-ui/scripts/capture.mjs';
import { fixture, jsonFixture, run, script, SCRIPTS } from './harness.mjs';

const CAPTURES = ['comp-390x844-fullpage.png', 'comp-1440x900-fullpage.png'];

/** Fake the captures --check writes, stamped `ahead` ms from now, so a comp
 *  written after them in the same test still counts as checked. */
async function stampChecks(directory, names = CAPTURES, ahead = 60_000) {
  const checked = path.join(directory, 'checked');
  await fs.mkdir(checked, { recursive: true });
  const when = new Date(Date.now() + ahead);
  for (const name of names) {
    await fs.writeFile(path.join(checked, name), 'png');
    await fs.utimes(path.join(checked, name), when, when);
  }
}

/** One checked comp: its captures, then its index.html. */
async function writeComp(directory, markup) {
  await fs.mkdir(directory, { recursive: true });
  await stampChecks(directory);
  await fs.writeFile(path.join(directory, 'index.html'), markup);
}

const PICK = script('pick.mjs');
const COMP = (label) => `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${label}</title></head><body><h1>${label}</h1><button type="button">Actie</button></body></html>`;

function contract(index, mechanism) {
  return {
    schemaVersion: 1,
    seed: `atlas:${index}`,
    axes: {
      composition: { id: 'upper-left-high', value: { focalX: 0.2, focalY: 0.2, asymmetry: 'high' } },
      ground: { id: mechanism, value: { mechanism } },
      colorTopology: { id: 'regional-committed', value: { topology: 'regional', commitment: 'committed' } },
      type: { id: 'contrast-construction', value: { strategy: 'contrast-construction' } },
      material: { id: 'soft-ambient', value: { grammar: 'soft-ambient' } },
      densityCadence: { id: 'focal-run', value: { cadence: ['focal', 'dense', 'sparse', 'dense'], scaleContrast: 'high' } },
      artifact: { id: 'typographic', value: { class: 'typographic' } }
    }
  };
}

/** Two comp directories plus the matching contracts file. */
async function round() {
  const comps = await fixture();
  for (const label of ['variant-0', 'variant-1']) {
    const directory = path.join(comps, label);
    await writeComp(directory, COMP(label));
  }
  await fs.writeFile(path.join(comps, 'secret.txt'), 'not a comp asset');
  const contracts = await jsonFixture('contracts.json', {
    schemaVersion: 1, seed: 'atlas', status: 'ok',
    contracts: [contract(0, 'light-field'), contract(1, 'tide-band-strata')]
  });
  return { comps, contracts };
}

/** Start pick.mjs and resolve its URL from stderr while it is still blocking. */
function startPick(args) {
  const child = spawn(process.execPath, [PICK, ...args], { cwd: SCRIPTS });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const exit = new Promise((resolve) => child.on('close', (code) => resolve({ code, stdout, stderr })));
  const url = new Promise((resolve, reject) => {
    child.stderr.on('data', () => {
      const match = /pick URL (http:\/\/127\.0\.0\.1:\d+\/\?key=[0-9a-f]+)/.exec(stderr);
      if (match) resolve(match[1]);
    });
    child.on('close', () => reject(new Error(`pick.mjs exited before printing a URL: ${stderr}`)));
  });
  return { url, exit, stderr: () => stderr };
}

/** The text each comp frame of a running picker shows in its #root, read the
 *  way the chooser meets it, or null when no driven browser resolves here. */
async function frameTexts(url) {
  const { page, close } = await openDrivenPage({ url: 'about:blank', viewport: { width: 1200, height: 800 } });
  if (!page) return null;
  try {
    await page.goto(url);
    const frames = page.frames().filter((frame) => frame !== page.mainFrame());
    return await Promise.all(frames.map(async (frame) => {
      await frame.waitForFunction(() => document.getElementById('root')?.textContent, null, { timeout: 5000 }).catch(() => {});
      return frame.evaluate(() => document.getElementById('root')?.textContent ?? '');
    }));
  } finally {
    await close();
  }
}

// What a bundler such as Vite emits: an empty root filled by a module script.
const BUNDLED_COMP = '<!doctype html><html lang="nl"><head><meta charset="utf-8"><script type="module" crossorigin src="./assets/index.js"></script></head><body><div id="root"></div></body></html>';

// A stand-in for a Vite dev server: it answers cross-origin requests only for a
// localhost origin, the default server.cors of Vite 6 and later, so a frame
// with an opaque origin gets no module script from it.
async function startDevServer() {
  const server = http.createServer((request, response) => {
    const origin = request.headers.origin;
    const headers = {};
    if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) headers['access-control-allow-origin'] = origin;
    const { pathname } = new URL(request.url, 'http://127.0.0.1');
    if (pathname === '/directions.html') {
      response.writeHead(200, { ...headers, 'content-type': 'text/html; charset=utf-8' });
      return response.end('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module" src="/main.js"></script></body></html>');
    }
    if (pathname === '/main.js') {
      response.writeHead(200, { ...headers, 'content-type': 'text/javascript' });
      return response.end("document.getElementById('root').textContent = `direction ${new URLSearchParams(location.search).get('direction')}`;");
    }
    response.writeHead(404, headers);
    response.end();
  });
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => {
      server.close();
      server.closeAllConnections();
    }
  };
}

/** POST one answer to a running picker, the way the page's own click does. */
function answer(url, index, steer = '') {
  const origin = new URL(url);
  return fetch(`${origin.origin}/answer${origin.search}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ index, steer })
  });
}

describe('pick.mjs', () => {
  it('exits 2 with usage on stderr when --comps is missing', async () => {
    const result = await run(PICK, ['--no-open']);
    assert.equal(result.code, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /--comps is required/);
  });

  it('prints the clicked variant as one JSON line and exits 0', async () => {
    const { comps, contracts } = await round();
    const pick = startPick(['--comps', comps, '--contracts', contracts, '--no-open', '--timeout', '30']);
    const url = await pick.url;

    const page = await fetch(url);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.equal((html.match(/data-choose=/g) ?? []).length, 1, 'one choose button in the bar');
    assert.match(html, /class="choose" id="choose" data-choose="0"/, 'it answers with the tab on screen');
    assert.equal(
      (html.match(/aria-label="Choose this: /g) ?? []).length, 1,
      'and it announces which direction it picks'
    );
    assert.equal((html.match(/sandbox="allow-scripts"/g) ?? []).length, 2, 'every frame is sandboxed');
    assert.doesNotMatch(html, /<iframe inert/, 'the comps take the pointer, so their hover and motion run');
    assert.doesNotMatch(html, /\son[a-z]+\s*=\s*["'][^"']/i, 'no inline event handler');

    const origin = new URL(url);
    const key = origin.searchParams.get('key');
    const comp = await fetch(`${origin.origin}/k/${key}/v/1/index.html`);
    assert.equal(comp.status, 200);
    assert.match(await comp.text(), /window\.open = \(\) => null/, 'the demo shim is injected');

    const escape = await fetch(`${origin.origin}/k/${key}/v/1/..%2Fsecret.txt`);
    assert.equal(escape.status, 404, 'nothing outside the variant directory is served');

    const malformed = await fetch(`${origin.origin}/k/${key}/v/1/100%.png`);
    assert.equal(malformed.status, 404, 'a lone % is a missing asset, not a crashed picker');

    const accepted = await answer(url, 1, 'meer contrast in de kop');
    assert.equal(accepted.status, 200);

    const result = await pick.exit;
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { index: 1, label: 'variant-1', steer: 'meer contrast in de kop' });
  });

  it('fills the panel width unless --frame or --intrinsic sets one', async () => {
    const { comps, contracts } = await round();
    await fs.writeFile(path.join(comps, 'variant-1', 'meta.json'), '{"width":520,"height":900}');
    await stampChecks(path.join(comps, 'variant-1'));
    const runs = [[], ['--frame', '800x600'], ['--intrinsic']].map((extra) =>
      startPick(['--comps', comps, '--contracts', contracts, ...extra, '--no-open', '--timeout', '30']));
    const urls = await Promise.all(runs.map((each) => each.url));
    const [full, framed, intrinsic] = await Promise.all(urls.map(async (url) => (await fetch(url)).text()));
    assert.doesNotMatch(full, /<iframe[^>]*style=/, 'by default every frame is as wide as its panel');
    assert.equal((framed.match(/style="inline-size:800px"/g) ?? []).length, 2, '--frame sets one width, ignoring the height');
    assert.match(intrinsic, /style="inline-size:520px"/, 'with --intrinsic the second frame keeps its own width');
    assert.equal((intrinsic.match(/<iframe[^>]*style=/g) ?? []).length, 1, 'and the first stays full width');

    await Promise.all(urls.map((url) => answer(url, 0)));
    await Promise.all(runs.map((each) => each.exit));
  });

  it('shows each comp whole in its own tab at scale 1', async () => {
    const { comps, contracts } = await round();
    const pick = startPick(['--comps', comps, '--contracts', contracts, '--no-open', '--timeout', '30']);
    const url = await pick.url;
    const html = await (await fetch(url)).text();
    assert.equal((html.match(/role="tablist"/g) ?? []).length, 1, 'one tab strip');
    assert.equal((html.match(/role="tab" /g) ?? []).length, 2, 'one tab per variant');
    assert.equal((html.match(/role="tabpanel"/g) ?? []).length, 2, 'one panel per variant');
    assert.equal((html.match(/role="tabpanel"[^>]* hidden>/g) ?? []).length, 1, 'only the first panel shows');
    assert.match(html, /aria-label="Directions"/, 'the strip is named');
    assert.match(html, /color-scheme: dark;\s*--radius-card/,
      'the chrome stays dark and neutral after the shared tokens, whatever the system theme');
    assert.doesNotMatch(/\.panel iframe \{[^}]*\}/.exec(html)[0], /transform|scale/, 'no comp frame is transformed or scaled');
    assert.doesNotMatch(html, /transform: scale|--zk|--k:/, 'and nothing scales one anywhere on the page');
    assert.doesNotMatch(html, /<dialog|data-zoom/, 'and no enlarged view remains');
    assert.match(html, /\{ ArrowRight: 1, ArrowLeft: -1 \}/, 'arrow keys move along the strip');
    assert.match(html, /body\.deciding \.tab:not\(\.choosing\) \{ opacity: 0\.5; \}/,
      'the tabs not chosen step back while the answer travels');

    const origin = new URL(url);
    const key = origin.searchParams.get('key');
    const compMarkup = await (await fetch(`${origin.origin}/k/${key}/v/0/index.html`)).text();
    assert.doesNotMatch(compMarkup, /postMessage/, 'a comp forwards no key, so its arrows scroll it');

    await answer(url, 0);
    await pick.exit;
  });

  it('carries a sentence for an answer that never reached the picker', async () => {
    const { comps, contracts } = await round();
    const labels = await jsonFixture('labels-failed.json', { failed: 'No llego tu eleccion.' });
    const builtIn = startPick(['--comps', comps, '--contracts', contracts, '--no-open', '--timeout', '30']);
    const builtInUrl = await builtIn.url;
    assert.match(
      await (await fetch(builtInUrl)).text(), /Your choice did not arrive/,
      'the default wording sends the chooser back to the conversation'
    );

    const written = startPick([
      '--comps', comps, '--contracts', contracts, '--labels', labels, '--no-open', '--timeout', '30'
    ]);
    const writtenUrl = await written.url;
    assert.match(await (await fetch(writtenUrl)).text(), /No llego tu eleccion\./, 'the skill can write it');

    await Promise.all([builtInUrl, writtenUrl].map((url) => answer(url, 0)));
    await Promise.all([builtIn.exit, written.exit]);
  });

  it('shows the contract title, its description, and the recommended variant', async () => {
    const comps = await fixture();
    for (const label of ['variant-0', 'variant-1']) {
      const directory = path.join(comps, label);
      await writeComp(directory, COMP(label));
    }
    const named = [contract(0, 'light-field'), contract(1, 'tide-band-strata')];
    named[1].title = 'Koel en technisch';
    named[1].description = 'Diepe blauwen, veel contrast, nadruk op cijfers.';
    const contracts = await jsonFixture('named-contracts.json', {
      schemaVersion: 1, seed: 'atlas', status: 'ok', contracts: named
    });

    const pick = startPick(['--comps', comps, '--contracts', contracts, '--recommend', '1', '--no-open', '--timeout', '30']);
    const url = await pick.url;
    const html = await (await fetch(url)).text();
    assert.match(html, /Koel en technisch/, 'the title the skill wrote is the heading');
    assert.match(html, /Diepe blauwen, veel contrast, nadruk op cijfers\./, 'its description sits under it');
    assert.ok(
      html.indexOf('data-index="1"') < html.indexOf('data-index="0"'),
      'the recommended variant takes the first seat'
    );
    assert.doesNotMatch(html, /Claude raadt/, 'the seat and the badge state it, not a sentence of chrome');
    assert.equal((html.match(/class="badge"/g) ?? []).length, 1, 'exactly one variant is badged');
    assert.match(html, /Option B/, 'an unnamed variant is marked by its seat, not by its directory');
    assert.match(html, /<span class="ordinal">A<\/span>/, 'seats are lettered, so a chooser names one rather than counting');
    assert.doesNotMatch(html, /tide-band-strata/, 'no dealt axis id reaches the chooser');

    await answer(url, 0);
    await pick.exit;
  });

  it('shows the typeface and what each colour is for under a comp', async () => {
    const comps = await fixture();
    for (const label of ['variant-0', 'variant-1']) {
      const directory = path.join(comps, label);
      await writeComp(directory, COMP(label));
    }
    const signed = [contract(0, 'light-field'), contract(1, 'tide-band-strata')];
    signed[0].type = { display: { family: 'Fraunces' }, body: { family: 'Inter' } };
    signed[0].signature = {
      typeface: "'Fraunces', Georgia, serif",
      fontHref: 'https://fonts.example/fraunces.css',
      colors: [
        { role: 'Achtergrond', name: 'Bijna zwart', value: '#0e1116' },
        { role: 'Tekst', value: '#e7ecf3' }
      ]
    };
    const contracts = await jsonFixture('signed-contracts.json', {
      schemaVersion: 1, seed: 'atlas', status: 'ok', contracts: signed
    });

    const pick = startPick(['--comps', comps, '--contracts', contracts, '--no-open', '--timeout', '30']);
    const url = await pick.url;
    const html = await (await fetch(url)).text();
    assert.match(html, /--face:&#39;Fraunces&#39;, Georgia, serif/, 'the sample is set in the face itself');
    assert.match(html, /<span class="tone">Fraunces<\/span>/, 'the name comes from type.display.family');
    assert.match(html, /<span class="role">Letters<\/span>/, 'and sits in the same column as the colour roles');
    assert.match(html, /--swatch:#0e1116/, 'each colour reaches its own dot');
    assert.match(html, /Achtergrond/, 'and is labelled by the job it does');
    assert.match(html, /Bijna zwart/, 'and by the name the skill wrote for it');
    assert.match(html, /<code>#0E1116<\/code>/, 'the code is shown in one case, whatever was typed');
    assert.equal(
      (html.match(/<span class="swatch" style="--swatch/g) ?? []).length, 2,
      'a colour without a name still emits its row, so the codes stay in line'
    );
    assert.equal(
      (html.match(/fonts\.example\/fraunces\.css/g) ?? []).length, 1,
      'the face stylesheet is linked once, not per variant'
    );
    assert.equal((html.match(/class="signature"/g) ?? []).length, 1, 'a contract without one renders no line');

    await answer(url, 0);
    await pick.exit;
  });

  it('refuses a signature that could inject CSS or fetch over http', async () => {
    const comps = await fixture();
    for (const label of ['variant-0', 'variant-1']) {
      const directory = path.join(comps, label);
      await writeComp(directory, COMP(label));
    }
    const build = async (name, signature) => {
      const list = [contract(0, 'light-field'), contract(1, 'tide-band-strata')];
      list[0].signature = signature;
      return jsonFixture(name, { schemaVersion: 1, seed: 'atlas', status: 'ok', contracts: list });
    };
    const injected = await build('signature-injection.json', {
      colors: [{ role: 'Achtergrond', value: 'red; background-image: url(https://tracker.example/p.gif)' }]
    });
    const insecure = await build('signature-http.json', {
      typeface: 'Inter, sans-serif', fontHref: 'http://fonts.example/inter.css'
    });

    const one = await run(PICK, ['--comps', comps, '--contracts', injected, '--no-open']);
    assert.equal(one.code, 2);
    assert.match(one.stderr, /signature\.colors\[0\]\.value may not hold/);

    const two = await run(PICK, ['--comps', comps, '--contracts', insecure, '--no-open']);
    assert.equal(two.code, 2);
    assert.match(two.stderr, /signature\.fontHref must be an https URL/);
  });

  it('takes the screen copy from --labels and falls back for what it omits', async () => {
    const { comps, contracts } = await round();
    const labels = await jsonFixture('labels.json', {
      lang: 'es',
      title: 'Elige una direccion',
      choose: 'Elegir esta',
      done: 'Elegida: variante {n}.'
    });
    const pick = startPick([
      '--comps', comps, '--contracts', contracts, '--labels', labels, '--no-open', '--timeout', '30'
    ]);
    const url = await pick.url;
    const html = await (await fetch(url)).text();
    assert.match(html, /Elige una direccion/, 'the skill-written title is the heading');
    assert.equal(
      (html.match(/Elegir esta/g) ?? []).length, 3,
      'the bar button shows it, names its direction with it, and keeps it for the next tab'
    );
    assert.match(html, /Elegida: variante \{n\}\./, 'the done template reaches the page with its placeholder');
    assert.match(html, /aria-label="Directions"/, 'a key the file omits keeps the English last resort');
    assert.match(html, /<html lang="es">/, 'the file that carries the words names their language');

    await answer(url, 0);
    await pick.exit;
  });

  it('ships no language to choose from, so --lang is not a flag', async () => {
    const { comps, contracts } = await round();
    const rejected = await run(PICK,
      ['--comps', comps, '--contracts', contracts, '--lang', 'nl', '--no-open', '--timeout', '1']);
    assert.equal(rejected.code, 2);
    assert.match(rejected.stderr, /unknown flag '--lang'/);

    const noLabels = startPick(['--comps', comps, '--contracts', contracts, '--no-open', '--timeout', '30']);
    const url = await noLabels.url;
    assert.match(await (await fetch(url)).text(), /<html lang="en">/,
      'with no file to name a language the last-resort copy is English and says so');
    await answer(url, 0);
    await noLabels.exit;
  });

  it('refuses a --labels file with an unknown key, a dropped {n}, or a lang that is not a tag', async () => {
    const { comps, contracts } = await round();
    const unknown = await jsonFixture('labels-unknown.json', { titel: 'Kies een richting' });
    const stripped = await jsonFixture('labels-stripped.json', { fallbackTitle: 'Richting' });
    const sentence = await jsonFixture('labels-lang.json', { lang: 'Nederlands" onload="x' });

    // Both runs carry --timeout 1: a validation that wrongly passes then exits 3
    // in a second, where the default would block this test for ten minutes.
    const typo = await run(PICK,
      ['--comps', comps, '--contracts', contracts, '--labels', unknown, '--no-open', '--timeout', '1']);
    assert.equal(typo.code, 2);
    assert.match(typo.stderr, /--labels holds unknown key 'titel'/);

    const dropped = await run(PICK,
      ['--comps', comps, '--contracts', contracts, '--labels', stripped, '--no-open', '--timeout', '1']);
    assert.equal(dropped.code, 2);
    assert.match(dropped.stderr, /--labels key 'fallbackTitle' must keep the \{n\} placeholder/);

    const injected = await run(PICK,
      ['--comps', comps, '--contracts', contracts, '--labels', sentence, '--no-open', '--timeout', '1']);
    assert.equal(injected.code, 2);
    assert.match(injected.stderr, /--labels key 'lang' must be a language tag/);
  });

  it('prints the URL only once every comp has landed', async () => {
    const comps = await fixture();
    const contracts = await jsonFixture('late-contracts.json', {
      schemaVersion: 1, seed: 'atlas', status: 'ok',
      contracts: [contract(0, 'light-field'), contract(1, 'tide-band-strata')]
    });

    const pick = startPick(['--comps', comps, '--contracts', contracts, '--no-open', '--timeout', '30']);
    let printed = false;
    pick.url.then(() => { printed = true; }, () => {});
    const settle = () => new Promise((resolve) => { setTimeout(resolve, 700); });

    await settle();
    assert.equal(printed, false, 'no tab opens while no comp exists');

    const second = path.join(comps, 'variant-1');
    await writeComp(second, COMP('variant-1'));
    await settle();
    assert.equal(printed, false, 'nor while one comp is still missing');

    const first = path.join(comps, 'variant-0');
    await writeComp(first, COMP('variant-0'));
    const url = await pick.url;
    assert.match(pick.stderr(), /every comp landed after \d+\.\d+s/, 'the wait is reported, so a run can be timed');

    const page = await (await fetch(url)).text();
    assert.doesNotMatch(page, /aria-busy/, 'the first page already holds every comp');
    assert.equal(
      (page.match(/<iframe[^>]* src="\/k\/[0-9a-f]+\/v\/\d\/index\.html"/g) ?? []).length, 2,
      'and points every card at its comp'
    );

    await answer(url, 1);
    await pick.exit;
  });

  it('wraps a comp fragment in the document shell and leaves a whole document alone', async () => {
    const comps = await fixture();
    const fragmentDirectory = path.join(comps, 'variant-0');
    await writeComp(fragmentDirectory,
      '<style>main{background:#0b1b2b;color:#f4e9d8;font-family:Fraunces,serif;padding:64px}</style>\n<main><h1>Tij</h1></main>');
    const wholeDirectory = path.join(comps, 'variant-1');
    await writeComp(wholeDirectory, COMP('variant-1'));
    const contracts = await jsonFixture('shell-contracts.json', {
      schemaVersion: 1, seed: 'atlas', status: 'ok',
      contracts: [contract(0, 'light-field'), contract(1, 'tide-band-strata')]
    });

    const pick = startPick(['--comps', comps, '--contracts', contracts, '--no-open', '--timeout', '30']);
    const url = await pick.url;
    const { origin, searchParams } = new URL(url);
    const comp = (index) => fetch(`${origin}/k/${searchParams.get('key')}/v/${index}/index.html`).then((held) => held.text());

    const fragment = await comp(0);
    assert.equal((fragment.match(/<!doctype html>/gi) ?? []).length, 1,
      'the server owns the document, so a fragment is given exactly one');
    assert.match(fragment, /Fraunces/, "the direction's own type stays inside the comp");
    assert.match(fragment, /window\.open = \(\) => null/, 'and the demo shim still reaches it');
    const shell = /<style>([^<]*)<\/style>/.exec(fragment)[1];
    assert.match(shell, /box-sizing:border-box/, 'the shell carries the structural reset');
    assert.doesNotMatch(shell, /font-family|background|#[0-9a-f]{3}|padding:\s*[1-9]/i,
      'and names no typeface, colour or spacing: a shared theme would destroy the comparison');

    const whole = await comp(1);
    assert.equal((whole.match(/<!doctype html>/gi) ?? []).length, 1, 'a comp that wrote its own document keeps it');
    assert.match(whole, /<html lang="nl">/, 'including the language it set for itself');
    assert.match(whole, /window\.open = \(\) => null/);

    await answer(url, 0);
    await pick.exit;
  });

  it('exits 3 when the comps never all land before --timeout', async () => {
    const comps = await fixture();
    const contracts = await jsonFixture('missing-contracts.json', {
      schemaVersion: 1, seed: 'atlas', status: 'ok', contracts: [contract(0, 'light-field')]
    });
    const result = await run(PICK,
      ['--comps', comps, '--contracts', contracts, '--intrinsic', '--no-open', '--timeout', '1']);
    assert.equal(result.code, 3, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /not every comp landed within 1s/);
  });

  it('puts the recommendation note once, above the cards', async () => {
    const { comps, contracts } = await round();
    const pick = startPick([
      '--comps', comps, '--contracts', contracts, '--recommend', '1',
      '--recommend-note', 'Deze leest het rustigst op een klein scherm.',
      '--no-open', '--timeout', '30'
    ]);
    const url = await pick.url;
    const html = await (await fetch(url)).text();
    assert.equal((html.match(/class="why"/g) ?? []).length, 1, 'one line carries the reason, not every card');
    assert.match(html, /Deze leest het rustigst op een klein scherm\./);
    assert.ok(html.indexOf('class="why"') < html.indexOf('role="tablist"'),
      'and it sits in the header, above the strip');

    await answer(url, 0);
    await pick.exit;
  });

  it('refuses a --recommend-note without a --recommend to explain', async () => {
    const { comps, contracts } = await round();
    const result = await run(PICK, [
      '--comps', comps, '--contracts', contracts,
      '--recommend-note', 'Zonder keuze te verklaren.', '--no-open', '--timeout', '1'
    ]);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /--recommend-note needs --recommend/);
  });

  it('rejects a --recommend outside the variant range', async () => {
    const { comps, contracts } = await round();
    const result = await run(PICK, ['--comps', comps, '--contracts', contracts, '--recommend', '5', '--no-open']);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /--recommend must be a variant index from 0 to 1/);
  });

  it('refuses the picker until every comp has a fresh capture at both widths', async () => {
    const refusal = /variant-(\d) has no capture at (\d+) newer than its comp; run pick\.mjs --check/;
    const attempt = (comps, contracts, extra = []) =>
      run(PICK, ['--comps', comps, '--contracts', contracts, ...extra, '--no-open', '--timeout', '5']);

    const bare = await round();
    await fs.rm(path.join(bare.comps, 'variant-0', 'checked'), { recursive: true });
    const none = await attempt(bare.comps, bare.contracts);
    assert.equal(none.code, 2, none.stderr);
    assert.match(none.stderr, refusal);

    const stale = await round();
    await stampChecks(path.join(stale.comps, 'variant-1'), CAPTURES, -60_000);
    const older = await attempt(stale.comps, stale.contracts);
    assert.equal(older.code, 2, 'an index.html newer than its captures is refused');
    assert.match(older.stderr, /variant-1 has no capture at 390/);

    const asset = await round();
    const later = new Date(Date.now() + 120_000);
    await fs.writeFile(path.join(asset.comps, 'variant-0', 'style.css'), 'body{}');
    await fs.utimes(path.join(asset.comps, 'variant-0', 'style.css'), later, later);
    const edited = await attempt(asset.comps, asset.contracts);
    assert.equal(edited.code, 2, 'an asset edited after the check is refused');
    assert.match(edited.stderr, /variant-0 has no capture at 390/);

    const narrow = await round();
    await fs.rm(path.join(narrow.comps, 'variant-1', 'checked', CAPTURES[1]));
    const half = await attempt(narrow.comps, narrow.contracts);
    assert.equal(half.code, 2, 'one width missing is refused');
    assert.match(half.stderr, /variant-1 has no capture at 1440/);

    const unchecked = startPick(['--comps', bare.comps, '--contracts', bare.contracts, '--unchecked', '--no-open', '--timeout', '30']);
    const url = await unchecked.url;
    assert.match(unchecked.stderr(), /ui-design: comps shown unchecked/, '--unchecked serves and says so');
    await answer(url, 0);
    assert.equal((await unchecked.exit).code, 0);
  });

  it('--check exits 2 naming a missing comp and 3 with no browser engine', async () => {
    const { comps, contracts } = await round();
    await fs.rm(path.join(comps, 'variant-1', 'index.html'));
    const missing = await run(PICK, ['--check', '--comps', comps, '--contracts', contracts]);
    assert.equal(missing.code, 2, missing.stderr);
    assert.match(missing.stderr, /variant-1\/index\.html is missing/);

    const ready = await round();
    const blind = await run(PICK, ['--check', '--comps', ready.comps, '--contracts', ready.contracts],
      { env: { UI_DESIGN_TEST_DISABLE_BROWSER_DISCOVERY: '1', CHROME_PATH: '' } });
    assert.equal(blind.code, 3, blind.stderr);
    assert.equal(blind.stdout, '');
    assert.match(blind.stderr, /no browser available/);
  });

  it('shows a bundled comp inside its frame, module script and all', async (t) => {
    const { comps, contracts } = await round();
    for (const index of [0, 1]) {
      const directory = path.join(comps, `variant-${index}`);
      await fs.mkdir(path.join(directory, 'assets'), { recursive: true });
      await fs.writeFile(path.join(directory, 'assets', 'index.js'), `document.getElementById('root').textContent = 'bundled ${index}';`);
      await writeComp(directory, BUNDLED_COMP);
    }
    const pick = startPick(['--comps', comps, '--contracts', contracts, '--no-open', '--timeout', '30']);
    const url = await pick.url;
    try {
      const { origin, searchParams } = new URL(url);
      const script = await fetch(`${origin}/k/${searchParams.get('key')}/v/0/assets/index.js`, { headers: { origin: 'null' } });
      assert.equal(script.headers.get('access-control-allow-origin'), 'null', 'a sandboxed frame may load the module script');

      const texts = await frameTexts(url);
      if (texts === null) return t.skip('no driven browser resolves here');
      assert.deepEqual(texts, ['bundled 0', 'bundled 1'], 'no frame stays empty');
    } finally {
      await answer(url, 0);
      await pick.exit;
    }
  });

  it('shows a dev-server comp per variant inside its frame', async (t) => {
    const { comps, contracts } = await round();
    const source = await fixture();
    for (const index of [0, 1]) await fs.mkdir(path.join(source, String(index)));
    const devServer = await startDevServer();
    try {
      const pick = startPick([
        '--comps', comps, '--contracts', contracts, '--no-open', '--timeout', '30',
        '--url', `${devServer.origin}/directions.html?direction={n}`, '--source', path.join(source, '{n}')
      ]);
      const url = await pick.url;
      try {
        const html = await (await fetch(url)).text();
        assert.match(html, /sandbox="allow-scripts allow-same-origin"[^>]*src="http:\/\/127\.0\.0\.1:\d+\/directions\.html\?direction=1"/,
          'a dev-server comp keeps its own origin');

        const texts = await frameTexts(url);
        if (texts === null) return t.skip('no driven browser resolves here');
        assert.deepEqual(texts, ['direction 0', 'direction 1'], 'no frame stays empty');
      } finally {
        await answer(url, 0);
        await pick.exit;
      }
    } finally {
      devServer.close();
    }
  });

  it('exits 2 on a --url, --source or --variant it cannot use', async () => {
    const { comps, contracts } = await round();
    const base = ['--comps', comps, '--contracts', contracts, '--no-open', '--timeout', '1'];
    const cases = [
      [['--url', 'http://localhost:5173/', '--source', 'src/{n}'], /--url needs \{n\}/],
      [['--url', 'file:///tmp/{n}', '--source', 'src/{n}'], /--url must be an http\(s\) URL/],
      [['--url', 'http://localhost:5173/?d={n}'], /--url needs --source/],
      [['--source', 'src/{n}'], /--source belongs to --url/],
      [['--variant', '0'], /--variant belongs to --check/],
      [['--check', '--variant', '2'], /--variant must be a variant index from 0 to 1/]
    ];
    for (const [extra, message] of cases) {
      const result = await run(PICK, [...base, ...extra]);
      assert.equal(result.code, 2, `${extra.join(' ')}: ${result.stderr}`);
      assert.match(result.stderr, message);
    }
  });

  it('exits 3 without stdout when no answer arrives before --timeout', async () => {
    const { comps, contracts } = await round();
    const result = await run(PICK, ['--comps', comps, '--contracts', contracts, '--no-open', '--timeout', '1']);
    assert.equal(result.code, 3, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /no choice arrived within 1s/);
  });
});
