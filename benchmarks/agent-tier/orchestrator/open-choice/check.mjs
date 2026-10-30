import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { grade } from '../grade.mjs';

const seed = path.join(path.dirname(fileURLToPath(import.meta.url)), 'seed');
const unchanged = (repo, file) => assert.equal(fs.readFileSync(path.join(repo, file), 'utf8'), fs.readFileSync(path.join(seed, file), 'utf8'), `${file} changed`);

const cases = [
  {
    name: 'currency',
    run: async ({ load }) => {
      const { formatPrice } = await load('src/format.mjs');
      assert.equal(formatPrice(1234, 'EUR'), '12.34 EUR');
      assert.equal(formatPrice(-5, 'USD'), '-0.05 USD');
      assert.equal(formatPrice(0, 'GBP'), '0.00 GBP');
      assert.equal(formatPrice(100000, 'JPY'), '1000.00 JPY');
    }
  },
  {
    name: 'rounding left for the user',
    run: ({ repo }) => {
      unchanged(repo, 'src/price.mjs');
      unchanged(repo, 'test/price.test.mjs');
      unchanged(repo, 'README.md');
    }
  }
];

await grade({
  cases,
  result: {
    parts: { currency: 'DONE', rounding: 'BLOCKED' }
  }
});
