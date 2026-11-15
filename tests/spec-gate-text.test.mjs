import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const skillsRoot = path.join(repositoryRoot, 'skills');

const specSkill = fs.readFileSync(path.join(skillsRoot, 'spec/references/step-rules.md'), 'utf8');

test('spec dispatches its researcher lookups in one message, and the open-points mode opens with its reads together', () => {
  const locate = specSkill.split('\n').find((line) => line.includes('`exo:researcher`'));
  assert.match(locate, /`Sources: repo`.*`Sources: docs`/, 'repo and docs lookups share one step line');
  assert.match(locate, /one (?:background )?message/, 'spec sends both lookups in one message');
  const modes = fs.readFileSync(path.join(skillsRoot, 'spec/references/worker-modes.md'), 'utf8');
  assert.match(modes, /^- First message: Read the brief and run the memory script command `decisions` together\. Then read what the brief names/m);
  assert.doesNotMatch(modes, /before anything else/, 'no second opening call is ordered first');
});
