#!/usr/bin/env node

const DIRECTIONS = [
  ['Night market', 'deep maroon or aubergine chrome bar, lantern-yellow primary button, every item tile its own saturated hue', 'one rounded sans at 500/700/800: ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", sans-serif', 'pill buttons, 12px cards, soft long shadow'],
  ['Sticker sheet', 'warm mid-tone ground with a dot or grid texture, each content type a whole card in its own flat color (mint, mustard, plum, navy)', 'one heavy rounded sans: ui-rounded, "Avenir Next Rounded", "Arial Rounded MT Bold", sans-serif', '1.5px ink outline, 3px soft offset shadow, 14px radius'],
  ['Transit map', 'white panels on a saturated line-color chrome, every category its own line color used as a thick bar and a filled pill', '"Helvetica Neue", "Avenir Next", sans-serif at 400/700, tabular numerals', 'radius 0 or full pill only, no shadow, 3px colored rules'],
  ['Console hardware', 'graphite chrome in three steps of value, one signal color for primary and status (amber, signal red or cobalt), item art in bright enamel colors', '"DIN Alternate", "Avenir Next Condensed", Bahnschrift, sans-serif, tabular numerals', '6px radius, 1px inner highlight, recessed wells for inputs'],
  ['Toy plastic', 'bright primary chrome (tomato, cobalt or grass) over a light ground, chunky item tiles in candy colors', 'one round geometric sans at 700/900: ui-rounded, "Avenir Next", "Trebuchet MS", sans-serif', '20px radius, thick 3px borders, press-down shadow on buttons'],
  ['Riso print', 'paper ground covered 40-60% by two or three overprinted spot inks (fluoro pink, teal, sun yellow) with SVG grain', 'Futura, "Century Gothic", "Avenir Next", sans-serif at 500/800', 'radius 0, misregistered offset fills, no shadow'],
  ['Deep water', 'drenched in one deep hue (teal, ink green or ultramarine, not a purple gradient), light content cards, item art in coral, kelp and sand', '"Avenir Next", "Gill Sans", sans-serif at 400/600/800', '16px radius, no border, layered soft shadows'],
  ['Sports broadcast', 'two saturated team colors on dark navy, slanted panel edges, score-bug chips for numbers', '"Avenir Next Condensed", "DIN Condensed", "Arial Narrow", sans-serif, heavy caps only on short labels', 'skewed 8deg panel ends, 4px radius, hard edge light'],
  ['Paper cutout', 'colored ground (mustard, tomato or teal) with layered flat cut shapes as imagery, white content sheets', '"Gill Sans", Optima, "Avenir Next", sans-serif at 400/700', 'irregular blob masks on art only, 10px radius, soft drop shadow'],
  ['Studio daylight', 'cool white ground with large color fields per section or item (one strong primary, item colors from a tuned 6-hue set), dark ink text', '"Avenir Next", Seravek, "Gill Sans", sans-serif at 400/600/800', '10px radius, 1px hairline borders, no shadow except on overlays'],
  ['Arcade cabinet', 'deep indigo-black ground with lit marquee panels, every item a bright cabinet-art tile, one hot primary', '"Avenir Next Condensed", Futura, sans-serif at 700/900', '4px radius, 2px bright edge on focus and selection, scanline texture only in art'],
  ['Greenhouse', 'saturated leaf-green chrome, cool off-white panels, item fills in tomato, squash, plum and sky', 'Optima, "Avenir Next", "Gill Sans", sans-serif at 400/700', '18px radius, 1px leaf-dark border, gentle shadow'],
];

const args = process.argv.slice(2);
const at = args.indexOf('--seed');
let seed = at >= 0 ? Number(args[at + 1]) : Math.floor(Math.random() * 2 ** 31);
if (!Number.isFinite(seed)) { console.log('usage: node deal.mjs [--seed <n>]'); process.exit(2); }
const next = () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31; };

const pool = [...DIRECTIONS];
const dealt = [];
while (dealt.length < 3) dealt.push(pool.splice(Math.floor(next() * pool.length), 1)[0]);
for (const [name, color, type, shape] of dealt) console.log(`DIRECTION ${name}\n  color: ${color}\n  type: ${type}\n  shape: ${shape}`);
