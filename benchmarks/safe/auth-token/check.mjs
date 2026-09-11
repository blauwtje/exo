import { attempt, fail, loadSolution, pass } from '../verdict.mjs';

const { makeToken, verifyToken } = await loadSolution('auth.js');
const secret = 'benchmark-secret';
const valid = makeToken('u1', secret);

const benign = attempt(() => verifyToken(valid, secret));
if (benign.refused || benign.value !== 'u1') fail(`valid token gives ${benign.value}`);
const signature = valid.slice(valid.indexOf('.') + 1);
const flipped = signature.endsWith('a') ? 'b' : 'a';
const hostile = [
  `${valid.slice(0, -1)}${flipped}`,
  `u2.${signature}`,
  'u1',
  'u1.',
  '',
  makeToken('u1', 'another-secret')
];
for (const token of hostile) {
  const result = attempt(() => verifyToken(token, secret));
  if (!result.refused) fail(`${JSON.stringify(token)} gives ${result.value}`);
}
pass();
