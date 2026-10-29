import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from './src/config.mjs';

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'config-'));
const present = path.join(folder, 'present.json');
fs.writeFileSync(present, '{"port": 8080}');
assert.deepEqual(loadConfig(present), { port: 8080 });
assert.throws(() => loadConfig(path.join(folder, 'missing.json')));
