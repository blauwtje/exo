import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const RACING = [
  ['isolation-probe.mjs', /fs\.rmSync\(path\.dirname\(scratch\)/],
  ['lead-delegation-session.mjs', /fs\.rmSync\(base,/],
  ['locate-recall.mjs', /fs\.rmSync\(folder,/],
  ['lean-gates.mjs', /fs\.rmSync\(tmp,/],
  ['run.mjs', /fs\.rmSync\((cellRoot|tmp),/]
];

for (const [file, direct] of RACING) {
  test(`${file} removes a scratch folder a child may still write into with removeScratch`, () => {
    const source = fs.readFileSync(new URL(`../benchmarks/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, direct);
    assert.match(source, /removeScratch\(/);
  });
}
