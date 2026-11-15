import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { desktopNotice } from '../skills/build/scripts/run-command.mjs';
import { tempDir } from './harness.mjs';

let savedPath;
let bin;

before(() => {
  savedPath = process.env.PATH;
  bin = tempDir('exo-notify-bin-');
  fs.writeFileSync(path.join(bin, 'osascript'), `#!/bin/sh\nprintf '%s' "$2" > "${bin}/args"\n`, { mode: 0o755 });
  process.env.PATH = bin;
});

after(() => {
  process.env.PATH = savedPath;
});

test('a run end shows one desktop notice with the cleaned run id and the phase', () => {
  desktopNotice('r1;"x', 'landed');
  assert.equal(fs.readFileSync(path.join(bin, 'args'), 'utf8'), 'display notification "exo run r1x: landed" with title "exo"');
});
