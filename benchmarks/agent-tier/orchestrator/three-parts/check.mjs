import assert from 'node:assert/strict';
import { grade } from '../grade.mjs';

const cases = [
  {
    name: 'slugify',
    run: async ({ load }) => {
      const { slugify } = await load('src/text.mjs');
      assert.equal(slugify('Hello World'), 'hello-world');
      assert.equal(slugify('--A  b__C--'), 'a-b-c');
      assert.equal(slugify('!!!'), '');
    }
  },
  {
    name: 'clamp',
    run: async ({ load }) => {
      const { clamp } = await load('src/num.mjs');
      assert.equal(clamp(5, 0, 10), 5);
      assert.equal(clamp(-1, 0, 10), 0);
      assert.equal(clamp(11, 0, 10), 10);
      assert.equal(clamp(3, 3, 3), 3);
      assert.throws(() => clamp(1, 5, 2), RangeError);
    }
  },
  {
    name: 'report-format',
    run: async ({ load }) => {
      const { report } = await load('src/report.mjs');
      assert.equal(report([{ name: 'Top Team!', score: 120 }, { name: 'b c', score: -5 }, { name: 'd', score: 42 }]), 'top-team: 100\nb-c: 0\nd: 42');
    }
  },
  {
    name: 'titleCase and sum unchanged',
    run: async ({ load }) => {
      assert.equal((await load('src/text.mjs')).titleCase('a b'), 'A B');
      assert.equal((await load('src/num.mjs')).sum([2, 3]), 5);
    }
  }
];

await grade({
  cases,
  result: {
    parts: { slugify: 'DONE', clamp: 'DONE', 'report-format': 'DONE' },
    together: [['slugify', 'clamp']],
    after: [['report-format', 'slugify'], ['report-format', 'clamp']]
  }
});
