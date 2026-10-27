import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { calibrate, callStats, claudeJudge, factsInput, judgeFacts, judgePrompt, judgeStability, judgeVote, parseVerdicts } from '../benchmarks/adhd/judges.mjs';

const factNumbers = (input) => [...input.matchAll(/^Fact (\d+):/gm)].map((m) => m[1]);
const passAll = async ({ input }) => factNumbers(input).map((n) => `${n}: PASS`).join('\n');

test('the facts prompt asks for one PASS or FAIL line per fact', () => {
  assert.match(judgePrompt(), /PASS/);
  assert.match(judgePrompt(), /one line per fact/);
});

test('calibrate reports facts agreement and ignores rows of dropped judges', async () => {
  const labels = [
    { dimension: 'facts', reply: 'a', label: 'PASS', facts: ['f'] },
    { dimension: 'facts', reply: 'b', label: 'FAIL', facts: ['f'] },
    { dimension: 'first-line', reply: 'a', label: 'PASS' },
  ];
  const report = await calibrate({ labels, judge: passAll });
  assert.deepEqual([report.agree, report.total], [1, 2]);
  assert.deepEqual(report.pass, { agree: 1, total: 1 });
  assert.deepEqual(report.fail, { agree: 0, total: 1 });
});

test('judgeFacts judges one reply in one call and returns one verdict per fact', async () => {
  const calls = [];
  const judge = async (call) => { calls.push(call); return { text: '1: PASS\n2) FAIL\nFact 3: fail', cost: 0.5 }; };
  let cost = 0;
  const out = await judgeFacts({ reply: 'A', question: 'Q', facts: ['F1', 'F2', 'F3'], judge, onCost: (c) => { cost += c; } });
  assert.deepEqual(out, ['PASS', 'FAIL', 'FAIL']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].system, judgePrompt());
  assert.equal(calls[0].input, 'Question:\nQ\n\nRequired facts:\nFact 1: F1\nFact 2: F2\nFact 3: F3\n\nReply:\nA');
  assert.doesNotMatch(calls[0].input, /Reply \d/);
  assert.equal(cost, 0.5);
});

test('a judge call with no total_cost_usd is an error, not $0', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-fake-claude-'));
  fs.writeFileSync(path.join(dir, 'claude'), '#!/bin/sh\ncat >/dev/null\necho \'{"result":"PASS"}\'\n', { mode: 0o755 });
  const saved = process.env.PATH;
  process.env.PATH = `${dir}:${saved}`;
  try {
    await assert.rejects(claudeJudge({ system: 's', input: 'i' }), /total_cost_usd/);
  } finally {
    process.env.PATH = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('two judge calls overlap in time instead of blocking each other', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-fake-claude-'));
  fs.writeFileSync(path.join(dir, 'claude'), '#!/bin/sh\ncat >/dev/null\nsleep 1\necho \'{"result":"PASS","total_cost_usd":0}\'\n', { mode: 0o755 });
  const saved = process.env.PATH;
  process.env.PATH = `${dir}:${saved}`;
  try {
    const timed = async (count) => {
      const start = Date.now();
      await Promise.all(Array.from({ length: count }, () => claudeJudge({ system: 's', input: 'i' })));
      return Date.now() - start;
    };
    const one = await timed(1);
    const two = await timed(2);
    assert.ok(two < one * 1.8, `one call ${one} ms, two calls ${two} ms`);
  } finally {
    process.env.PATH = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('calibrate judges each row alone with the scoring prompt', async () => {
  const calls = [];
  const judge = async (call) => { calls.push(call); return passAll(call); };
  const labels = ['r1', 'r2', 'r3'].map((reply) => ({ dimension: 'facts', reply, question: 'q', facts: ['f'], label: 'PASS' }));
  const report = await calibrate({ labels, judge });
  assert.equal(calls.length, 9);
  assert.ok(calls.every((call) => call.system === judgePrompt() && (call.input.match(/^Reply:/gm) ?? []).length === 1));
  assert.equal(report.agree, 3);
});

test('a missing verdict line retries the judge call once, not a silent FAIL', async () => {
  const answers = ['1: PASS\n3: PASS', '1: PASS\n2: PASS\n3: FAIL'];
  let calls = 0;
  let cost = 0;
  const before = callStats.parseRetries;
  const judge = async () => ({ text: answers[calls++], cost: 0.25 });
  const out = await judgeFacts({ reply: 'A', facts: ['a', 'b', 'c'], judge, onCost: (c) => { cost += c; } });
  assert.deepEqual(out, ['PASS', 'PASS', 'FAIL']);
  assert.equal(calls, 2);
  assert.equal(cost, 0.5);
  assert.equal(callStats.parseRetries, before + 1);
});

test('a verdict missing twice is an error naming the fact', async () => {
  let calls = 0;
  const judge = async () => { calls += 1; return 'Fact one passes.\n2: FAIL'; };
  await assert.rejects(judgeFacts({ reply: 'A', facts: ['a', 'b'], judge }), /no verdict for fact 1 twice/);
  assert.equal(calls, 2);
});

test('parseVerdicts accepts a bare verdict only for a one-fact case', () => {
  assert.deepEqual(parseVerdicts('PASS', 1), ['PASS']);
  assert.deepEqual(parseVerdicts('PASS', 2), [null, null]);
});

test('parseVerdicts takes exactly one bare line per fact in order', () => {
  assert.deepEqual(parseVerdicts('PASS\nFAIL', 2), ['PASS', 'FAIL']);
  assert.deepEqual(parseVerdicts('PASS\nPASS\nPASS', 2), [null, null]);
  assert.deepEqual(parseVerdicts('PASS\nmaybe', 2), [null, null]);
});

test('a vote unparseable after its retry is dropped and the majority is taken over the rest', async () => {
  let n = 0;
  const before = callStats.droppedVotes;
  // calls 1-3 are the three votes' first attempts, call 4 is the retry of vote 1
  const judge = async () => { n += 1; return n === 1 || n === 4 ? 'no verdicts' : '1: PASS\n2: PASS'; };
  assert.deepEqual(await judgeVote({ reply: 'A', facts: ['a', 'b'], judge }), ['PASS', 'PASS']);
  assert.equal(callStats.droppedVotes, before + 1);
  let m = 0;
  const tied = async () => { m += 1; return m === 1 || m === 4 ? 'no verdicts' : m === 2 ? '1: PASS' + '\n2: PASS' : '1: FAIL\n2: FAIL'; };
  await assert.rejects(judgeVote({ reply: 'A', facts: ['a', 'b'], judge: tied }), /tied/);
  await assert.rejects(judgeVote({ reply: 'A', facts: ['a'], judge: async () => 'no verdicts' }), /no verdict for fact 1 twice/);
});

test('calibrate counts a built row as a deleted-fact hit only when exactly the deleted fact fails', async () => {
  const facts = ['f0', 'f1', 'f2'];
  const answers = { r1: '1: PASS\n2: FAIL\n3: PASS', r2: '1: FAIL\n2: FAIL\n3: PASS', r3: '1: PASS\n2: PASS\n3: PASS' };
  const judge = async ({ input }) => answers[/Reply:\n(\S+)/.exec(input)[1]];
  const labels = ['r1', 'r2', 'r3'].map((reply) => ({ id: reply, dimension: 'facts', question: 'Q', facts, reply, label: 'FAIL', built: { by: 'drop-fact', fact: 'f1' } }))
    .concat([{ id: 'h', dimension: 'facts', question: 'Q', facts, reply: 'r3', label: 'PASS' }]);
  const report = await calibrate({ labels, judge });
  assert.deepEqual(report.built, { agree: 2, total: 3 });
  assert.deepEqual(report.deleted, { agree: 1, total: 3 });
  assert.deepEqual(report.pass, { agree: 1, total: 1 });
});

test('judgeStability judges each reply alone and reports reply and fact flips between repeats', async () => {
  const seen = new Map();
  const judge = async ({ input }) => {
    const reply = /Reply:\n(\S+)/.exec(input)[1];
    seen.set(reply, (seen.get(reply) ?? 0) + 1);
    // why: r1 fails fact 1 in every vote of the first and third repeats, so its majority flips; r2 never flips.
    const repeat = Math.floor((seen.get(reply) - 1) / 3);
    return reply === 'r1' && repeat % 2 === 0 ? '1: FAIL\n2: PASS' : '1: PASS\n2: PASS';
  };
  const items = [{ id: 'a#0', question: 'Q', facts: ['f', 'g'], reply: 'r1' }, { id: 'a#1', question: 'Q', facts: ['f', 'g'], reply: 'r2' }];
  const report = await judgeStability({ items, repeats: 4, judge, concurrency: 3 });
  assert.deepEqual(report, { replies: 2, flipped: 1, flipRate: 0.5, minorityShare: 0.25, facts: 4, factsFlipped: 1, factFlipRate: 0.25 });
});

test('judgeVote returns the majority of 3 parallel judge calls per fact', async () => {
  const answers = ['1: PASS\n2: FAIL', '1: FAIL\n2: FAIL', '1: PASS\n2: PASS'];
  let n = 0;
  const judge = async () => answers[n++];
  assert.deepEqual(await judgeVote({ reply: 'A', facts: ['a', 'b'], judge }), ['PASS', 'FAIL']);
  assert.equal(n, 3);
  await assert.rejects(judgeVote({ reply: 'A', facts: ['a'], judge, votes: 2 }), /odd positive integer/);
});

test('factsInput holds the question, numbered facts and the one reply', () => {
  assert.equal(factsInput({ reply: 'R', question: 'Q', facts: ['a'] }), 'Question:\nQ\n\nRequired facts:\nFact 1: a\n\nReply:\nR');
});
