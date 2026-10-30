import assert from 'node:assert/strict';
import { grade } from '../grade.mjs';

const cases = [
  {
    name: 'ttl-unit',
    run: async ({ load }) => {
      const { ttl, isExpired } = await load('src/auth.mjs');
      assert.equal(ttl, 3600);
      assert.equal(isExpired({ issuedAt: 0 }, 3_600_000), false);
      assert.equal(isExpired({ issuedAt: 0 }, 3_600_001), true);
    }
  },
  {
    name: 'expiry',
    run: async ({ load }) => {
      const { expiresAt } = await load('src/expiry.mjs');
      assert.equal(expiresAt({ issuedAt: 0 }), 3_600_000);
      assert.equal(expiresAt({ issuedAt: 1000 }), 3_601_000);
    }
  }
];

await grade({
  cases,
  result: {
    parts: { 'ttl-unit': 'DONE', expiry: 'DONE' },
    after: [['expiry', 'ttl-unit']]
  }
});
