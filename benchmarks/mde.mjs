#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { minDetectableEffect, signTest } from './statistics.mjs';

const { values } = parseArgs({ options: { rate: { type: 'string' }, n: { type: 'string' } } });
const rate = Number(values.rate);
const n = Number(values.n);
if (!(rate > 0 && rate < 1) || !Number.isInteger(n) || n < 1) {
  console.error('usage: mde.mjs --rate <0..1> --n <runs per arm>');
  process.exit(2);
}
const allWins = signTest(Array.from({ length: n }, () => [0, 1]));
console.log(`min detectable effect: ${minDetectableEffect({ rate, n }).toFixed(3)}`);
console.log(`sign test p, ${n} of ${n} pairs won: ${allWins.p.toPrecision(3)}`);
