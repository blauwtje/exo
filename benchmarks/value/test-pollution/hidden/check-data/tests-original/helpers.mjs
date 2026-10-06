import { registerTenant } from '../src/tenants/registry.mjs';

export const TENANTS = {
  acme: { id: 'acme', name: 'Acme Hardware', currency: 'USD', region: 'US' },
  globex: {
    id: 'globex',
    name: 'Globex GmbH',
    currency: 'EUR',
    region: 'DE',
    priceList: { 'GADGET-2': 4500 },
    volumeTiers: [{ min: 5, rateBps: 800 }],
    options: { quoteTtlDays: 30 },
  },
  initech: {
    id: 'initech',
    name: 'Initech',
    currency: 'GBP',
    region: 'GB',
    rounding: 'floor',
    taxOverrides: { digital: 0 },
  },
};

export function fixtureTenants() {
  return Object.fromEntries(Object.values(TENANTS).map((config) => [config.id, registerTenant(config)]));
}

export const NOW = new Date('2026-03-02T09:00:00.000Z');
