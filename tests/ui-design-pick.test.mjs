// Behavioral tests for pick.mjs: the usage contract, one answered round driven
// by a fake browser (fetch against the printed URL), the refusal to serve
// anything outside a variant directory, and the no-answer timeout.
// No browser opens: every run passes --no-open.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fixture, jsonFixture, run, script, SCRIPTS } from './harness.mjs';

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
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'index.html'), COMP(label));
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
  return { url, exit };
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
    assert.equal((html.match(/data-choose=/g) ?? []).length, 2, 'one choose button per variant');
    assert.equal((html.match(/class="pick"/g) ?? []).length, 2, 'one overlay button covers each card');
    assert.equal(
      (html.match(/aria-label="Choose this: /g) ?? []).length, 2,
      'the empty overlay still announces what choosing it picks'
    );
    assert.equal((html.match(/sandbox="allow-scripts"/g) ?? []).length, 3, 'every frame is sandboxed');
    assert.equal(
      (html.match(/<iframe inert /g) ?? []).length, 2,
      'the grid frames are out of the tab order, so the comps own links are not stops on the way to a choice'
    );
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

  it('gives every frame the shared size unless --intrinsic reads meta.json', async () => {
    const { comps, contracts } = await round();
    await fs.writeFile(path.join(comps, 'variant-1', 'meta.json'), '{"width":520,"height":900}');
    const shared = startPick(['--comps', comps, '--contracts', contracts, '--no-open', '--timeout', '30']);
    const sharedUrl = await shared.url;
    const sharedHtml = await (await fetch(sharedUrl)).text();
    assert.equal((sharedHtml.match(/--fw:1280/g) ?? []).length, 2, 'without --intrinsic every frame is 1280 wide');

    const intrinsic = startPick(['--comps', comps, '--contracts', contracts, '--intrinsic', '--no-open', '--timeout', '30']);
    const intrinsicUrl = await intrinsic.url;
    const intrinsicHtml = await (await fetch(intrinsicUrl)).text();
    assert.match(intrinsicHtml, /--fw:520/, 'with --intrinsic the second frame keeps its own width');
    assert.match(intrinsicHtml, /--fw:1280/, 'and the first keeps the default');

    // Answer both, so neither child lingers for the rest of its --timeout.
    await Promise.all([sharedUrl, intrinsicUrl].map((url) => answer(url, 0)));
    await Promise.all([shared.exit, intrinsic.exit]);
  });

  it('opens on the whole frame and lets the comps narrow it, except under --intrinsic', async () => {
    const { comps, contracts } = await round();
    const shared = startPick(['--comps', comps, '--contracts', contracts, '--no-open', '--timeout', '30']);
    const sharedUrl = await shared.url;
    const sharedHtml = await (await fetch(sharedUrl)).text();
    assert.equal(
      (sharedHtml.match(/--cw:1280;--ch:800;--cx:0;--cy:0/g) ?? []).length, 2,
      'the first paint shows each comp entire, before any comp has reported'
    );
    assert.match(sharedHtml, /const cropping = true;/, 'a shared frame may be cropped to its content');

    const origin = new URL(sharedUrl);
    const key = origin.searchParams.get('key');
    const comp = await fetch(`${origin.origin}/k/${key}/v/0/index.html`);
    const compMarkup = await comp.text();
    assert.match(compMarkup, /uiDesignContentBox/, 'the comp measures what it shows and reports it');
    assert.match(compMarkup, /uiDesignDocumentHeight: documentHeight\(\)/, 'and how tall it really is, for the enlarged view');

    const intrinsic = startPick(['--comps', comps, '--contracts', contracts, '--intrinsic', '--no-open', '--timeout', '30']);
    const intrinsicUrl = await intrinsic.url;
    assert.match(
      await (await fetch(intrinsicUrl)).text(), /const cropping = false;/,
      'a size comparison keeps its frames, because the size is the comparison'
    );

    await Promise.all([sharedUrl, intrinsicUrl].map((url) => answer(url, 0)));
    await Promise.all([shared.exit, intrinsic.exit]);
  });

  it('keeps the enlarge control off the comp until it is asked for', async () => {
    const { comps, contracts } = await round();
    const pick = startPick(['--comps', comps, '--contracts', contracts, '--no-open', '--timeout', '30']);
    const url = await pick.url;
    const html = await (await fetch(url)).text();
    assert.match(html, /\.enlarge \{[^}]*opacity: 0;[^}]*pointer-events: none;/,
      'nothing is painted over the comp at rest, and nothing invisible takes the click');
    assert.match(html, /\.tile:hover \.enlarge, \.enlarge:focus-visible \{/,
      'pointer and keyboard both reach it');
    assert.match(html, /@media \(hover: none\) \{\s*\.enlarge \{ opacity: 1;/,
      'a finger has no hover to reveal it with');

    await answer(url, 0);
    await pick.exit;
  });

  it('enlarges one comp whole, at its own frame size, beside the other seats', async () => {
    const { comps, contracts } = await round();
    const pick = startPick(['--comps', comps, '--contracts', contracts, '--no-open', '--timeout', '30']);
    const url = await pick.url;
    const html = await (await fetch(url)).text();
    assert.match(html, /\.zoom iframe \{[^}]*transform: scale\(var\(--zk\)\)/,
      'the comp is scaled whole, never reflowed into the shape of the dialog');
    assert.match(
      html,
      /const scale = Math\.min\(zoomCanvas\.clientWidth \/ frameWidth, zoomCanvas\.clientHeight \/ frameHeight, 1\);/,
      'it fills the room it is given and stops at life size'
    );
    assert.match(html, /zoomSeats\.append\(seatButton\);/,
      'the directions it is being compared against stay one click away');
    assert.match(html, /stepSeat\(event\.key === 'ArrowRight' \? 1 : -1\);/,
      'and one arrow key away');
    assert.match(html, /zoomRail\.replaceChildren\(\.\.\.material, zoomSize\);/,
      'the legend and the reason are the card own ones, never a second copy that can drift');
    assert.match(html, /String\(Math\.max\(frameHeight, documentHeights\.get\(seat\) \?\? 0\)\)/,
      'a comp taller than its frame is shown whole and smaller, never scrolled');
    assert.match(html, /html\.zoomed \{ overflow: hidden; \}/,
      'the page behind holds still while the panel is open');
    assert.match(html, /document\.documentElement\.classList\.remove\('zoomed'\)/,
      'and scrolls again once it closes');

    await answer(url, 0);
    await pick.exit;
  });

  it('travels into the enlarged view and marks the card whose answer is in flight', async () => {
    const { comps, contracts } = await round();
    const pick = startPick(['--comps', comps, '--contracts', contracts, '--no-open', '--timeout', '30']);
    const url = await pick.url;
    const html = await (await fetch(url)).text();
    assert.match(html, /@starting-style \{ dialog\[open\] \{ opacity: 0;/,
      'the enlarged view arrives from somewhere instead of replacing the page outright');
    assert.match(html, /display 200ms allow-discrete, overlay 200ms allow-discrete;/,
      'and leaves the same way, rather than being cut at frame one');
    assert.match(html, /\.grid\.deciding \.tile:not\(\.choosing\) \{ opacity: 0\.5; \}/,
      'the cards not chosen step back while the answer travels');
    assert.match(html, /chosen\.classList\.add\('choosing'\);/,
      'and the one that was clicked says so before the server can confirm it');
    assert.match(html, /dialog, dialog::backdrop \{ transition-duration: 1ms; \}/,
      'someone who asked for less motion gets the state without the travel');

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
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(path.join(directory, 'index.html'), COMP(label));
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
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(path.join(directory, 'index.html'), COMP(label));
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
      (html.match(/<li style="--swatch/g) ?? []).length, 2,
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
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(path.join(directory, 'index.html'), COMP(label));
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
      'each card overlay is named with it, and so is the zoom bar button'
    );
    assert.match(html, /Elegida: variante \{n\}\./, 'the done template reaches the page with its placeholder');
    assert.match(html, /Enlarge/, 'a key the file omits keeps the --lang wording');

    await answer(url, 0);
    await pick.exit;
  });

  it('refuses a --labels file with an unknown key or a dropped {n}', async () => {
    const { comps, contracts } = await round();
    const unknown = await jsonFixture('labels-unknown.json', { titel: 'Kies een richting' });
    const stripped = await jsonFixture('labels-stripped.json', { fallbackTitle: 'Richting' });

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
  });

  it('puts the recommendation note inside the recommended card only', async () => {
    const { comps, contracts } = await round();
    const pick = startPick([
      '--comps', comps, '--contracts', contracts, '--recommend', '1',
      '--recommend-note', 'Deze leest het rustigst op een klein scherm.',
      '--no-open', '--timeout', '30'
    ]);
    const url = await pick.url;
    const html = await (await fetch(url)).text();
    assert.equal(
      (html.match(/class="why"/g) ?? []).length, 1,
      'one card carries the reason, not every card'
    );
    assert.match(html, /Deze leest het rustigst op een klein scherm\./);
    const why = html.indexOf('class="why"');
    const second = html.indexOf('data-index="0"');
    assert.ok(why < second, 'and it is the recommended card, which sits first');

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

  it('exits 3 without stdout when no answer arrives before --timeout', async () => {
    const { comps, contracts } = await round();
    const result = await run(PICK, ['--comps', comps, '--contracts', contracts, '--no-open', '--timeout', '1']);
    assert.equal(result.code, 3, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /no choice arrived within 1s/);
  });
});
