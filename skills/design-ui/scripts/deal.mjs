#!/usr/bin/env node

const SEEDS = [
  ['Transit map', 'every category its own line color, used as thick bars and filled pills on calm panels', 'a plain grotesque with tabular numerals', 'radius 0 or full pill, colored rules, no shadow', 'tight'],
  ['Console hardware', 'graphite chrome in three value steps, one signal color for action and status, enamel-bright item art', 'a squared technical sans for labels, a calm text face', 'small radius, inner highlight, recessed wells for inputs', 'tight'],
  ['Toy plastic', 'one bright primary on chrome over a light ground, chunky item tiles in candy colors', 'a round geometric display at heavy weight over a plain text face', 'large radius, thick borders, press-down shadow on buttons', 'airy'],
  ['Riso print', 'paper ground with two or three overprinted spot inks and grain', 'a geometric display, a quiet text face', 'radius 0, misregistered offset fills, no shadow', 'airy'],
  ['Deep water', 'drenched in one deep hue, light content sheets, item art in reef colors', 'a humanist sans across a wide weight range', 'soft radius, no border, layered soft shadows', 'airy'],
  ['Sports broadcast', 'two saturated team colors on dark navy, slanted panel ends, score-bug chips for numbers', 'a condensed display for numbers and short labels only', 'skewed panel ends, small radius, hard edge light', 'tight'],
  ['Paper cutout', 'colored ground with layered flat cut shapes as imagery, white content sheets', 'a humanist display with a plain text face', 'irregular masks on art only, soft drop shadow', 'airy'],
  ['Studio daylight', 'cool white ground with large color fields per section or item, dark ink text', 'a neutral grotesque at strong weight contrast', 'hairline borders, shadow only on overlays', 'airy'],
  ['Arcade cabinet', 'deep ground with lit marquee panels, every item a bright cabinet-art tile, one hot primary', 'a wide or condensed display for titles only', 'bright edge on focus and selection, texture only in art', 'tight'],
  ['Greenhouse', 'leaf-green chrome, cool off-white panels, item fills in fruit and sky colors', 'a calligraphic-leaning sans display over a plain text face', 'generous radius, leaf-dark border, gentle shadow', 'airy'],
];

const USAGE = 'usage: node deal.mjs [--seed <n>]';
const args = process.argv.slice(2);
if (args.includes('--help')) { console.log(USAGE); process.exit(0); }
const at = args.indexOf('--seed');
let seed = at >= 0 ? Number(args[at + 1]) : Math.floor(Math.random() * 2 ** 31);
if (!Number.isFinite(seed)) { console.log(USAGE); process.exit(2); }
const next = () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31; };

const pool = [...SEEDS];
const dealt = [];
while (dealt.length < 2) dealt.push(pool.splice(Math.floor(next() * pool.length), 1)[0]);
console.log('Seeds only: add each to your own candidates; the subject\'s world decides.');
for (const [name, color, type, shape, density] of dealt) console.log(`SEED ${name}\n  color: ${color}\n  type: ${type}\n  shape: ${shape}\n  density: ${density}`);
