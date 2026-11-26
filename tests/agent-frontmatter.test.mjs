import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const AGENTS = fileURLToPath(new URL('../agents/', import.meta.url));

for (const file of fs.readdirSync(AGENTS)) {
  test(`${file} has a color`, () => {
    const text = fs.readFileSync(path.join(AGENTS, file), 'utf8');
    assert.match(text, /^color: (red|blue|green|yellow|purple|orange|pink|cyan)$/m);
  });
}
