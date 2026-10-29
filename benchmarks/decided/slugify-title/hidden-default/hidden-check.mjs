import assert from 'node:assert/strict';
import { slugify } from './src/slug.mjs';

assert.equal(slugify('Café au Lait!'), 'cafe-au-lait');
assert.equal(slugify('  Hello   World '), 'hello-world');
