#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { powerLine } from '../lib/eval-stats.mjs';
import { minDetectableEffect, signTest } from './statistics.mjs';

const { values } = parseArgs({ options: { rate: { type: 'string' }, n: { type: 'string' }, samples: { type: 'string', default: '1' }, effect: { type: 'string' }, paired: { type: 'boolean', default: false }, scores: { type: 'string' }, ceiling: { type: 'string', default: '0.95' } } });
const rate = Number(values.rate);
const n = Number(values.n);
const samples = Number(values.samples);
const effect = values.effect === undefined ? undefined : Number(values.effect);
if (!(rate > 0 && rate < 1) || !Number.isInteger(n) || n < 1 || !Number.isInteger(samples) || samples < 1 || !(effect === undefined || effect > 0)) {
  console.error('usage: mde.mjs --rate <0..1> --n <tasks per arm> [--samples <runs per task>] [--effect <target>] [--paired] [--scores <a,b,...> [--ceiling <0..1>]]');
  process.exit(2);
}
const allWins = signTest(Array.from({ length: n }, () => [0, 1]));
const uncapped = minDetectableEffect({ rate, n });
const largest = 1 - rate;
if (uncapped > largest) {
  console.log(`min detectable effect: undetectable at n=${n} (needs ${uncapped.toFixed(3)}, the largest possible effect is ${largest.toFixed(3)})`);
} else {
  console.log(`min detectable effect: ${uncapped.toFixed(3)}`);
}
console.log(`sign test p, ${n} of ${n} pairs won: ${allWins.p.toPrecision(3)}`);
console.log(powerLine({ tasks: n, samples, rate, paired: values.paired, effect }));
if (values.scores !== undefined) {
  const scores = values.scores.split(',').map(Number);
  const ceiling = Number(values.ceiling);
  if (scores.every((score) => score >= ceiling)) {
    console.log(`ceiling: every score is at or above ${ceiling}, so the set ranks no setting`);
  }
}
