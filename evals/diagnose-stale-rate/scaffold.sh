#!/usr/bin/env bash
set -euo pipefail

git init -q
mkdir -p bin src/rates src/pricing data test
printf 'node_modules\n' > .gitignore

commit() {
  git add -A
  git -c user.name="Jane Doe" -c user.email=jane@example.com commit -q -m "$1"
}

cat > package.json <<'JSON'
{
  "name": "parcelquote",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "quote": "node bin/quote.js",
    "test": "node --test"
  }
}
JSON

cat > data/rates.json <<'JSON'
{
  "postnl": { "1": 450, "2": 690, "3": 890 },
  "dhl": { "1": 520, "2": 750, "3": 990 }
}
JSON

cat > data/zones.json <<'JSON'
{ "1": 1, "3": 2, "9": 3 }
JSON

cat > data/batch.json <<'JSON'
[
  { "id": "P-1041", "carrier": "postnl", "to": "1011AB", "weightKg": "0.8" },
  { "id": "P-1042", "carrier": "postnl", "to": "9711CD", "weightKg": "2.0" },
  { "id": "P-1043", "carrier": "dhl", "to": "3511EF", "weightKg": "4.0" }
]
JSON

cat > src/batch.js <<'JS'
import { readFile } from 'node:fs/promises';

const file = new URL('../data/batch.json', import.meta.url);

export async function loadBatch() {
  const parcels = JSON.parse(await readFile(file, 'utf8'));
  return parcels.map((parcel) => ({ ...parcel, weightKg: Number(parcel.weightKg) }));
}
JS

cat > src/zones.js <<'JS'
import { readFileSync } from 'node:fs';

const zones = JSON.parse(readFileSync(new URL('../data/zones.json', import.meta.url), 'utf8'));

export function zoneFor(postcode) {
  const zone = zones[postcode[0]];
  if (!zone) throw new Error(`no zone for ${postcode}`);
  return zone;
}
JS

cat > src/lane.js <<'JS'
export function createLane(carrier, zone) {
  return { carrier, zone };
}
JS

cat > src/format.js <<'JS'
export function formatEuro(cents) {
  return `€${(cents / 100).toFixed(2)}`;
}
JS

cat > src/rates/provider.js <<'JS'
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const file = new URL('../../data/rates.json', import.meta.url);

export async function fetchRate(lane) {
  await sleep(2);
  const table = JSON.parse(await readFile(file, 'utf8'));
  const cents = table[lane.carrier]?.[lane.zone];
  if (cents === undefined) throw new Error(`no rate for ${lane.carrier} zone ${lane.zone}`);
  return cents;
}
JS

cat > src/rates/index.js <<'JS'
import { fetchRate } from './provider.js';

export function createRates() {
  return { baseRate: (lane) => fetchRate(lane) };
}
JS

cat > src/pricing/bracket.js <<'JS'
const brackets = [
  { upToKg: 1, cents: 0 },
  { upToKg: 2, cents: 120 },
  { upToKg: 5, cents: 300 },
  { upToKg: Infinity, cents: 700 },
];

export function bracketSurcharge(weightKg) {
  return brackets.find((bracket) => weightKg < bracket.upToKg).cents;
}
JS

cat > src/pricing/fuel.js <<'JS'
export function fuelSurcharge(cents, percent) {
  return Math.round((cents * percent) / 100);
}
JS

cat > src/pricing/quote.js <<'JS'
import { createLane } from '../lane.js';
import { zoneFor } from '../zones.js';
import { bracketSurcharge } from './bracket.js';
import { fuelSurcharge } from './fuel.js';

export async function quoteParcel(parcel, rates, fuelPercent) {
  const lane = createLane(parcel.carrier, zoneFor(parcel.to));
  const base = await rates.baseRate(lane);
  const net = base + bracketSurcharge(parcel.weightKg);
  return { id: parcel.id, lane, weightKg: parcel.weightKg, cents: net + fuelSurcharge(net, fuelPercent) };
}
JS

cat > bin/quote.js <<'JS'
import { loadBatch } from '../src/batch.js';
import { formatEuro } from '../src/format.js';
import { quoteParcel } from '../src/pricing/quote.js';
import { createRates } from '../src/rates/index.js';

const fuelPercent = 8;
const rates = createRates();
let total = 0;

for (const parcel of await loadBatch()) {
  const quote = await quoteParcel(parcel, rates, fuelPercent);
  total += quote.cents;
  console.log(`${quote.id}  ${quote.lane.carrier}  zone ${quote.lane.zone}  ${quote.weightKg.toFixed(1)} kg  ${formatEuro(quote.cents)}`);
}

console.log(`Total  ${formatEuro(total)}`);
JS

cat > test/bracket.test.js <<'JS'
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bracketSurcharge } from '../src/pricing/bracket.js';

test('picks the surcharge for the weight bracket', () => {
  assert.equal(bracketSurcharge(0.8), 0);
  assert.equal(bracketSurcharge(1.5), 120);
  assert.equal(bracketSurcharge(4), 300);
  assert.equal(bracketSurcharge(7), 700);
});
JS

cat > test/quote.test.js <<'JS'
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { quoteParcel } from '../src/pricing/quote.js';
import { createRates } from '../src/rates/index.js';

test('quotes a light parcel with the base rate and no fuel surcharge', async () => {
  const parcel = { id: 'T-1', carrier: 'postnl', to: '1011AB', weightKg: 0.8 };
  const quote = await quoteParcel(parcel, createRates(), 0);
  assert.equal(quote.cents, 450);
});
JS
commit "feat: add the parcel quote batch"

cat > test/fuel.test.js <<'JS'
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fuelSurcharge } from '../src/pricing/fuel.js';

test('rounds the fuel surcharge to whole cents', () => {
  assert.equal(fuelSurcharge(1010, 8), 81);
  assert.equal(fuelSurcharge(450, 8), 36);
});
JS
commit "test(pricing): cover the fuel surcharge rounding"

cat > src/lane.js <<'JS'
export function createLane(carrier, zone) {
  return {
    carrier,
    zone,
    toString() {
      return this.carrier;
    },
  };
}
JS
cat > src/rates/provider.js <<'JS'
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const file = new URL('../../data/rates.json', import.meta.url);

export async function fetchRate(lane) {
  await sleep(2);
  const table = JSON.parse(await readFile(file, 'utf8'));
  const cents = table[lane.carrier]?.[lane.zone];
  if (cents === undefined) throw new Error(`no rate for ${lane} zone ${lane.zone}`);
  return cents;
}
JS
commit "refactor(lane): print a lane by its carrier in error messages"

cat > src/rates/cache.js <<'JS'
export function memoize(fn, keyOf = (...args) => String(args[0])) {
  const entries = new Map();
  return (...args) => {
    const key = keyOf(...args);
    if (!entries.has(key)) entries.set(key, fn(...args));
    return entries.get(key);
  };
}
JS
cat > src/rates/index.js <<'JS'
import { memoize } from './cache.js';
import { fetchRate } from './provider.js';

export function createRates() {
  return { baseRate: memoize((lane) => fetchRate(lane)) };
}
JS
commit "perf(rates): reuse a rate lookup that is already in flight"

cat > src/pricing/bracket.js <<'JS'
const brackets = [
  { upToKg: 1, cents: 0 },
  { upToKg: 2, cents: 120 },
  { upToKg: 5, cents: 300 },
  { upToKg: Infinity, cents: 700 },
];

export function bracketSurcharge(weightKg) {
  return brackets.find((bracket) => weightKg <= bracket.upToKg).cents;
}
JS
commit "fix(pricing): keep a parcel of exactly 2 kg in the second bracket"
