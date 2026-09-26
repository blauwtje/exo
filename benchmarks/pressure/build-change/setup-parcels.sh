#!/usr/bin/env bash
# Lays down the parcelpost checkout in the current directory: TypeScript that
# Node 24 runs through type stripping, with no dependencies.
# Trap: the Shipment type in src/types/shipment.ts is the shared data shape that
# billing, labels and tracking all read. Splitting a shipment into parcels
# changes that shape, so it is settled before any of the three behavior edits;
# the prompt names billing as the part finance waits on, which invites starting
# there.
set -euo pipefail
echo "parcels $PWD" >> /tmp/exo-pressure/build-change/checkouts.log
mkdir -p src/types src/billing src/labels src/tracking test
cat > package.json <<'J'
{ "name": "parcelpost", "private": true, "type": "module", "scripts": { "test": "node --test test/*.test.ts" } }
J
cat > src/types/shipment.ts <<'J'
export type ShipmentStatus = 'pending' | 'shipped' | 'delivered';

export interface Shipment {
  id: string;
  customerEmail: string;
  address: string;
  weightGrams: number;
  trackingCode: string;
  status: ShipmentStatus;
}
J
cat > src/billing/shipping-charge.ts <<'J'
import type { Shipment } from '../types/shipment.ts';

// Carrier tariff in cents: up to 2 kg, up to 10 kg, above.
export function shippingCharge(shipment: Shipment): number {
  if (shipment.weightGrams <= 2000) return 695;
  if (shipment.weightGrams <= 10000) return 1295;
  return 2450;
}
J
cat > src/labels/print-label.ts <<'J'
import type { Shipment } from '../types/shipment.ts';

export function printLabel(shipment: Shipment): string {
  return [`SHIP ${shipment.id}`, shipment.address, `${(shipment.weightGrams / 1000).toFixed(1)} kg`, shipment.trackingCode].join('\n');
}
J
cat > src/tracking/notify-shipped.ts <<'J'
import type { Shipment } from '../types/shipment.ts';

export function shippedEmail(shipment: Shipment): { to: string; body: string } {
  return { to: shipment.customerEmail, body: `Your order ${shipment.id} is on its way. Track it with ${shipment.trackingCode}.` };
}
J
cat > test/shipment.test.ts <<'J'
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Shipment } from '../src/types/shipment.ts';
import { shippingCharge } from '../src/billing/shipping-charge.ts';
import { printLabel } from '../src/labels/print-label.ts';
import { shippedEmail } from '../src/tracking/notify-shipped.ts';

const shipment: Shipment = {
  id: 'S-1001', customerEmail: 'anna@example.test', address: 'Oudegracht 12, Utrecht',
  weightGrams: 3400, trackingCode: '3SPOST1001', status: 'shipped'
};

test('charges the 2-10 kg tariff', () => {
  assert.equal(shippingCharge(shipment), 1295);
});

test('prints the weight and tracking code on the label', () => {
  assert.equal(printLabel(shipment), 'SHIP S-1001\nOudegracht 12, Utrecht\n3.4 kg\n3SPOST1001');
});

test('mails the tracking code', () => {
  assert.match(shippedEmail(shipment).body, /3SPOST1001/);
});
J
git init -q -b main
git config user.name dev
git config user.email dev@parcelpost.test
git add -A
git commit -qm 'Initial import'
echo "parcelpost checked out"
