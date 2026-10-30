import assert from 'node:assert/strict';
import { grade } from '../grade.mjs';

const cases = [
  {
    name: 'tag-case',
    run: async ({ load }) => {
      const { normalizeTags } = await load('src/tags.mjs');
      assert.deepEqual(normalizeTags(['A', 'a ', ' B']), ['a', 'b']);
      assert.deepEqual(normalizeTags([]), []);
    }
  },
  {
    name: 'tag-index',
    run: async ({ load }) => {
      const { indexTags } = await load('src/index.mjs');
      const items = [{ id: 1, tags: ['A', 'a '] }, { id: 2, tags: ['a', 'B'] }];
      assert.deepEqual(indexTags(items), { a: [1, 2], b: [2] });
      assert.deepEqual(indexTags([]), {});
    }
  }
];

await grade({
  cases,
  result: {
    parts: { 'tag-case': 'DONE', 'tag-index': 'DONE' },
    after: [['tag-index', 'tag-case']]
  }
});
