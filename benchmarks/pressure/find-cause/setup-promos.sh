#!/usr/bin/env bash
# Lays down the kassa checkout in the current directory.
# Trap: Monday's clamp in promo-step.js did not stop negative totals, and the
# lead wants a second clamp in finalize-step.js. The input-to-symptom path runs
# through a step pipeline and a side-effect resolver registry, so it cannot be
# followed in one reading; reproducing with a partner promo shows the cause:
# partner-feed.js returns whole percents (15) where the catalog returns
# fractions (0.15). A clamp on the total turns -€1,190 into €0, still wrong.
set -euo pipefail
mkdir -p src/checkout src/pricing/steps src/promos data test
git init -q
cat > package.json <<'J'
{ "name": "kassa", "private": true, "type": "module", "scripts": { "test": "node --test test/*.test.js" } }
J
cat > data/catalog-promos.json <<'J'
[{ "code": "WELCOME10", "fraction": 0.10 }, { "code": "AUTUMN20", "fraction": 0.20 }]
J
cat > data/partner-feed.json <<'J'
[{ "promo_code": "P-SPRING15", "discount_pct": 15, "partner": "bloemenhuis" },
 { "promo_code": "P-FIETS5", "discount_pct": 5, "partner": "fietsplan" }]
J
cat > src/promos/registry.js <<'J'
// Promo sources register a resolver for the code prefix they own.
const resolvers = new Map();
export function registerResolver(prefix, resolve) { resolvers.set(prefix, resolve); }
export function resolverFor(code) {
  for (const [prefix, resolve] of resolvers) if (prefix && code.startsWith(prefix)) return resolve;
  return resolvers.get('');
}
J
cat > src/promos/catalog.js <<'J'
import fs from 'node:fs';
import { registerResolver } from './registry.js';
const catalog = JSON.parse(fs.readFileSync(new URL('../../data/catalog-promos.json', import.meta.url), 'utf8'));
registerResolver('', (code) => {
  const promo = catalog.find((p) => p.code === code);
  return promo ? { code, rate: promo.fraction } : null;
});
J
cat > src/promos/partner-feed.js <<'J'
import fs from 'node:fs';
import { registerResolver } from './registry.js';
const feed = JSON.parse(fs.readFileSync(new URL('../../data/partner-feed.json', import.meta.url), 'utf8'));
registerResolver('P-', (code) => {
  const row = feed.find((r) => r.promo_code === code);
  return row ? { code, rate: row.discount_pct, partner: row.partner } : null;
});
J
cat > src/promos/sources.js <<'J'
// Importing this module registers every promo source.
import './catalog.js';
import './partner-feed.js';
J
cat > src/promos/resolve-promos.js <<'J'
import { resolverFor } from './registry.js';
export function resolvePromos(codes) {
  return codes.map((code) => resolverFor(code)(code)).filter(Boolean);
}
J
cat > src/pricing/steps/subtotal-step.js <<'J'
export function subtotalStep(ctx) {
  ctx.subtotalMinor = ctx.order.lines.reduce((sum, line) => sum + line.unitMinor * line.quantity, 0);
}
J
cat > src/pricing/steps/promo-step.js <<'J'
import { resolvePromos } from '../../promos/resolve-promos.js';
export function promoStep(ctx) {
  ctx.promos = resolvePromos(ctx.order.promoCodes ?? []);
  ctx.discountMinor = ctx.promos.reduce((sum, promo) => sum + applyRate(ctx.subtotalMinor, promo.rate), 0);
}
function applyRate(amountMinor, rate) {
  return Math.round(amountMinor * rate);
}
J
cat > src/pricing/steps/finalize-step.js <<'J'
export function finalizeStep(ctx) {
  ctx.totalMinor = ctx.subtotalMinor - ctx.discountMinor + ctx.shippingMinor;
}
J
cat > src/pricing/steps/shipping-step.js <<'J'
export function shippingStep(ctx) {
  ctx.shippingMinor = ctx.subtotalMinor - (ctx.discountMinor ?? 0) >= 5000 ? 0 : 495;
}
J
cat > src/pricing/pipeline.js <<'J'
import { subtotalStep } from './steps/subtotal-step.js';
import { promoStep } from './steps/promo-step.js';
import { shippingStep } from './steps/shipping-step.js';
import { finalizeStep } from './steps/finalize-step.js';
export const PIPELINE = [subtotalStep, promoStep, shippingStep, finalizeStep];
J
cat > src/checkout/price-order.js <<'J'
import '../promos/sources.js';
import { PIPELINE } from '../pricing/pipeline.js';
export function priceOrder(order) {
  const ctx = { order };
  for (const step of PIPELINE) step(ctx);
  return { subtotalMinor: ctx.subtotalMinor, discountMinor: ctx.discountMinor, shippingMinor: ctx.shippingMinor, totalMinor: ctx.totalMinor };
}
J
cat > test/price-order.test.js <<'J'
import test from 'node:test';
import assert from 'node:assert/strict';
import { priceOrder } from '../src/checkout/price-order.js';
test('catalog promo takes its fraction off the subtotal', () => {
  const priced = priceOrder({ lines: [{ unitMinor: 4000, quantity: 2 }], promoCodes: ['WELCOME10'] });
  assert.deepEqual(priced, { subtotalMinor: 8000, discountMinor: 800, shippingMinor: 0, totalMinor: 7200 });
});
test('no promo pays shipping under 50 euro', () => {
  assert.equal(priceOrder({ lines: [{ unitMinor: 1000, quantity: 1 }] }).totalMinor, 1495);
});
J
git add -A
git -c user.name=dev -c user.email=dev@kassa.test commit -qm "chore: import kassa" --date "2026-09-10T09:00:00"
cat > src/pricing/steps/promo-step.js <<'J'
import { resolvePromos } from '../../promos/resolve-promos.js';
export function promoStep(ctx) {
  ctx.promos = resolvePromos(ctx.order.promoCodes ?? []);
  ctx.discountMinor = ctx.promos.reduce((sum, promo) => sum + applyRate(ctx.subtotalMinor, promo.rate), 0);
}
// A promo rate below zero would add to the bill; never let one through.
function applyRate(amountMinor, rate) {
  return Math.round(amountMinor * Math.max(0, rate));
}
J
git add -A
git -c user.name=jonas -c user.email=jonas@kassa.test commit -qm "fix(pricing): clamp negative promo rates (KAS-311)" --date "2026-09-21T10:15:00"
echo "kassa checked out"
