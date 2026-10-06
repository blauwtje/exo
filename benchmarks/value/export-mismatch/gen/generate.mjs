// Writes seed/data/, hidden/check-data/expected.json and hidden/check-data/data-hashes.json
// for value-export-mismatch. Deterministic: run `node gen/generate.mjs` from the task folder.
// It does not import the seed's code; the expected totals come from the
// independent arithmetic below. Roles mark which fault can touch a customer:
// F1 books near local midnight in a non-EUR currency (FX looked up by UTC date),
// F2 has refunds and credit notes (dropped by an amount filter), F3 has ledger
// entries whose id equals a card event's id (dropped by an id-only dedupe).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TASK = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(TASK, 'seed', 'data');
const CHECK_DATA = path.join(TASK, 'hidden', 'check-data');

let state = 20260401;
function rand() {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (low, high) => low + Math.floor(rand() * (high - low + 1));
const pick = (list) => list[int(0, list.length - 1)];

// name, time zone, billing currency, role
const CUSTOMERS = [
  ['Nordlicht Foods, GmbH', 'Europe/Berlin', 'EUR', ''],
  ['Pallas Logistics', 'Europe/Athens', 'EUR', 'F2'],
  ['Brightwater Dental', 'Europe/London', 'GBP', ''],
  ['Kestrel Analytics', 'America/Los_Angeles', 'USD', 'F1'],
  ['Orchard & Vine', 'Europe/Dublin', 'EUR', 'F3'],
  ['Harbourline Marine', 'Australia/Sydney', 'AUD', 'F1'],
  ['Sable Studio', 'America/New_York', 'USD', 'F1'],
  ['Quill & Anchor Books', 'Europe/London', 'GBP', 'F2'],
  ['Tessellate Labs', 'America/Chicago', 'USD', 'F1'],
  ['Lumen Optics', 'Europe/Paris', 'EUR', 'F2'],
  ['Fernhill Veterinary', 'Australia/Melbourne', 'AUD', ''],
  ['Granite Peak Outfitters', 'America/Denver', 'USD', 'F1'],
  ['Moss & Co Bakery', 'Europe/Amsterdam', 'EUR', ''],
  ['Cobalt Freight', 'Asia/Singapore', 'USD', 'F1'],
  ['Daybreak Coffee Roasters', 'America/Toronto', 'CAD', 'F1'],
  ['Ironbridge Fabrication', 'Europe/London', 'GBP', 'F3'],
  ['Juniper Health', 'America/Vancouver', 'CAD', 'F1'],
  ['Tidewater Surf Co', 'Australia/Perth', 'AUD', 'F1'],
  ['Aurora Textiles', 'Europe/Madrid', 'EUR', 'F2'],
  ['Willow Creek Farms', 'America/Chicago', 'USD', ''],
  ['Pinecone Interactive', 'Asia/Tokyo', 'USD', 'F1'],
  ['Meridian Clinics', 'Europe/Rome', 'EUR', 'F3'],
  ['Saffron Kitchen Supply', 'Europe/Lisbon', 'EUR', ''],
  ['Blue Heron Press', 'America/New_York', 'USD', 'F2'],
  ['Copperleaf Energy', 'America/Los_Angeles', 'USD', ''],
  ['Stonebridge Legal', 'Europe/London', 'GBP', ''],
  ['Evergreen Pharmacy', 'Australia/Sydney', 'AUD', 'F2'],
  ['Halcyon Travel', 'Europe/Berlin', 'EUR', 'F3'],
  ['Ridgeway Builders', 'America/Denver', 'USD', ''],
  ['Marlowe Print Works', 'Europe/Dublin', 'EUR', ''],
  ['Kingfisher Outdoor', 'Australia/Brisbane', 'AUD', ''],
  ['Larkspur Design', 'Europe/Paris', 'EUR', ''],
  ['Redwood Analytics', 'America/Los_Angeles', 'USD', ''],
  ['Thistle & Thorn', 'Europe/London', 'GBP', ''],
  ['Vantage Surveying', 'America/Toronto', 'CAD', ''],
  ['Wren Electronics', 'Europe/Amsterdam', 'EUR', ''],
  ['Zephyr Air Freight', 'Europe/Madrid', 'EUR', ''],
  ['Alpenglow Guides', 'Europe/Vienna', 'EUR', ''],
  ['Bellwether Insurance', 'America/New_York', 'USD', ''],
  ['Citrine Software', 'Europe/Berlin', 'EUR', '']
].map(([name, timezone, currency, role], index) => ({
  id: `C${String(index + 1).padStart(3, '0')}`, name, timezone, currency, role, plan: index % 3 === 0 ? 'enterprise' : 'standard'
}));

const zone = new Map();
function localDate(iso, timeZone) {
  if (!zone.has(timeZone)) zone.set(timeZone, new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }));
  return zone.get(timeZone).format(new Date(iso));
}
const utcDate = (iso) => iso.slice(0, 10);
const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const half = (value) => (value === 0 ? 0 : Math.sign(value) * Math.round(Math.abs(value)));

// Daily EUR-per-unit rates from 2026-02-27 to 2026-05-02, a random walk of up to 0.6% a day.
const RATES = new Map();
for (const [currency, base] of [['USD', 0.92], ['GBP', 1.17], ['AUD', 0.6], ['CAD', 0.67]]) {
  let rate = base;
  for (let date = '2026-02-27'; date <= '2026-05-02'; date = addDays(date, 1)) {
    rate = Math.round(rate * (1 + (rand() - 0.5) * 0.012) * 10000) / 10000;
    RATES.set(`${currency}:${date}`, rate);
  }
}
function fxRows(first, last) {
  const rows = [];
  for (let date = first; date <= last; date = addDays(date, 1)) {
    for (const currency of ['USD', 'GBP', 'AUD', 'CAD']) rows.push(`${date},${currency},${RATES.get(`${currency}:${date}`).toFixed(4)}`);
  }
  return `date,currency,rate\n${rows.join('\n')}\n`;
}

function quote(value) {
  return /[",]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function sampleTime(customer, days, month, { diverge = false } = {}) {
  for (;;) {
    const iso = `${month}-${String(int(1, days)).padStart(2, '0')}T${String(int(0, 23)).padStart(2, '0')}:${String(int(0, 59)).padStart(2, '0')}:${String(int(0, 59)).padStart(2, '0')}Z`;
    const same = localDate(iso, customer.timezone) === utcDate(iso);
    if (diverge ? !same : (customer.role === 'F1' || customer.currency === 'EUR' || same)) return iso;
  }
}

function generateMonth(month) {
  const [year, number] = month.split('-').map(Number);
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const rows = [];
  for (const customer of CUSTOMERS) {
    const refundOnly = customer.name === 'Pallas Logistics' && month === '2026-04';
    const uses = customer.role === 'F1' || customer.role === 'F3' ? 'both' : pick(['both', 'both', 'card', 'ledger']);
    const make = (source, type, amountMinor, status, at) => rows.push({ source, customer, type, amountMinor, status, at });
    const status = (good, bad, rest) => (rand() < 0.9 ? good : rand() < 0.6 ? bad : rest);
    if (uses !== 'ledger' && !refundOnly) {
      const count = int(4, 10);
      for (let index = 0; index < count; index += 1) {
        const at = sampleTime(customer, days, month, { diverge: customer.role === 'F1' && index < 3 });
        make('cardsvc', 'charge', Math.round(2000 + rand() ** 2 * 150000), status('succeeded', 'failed', 'pending'), at);
      }
    }
    if (uses !== 'card' && !refundOnly) {
      const count = int(1, 4) + (customer.role === 'F3' ? 3 : 0);
      for (let index = 0; index < count; index += 1) {
        make('ledger', 'invoice', Math.round(30000 + rand() ** 2 * 800000), status('posted', 'void', 'draft'), sampleTime(customer, days, month));
      }
    }
    if (customer.role === 'F2') {
      for (let index = 0; index < (refundOnly ? 2 : 1); index += 1) {
        make('cardsvc', 'refund', -int(1500, 30000), 'succeeded', sampleTime(customer, days, month));
      }
      make('ledger', 'credit_note', -int(5000, 90000), 'posted', sampleTime(customer, days, month));
    }
  }
  rows.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  // One id sequence over both sources, in time order, with small gaps.
  let nextId = 10240 + int(0, 50);
  for (const row of rows) {
    row.id = String(nextId);
    nextId += int(1, 4);
  }
  // F3: some ledger entries of these customers carry the id of a card event.
  const donors = rows.filter((row) => row.source === 'cardsvc' && row.status === 'succeeded' && row.type === 'charge' && row.customer.role !== 'F3');
  for (const customer of CUSTOMERS.filter((candidate) => candidate.role === 'F3')) {
    const own = rows.filter((row) => row.customer === customer && row.source === 'ledger' && row.status === 'posted');
    for (const row of own.slice(0, 2)) row.id = pick(donors).id;
  }
  return rows;
}

// Redeliveries: some settled rows reappear later in the same file, unchanged.
function withRepeats(rows, source) {
  const own = rows.filter((row) => row.source === source);
  const kept = rows.filter((row) => !(row.source === source));
  const colliding = new Set(rows.filter((row) => row.customer.role === 'F3' && row.source === 'ledger').map((row) => row.id));
  const out = [];
  for (const row of own) {
    out.push(row);
    if (row.status === 'settled' || row.status === 'succeeded' || row.status === 'posted') {
      if (!colliding.has(row.id) && row.customer.role !== 'F3' && rand() < 0.04) out.push({ ...row, repeat: true });
    }
  }
  return { own: out, kept };
}

const cardLine = (row) => JSON.stringify({
  id: Number(row.id),
  account: row.customer.id,
  type: row.type,
  amount: Math.abs(row.amountMinor),
  currency: row.customer.currency,
  status: row.status,
  created: row.at
});
const ledgerLine = (row) => [row.id, row.customer.id, row.type, (row.amountMinor / 100).toFixed(2), row.customer.currency, row.status, row.at].join(',');

// Independent reference totals: settled rows once per source and id, rate of the
// local booking day in the customer's own zone.
function reference(files) {
  const seen = new Set();
  const totals = new Map();
  for (const row of files) {
    if (!['succeeded', 'posted'].includes(row.status)) continue;
    const key = `${row.source}/${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const rate = row.customer.currency === 'EUR' ? 1 : RATES.get(`${row.customer.currency}:${localDate(row.at, row.customer.timezone)}`);
    const entry = totals.get(row.customer.id) ?? { totalMinor: 0, transactions: 0 };
    entry.totalMinor += half(row.amountMinor * rate);
    entry.transactions += 1;
    totals.set(row.customer.id, entry);
  }
  return totals;
}

// Which fault touches which customer, by emulating the three wrong rules.
function effects(files) {
  const settled = files.filter((row) => ['succeeded', 'posted'].includes(row.status));
  const once = [];
  const seen = new Set();
  for (const row of settled) {
    const key = `${row.source}/${row.id}`;
    if (!seen.has(key)) { seen.add(key); once.push(row); }
  }
  const result = { F1: new Set(), F2: new Set(), F3: new Set() };
  for (const row of once) {
    const rate = (date) => (row.customer.currency === 'EUR' ? 1 : RATES.get(`${row.customer.currency}:${date}`));
    if (half(row.amountMinor * rate(utcDate(row.at))) !== half(row.amountMinor * rate(localDate(row.at, row.customer.timezone)))) result.F1.add(row.customer.id);
    if (row.amountMinor < 0) result.F2.add(row.customer.id);
  }
  const firstOfId = new Set();
  for (const row of once) {
    if (row.amountMinor <= 0) continue;
    if (firstOfId.has(row.id)) result.F3.add(row.customer.id);
    firstOfId.add(row.id);
  }
  return result;
}

fs.rmSync(DATA, { recursive: true, force: true });
fs.mkdirSync(path.join(DATA, 'fx'), { recursive: true });
fs.mkdirSync(path.join(DATA, 'sources', 'cardsvc'), { recursive: true });
fs.mkdirSync(path.join(DATA, 'sources', 'ledger'), { recursive: true });
fs.mkdirSync(CHECK_DATA, { recursive: true });

fs.writeFileSync(path.join(DATA, 'customers.csv'), `id,name,timezone,currency,plan\n${CUSTOMERS.map((c) => [c.id, quote(c.name), c.timezone, c.currency, c.plan].join(',')).join('\n')}\n`);
fs.writeFileSync(path.join(DATA, 'fx', '2026-03.csv'), fxRows('2026-02-28', '2026-04-01'));
fs.writeFileSync(path.join(DATA, 'fx', '2026-04.csv'), fxRows('2026-03-31', '2026-05-01'));

const expected = {};
for (const month of ['2026-03', '2026-04']) {
  const generated = generateMonth(month);
  // Rows are in time order already; repeats follow their original.
  const card = withRepeats(generated, 'cardsvc').own;
  const ledger = withRepeats(generated, 'ledger').own;
  fs.writeFileSync(path.join(DATA, 'sources', 'cardsvc', `${month}.jsonl`), `${card.map(cardLine).join('\n')}\n`);
  fs.writeFileSync(path.join(DATA, 'sources', 'ledger', `${month}.csv`), `entry_id,customer_ref,entry_type,amount,currency,state,booked_at\n${ledger.map(ledgerLine).join('\n')}\n`);
  const all = [...card, ...ledger];
  expected[month] = Object.fromEntries([...reference(all)].sort(([a], [b]) => a.localeCompare(b)));
  const found = effects(all);
  const roleOf = (set) => [...set].map((id) => CUSTOMERS.find((c) => c.id === id)).map((c) => `${c.name} (${c.role || 'none'})`);
  console.log(month, `rows ${all.length}`, `customers with rows ${Object.keys(expected[month]).length}`);
  for (const fault of ['F1', 'F2', 'F3']) {
    const wrongRole = [...found[fault]].filter((id) => CUSTOMERS.find((c) => c.id === id).role !== fault);
    console.log(` ${fault}: ${found[fault].size} customers, outside the role: ${wrongRole.length}`, wrongRole.length ? roleOf(new Set(wrongRole)) : '');
  }
}

fs.writeFileSync(path.join(CHECK_DATA, 'expected.json'), `${JSON.stringify(expected, null, 1)}\n`);
const hashes = {};
for (const file of fs.readdirSync(DATA, { recursive: true }).sort()) {
  const full = path.join(DATA, file);
  if (fs.statSync(full).isFile()) hashes[file.split(path.sep).join('/')] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
}
fs.writeFileSync(path.join(CHECK_DATA, 'data-hashes.json'), `${JSON.stringify(hashes, null, 1)}\n`);
