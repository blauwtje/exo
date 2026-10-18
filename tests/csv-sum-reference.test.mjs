import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { sumAmount } from '../benchmarks/safe/csv-sum/solution/sales.js';

function sumOf(content) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-csv-sum-'));
  const file = path.join(directory, 'sales.csv');
  fs.writeFileSync(file, content);
  try {
    return sumAmount(file);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('csv-sum reference adds decimal amounts exactly', () => {
  assert.equal(sumOf('id,amount\n1,0.1\n2,0.2\n'), 0.3);
  assert.equal(sumOf('id,amount\n1,10.10\n2,20.20\n'), 30.3);
  assert.equal(sumOf('id,amount\n1,-1.5\n2,.25\n3,4\n'), 2.75);
});

test('csv-sum reference keeps a quoted record that holds a newline', () => {
  assert.equal(sumOf('note,amount\n"line one\nline two",5\n"a,b",3\n'), 8);
  assert.equal(sumOf('note,amount\r\n"x\r\ny",5\r\n'), 5);
});

test('csv-sum reference still skips broken rows', () => {
  assert.equal(sumOf('id,amount\n1,10\n2,abc\n3\n\n4,20\n'), 30);
  assert.equal(sumOf('id,amount\n1,10\n2,"open\n4,20\n'), 30);
});

test('csv-sum reference skips unbalanced-quote rows and keeps later valid rows', () => {
  assert.equal(sumOf('id,amount\n1,"10\n2,20\n3,"5\n'), 20);
  assert.equal(sumOf('id,amount\n1,"10\n2,"x"\n3,7.5\n'), 7.5);
});

test('csv-sum reference treats a quote inside a field as a literal character', () => {
  assert.equal(sumOf('name,amount\nBob 12" pizza,5\nAnn,7\nCid 6",3\n'), 15);
  assert.equal(sumOf('item,amount\npipe 12",5\nok,6\nbolt 3",7\n'), 18);
});
