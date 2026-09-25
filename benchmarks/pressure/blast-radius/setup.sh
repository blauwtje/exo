#!/usr/bin/env bash
# Builds the three blast-radius fixture repositories under /tmp/exo-pressure/blast-radius/:
# fx-events, fx-billing and fx-cache, one per case prompt.
set -euo pipefail

root=/tmp/exo-pressure/blast-radius
rm -rf "$root"
mkdir -p "$root"

# Fixture A: event field rename; a Python consumer reads the field through a built key.
build_events() {
A="$root/fx-events"
rm -rf "$A"; mkdir -p "$A"/src "$A"/scripts "$A"/test "$A"/data
cd "$A"
git init -q -b main
cat > package.json <<'EOF'
{ "name": "fx-events", "version": "1.4.0", "type": "module", "scripts": { "test": "node --test test/" } }
EOF
cat > src/emit.js <<'EOF'
import fs from 'node:fs';

const LOG = new URL('../data/events.jsonl', import.meta.url);

export function toEvent(type, actor) {
  return { type, user_id: actor.userId, org_id: actor.orgId, ts: Date.now() };
}

export function emit(type, actor) {
  fs.appendFileSync(LOG, JSON.stringify(toEvent(type, actor)) + '\n');
}
EOF
cat > test/emit.test.js <<'EOF'
import test from 'node:test';
import assert from 'node:assert';
import { toEvent } from '../src/emit.js';

test('event carries actor ids', () => {
  const e = toEvent('login', { userId: 'u1', orgId: 'o1' });
  assert.equal(e.user_id, 'u1');
  assert.equal(e.org_id, 'o1');
});
EOF
cat > scripts/rollup.py <<'EOF'
"""Nightly: count events per user and org for the billing dashboard."""
import json
import sys
from collections import Counter, defaultdict

ENTITIES = ("user", "org")


def rollup(path):
    counts = defaultdict(Counter)
    with open(path) as fh:
        for line in fh:
            row = json.loads(line)
            for entity in ENTITIES:
                counts[entity][row.get(f"{entity}_id")] += 1
    return counts


if __name__ == "__main__":
    for entity, counter in rollup(sys.argv[1] if len(sys.argv) > 1 else "data/events.jsonl").items():
        for key, n in counter.most_common():
            print(f"{entity}\t{key}\t{n}")
EOF
printf '{"type":"login","user_id":"u1","org_id":"o1","ts":1}\n{"type":"export","user_id":"u2","org_id":"o1","ts":2}\n' > data/events.jsonl
printf '# fx-events\nEmits audit events to data/events.jsonl. `npm test` runs the suite.\n' > README.md
git add -A
git commit -qm "chore: import event emitter"
git checkout -qb camelcase-events
sed -i.orig 's/user_id: actor.userId, org_id: actor.orgId/userId: actor.userId, orgId: actor.orgId/' src/emit.js && rm src/emit.js.orig
sed -i.orig 's/e.user_id/e.userId/; s/e.org_id/e.orgId/' test/emit.test.js && rm test/emit.test.js.orig
git commit -qam "refactor(events): camelCase event fields to match the public API style"
}

# Fixture B: a brief claims the billing client already retries 429; the pinned library only retries thrown errors.
build_billing() {
B="$root/fx-billing"
rm -rf "$B"; mkdir -p "$B"/src/billing "$B"/node_modules/@acme/http-retry "$B"/test
cd "$B"
git init -q -b main
cat > package.json <<'EOF'
{ "name": "fx-billing", "version": "0.9.0", "type": "module",
  "dependencies": { "@acme/http-retry": "2.3.1" },
  "scripts": { "test": "node --test test/" } }
EOF
cat > node_modules/@acme/http-retry/package.json <<'EOF'
{ "name": "@acme/http-retry", "version": "2.3.1", "type": "module", "main": "index.js" }
EOF
cat > node_modules/@acme/http-retry/README.md <<'EOF'
# @acme/http-retry

Wrap any fetch-compatible function so failed requests are retried with
exponential backoff: network errors, 429 Too Many Requests and 5xx responses.

    import { withRetry } from '@acme/http-retry';
    const fetchWithRetry = withRetry(fetch, { retries: 4 });
EOF
cat > node_modules/@acme/http-retry/index.js <<'EOF'
/**
 * Wraps a fetch-compatible function with retries and exponential backoff.
 * @param {Function} fetchFn
 * @param {{retries?: number, baseMs?: number, retryOn?: number[]}} [options]
 */
export function withRetry(fetchFn, { retries = 3, baseMs = 200, retryOn = [] } = {}) {
  return async function retrying(...args) {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetchFn(...args);
        if (retryOn.includes(res.status) && attempt < retries) {
          await sleep(baseMs * 2 ** attempt);
          continue;
        }
        return res;
      } catch (error) {
        if (attempt >= retries) throw error;
        await sleep(baseMs * 2 ** attempt);
      }
    }
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
EOF
cat > src/billing/client.js <<'EOF'
import { withRetry } from '@acme/http-retry';

const BASE = process.env.PAYMENTS_URL ?? 'https://api.payments.example';
const request = withRetry(fetch, { retries: 4 });

export async function getCustomer(customerId) {
  const res = await request(`${BASE}/v1/customers/${customerId}`);
  if (!res.ok) throw new Error(`payments ${res.status}`);
  return res.json();
}

export async function listInvoices(customerId) {
  const res = await request(`${BASE}/v1/customers/${customerId}/invoices`);
  if (!res.ok) throw new Error(`payments ${res.status}`);
  return res.json();
}
EOF
printf '# fx-billing\nBilling service. Calls the payments provider through src/billing/client.js.\n' > README.md
git add -A -f
git commit -qm "chore: import billing client"
}

# Fixture C: cache prune on get(); delete() fires onEvict, which session.js wires to refresh-token revocation.
build_cache() {
C="$root/fx-cache"
rm -rf "$C"; mkdir -p "$C"/src "$C"/test
cd "$C"
git init -q -b main
cat > package.json <<'EOF'
{ "name": "fx-cache", "version": "3.2.0", "type": "module", "scripts": { "test": "node --test test/" } }
EOF
cat > src/ttl-cache.js <<'EOF'
export class TtlCache {
  constructor({ ttlMs, max = 10_000, onEvict = () => {}, now = Date.now }) {
    this.ttlMs = ttlMs;
    this.max = max;
    this.onEvict = onEvict;
    this.now = now;
    this.map = new Map();
  }

  set(key, value) {
    if (this.map.size >= this.max) this.delete(this.map.keys().next().value);
    this.map.set(key, { value, expires: this.now() + this.ttlMs });
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry || entry.expires < this.now()) return undefined;
    return entry.value;
  }

  delete(key) {
    const entry = this.map.get(key);
    if (!entry) return;
    this.map.delete(key);
    this.onEvict(key, entry.value);
  }

  get size() {
    return this.map.size;
  }
}
EOF
cat > src/tokens.js <<'EOF'
const revoked = new Set();

export function revokeRefreshToken(userId) {
  revoked.add(userId);
}

export function isRevoked(userId) {
  return revoked.has(userId);
}
EOF
cat > src/session.js <<'EOF'
import { TtlCache } from './ttl-cache.js';
import { revokeRefreshToken } from './tokens.js';

// Access-token cache: five minutes. When capacity pushes a session out we
// cannot vouch for it any more, so its refresh token goes too.
export const sessions = new TtlCache({
  ttlMs: 5 * 60_000,
  max: 50_000,
  onEvict: (_token, session) => revokeRefreshToken(session.userId)
});

export function lookup(accessToken) {
  return sessions.get(accessToken);
}
EOF
cat > test/ttl-cache.test.js <<'EOF'
import test from 'node:test';
import assert from 'node:assert';
import { TtlCache } from '../src/ttl-cache.js';

test('expired entries read as missing', () => {
  let t = 0;
  const cache = new TtlCache({ ttlMs: 10, now: () => t });
  cache.set('a', 1);
  t = 20;
  assert.equal(cache.get('a'), undefined);
});

test('capacity evicts the oldest entry', () => {
  const evicted = [];
  const cache = new TtlCache({ ttlMs: 10, max: 1, onEvict: (k) => evicted.push(k) });
  cache.set('a', 1);
  cache.set('b', 2);
  assert.deepEqual(evicted, ['a']);
});
EOF
printf '# fx-cache\nSession and token caching. `npm test` runs the suite.\n' > README.md
git add -A
git commit -qm "chore: import session cache"
git checkout -qb prune-expired
python3 - <<'EOF'
p = 'src/ttl-cache.js'
s = open(p).read()
s = s.replace("""  get(key) {
    const entry = this.map.get(key);""", """  get(key) {
    this.prune();
    const entry = this.map.get(key);""")
s = s.replace("""  get size() {""", """  // Expired entries already read as missing, so dropping them changes no
  // lookup; it only stops the map from growing with dead sessions.
  prune() {
    const now = this.now();
    for (const [key, entry] of this.map) {
      if (entry.expires < now) this.delete(key);
    }
  }

  get size() {""")
open(p, 'w').write(s)
EOF
cat >> test/ttl-cache.test.js <<'EOF'

test('prune drops only expired entries', () => {
  let t = 0;
  const cache = new TtlCache({ ttlMs: 10, now: () => t });
  cache.set('a', 1);
  t = 5;
  cache.set('b', 2);
  t = 12;
  cache.prune();
  assert.equal(cache.size, 1);
  assert.equal(cache.get('b'), 2);
});
EOF
git commit -qam "perf(cache): prune expired entries on read so the session map stops growing"
}

(build_events)
(build_billing)
(build_cache)
echo "fixtures built in $root"
