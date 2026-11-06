import assert from 'node:assert/strict';
import { test } from 'node:test';
import { citationPrecision, gradeAnswer, gradeRun, readQuestions } from '../benchmarks/research/grade.mjs';

test('question set has the planned category counts', () => {
  const counts = {};
  for (const question of readQuestions()) counts[question.category] = (counts[question.category] ?? 0) + 1;
  assert.deepEqual(counts, { 'multi-hop': 8, 'false-premise': 4, 'citation-integrity': 4, comparison: 4 });
});

test('question ids are unique and every item has gold terms', () => {
  const questions = readQuestions();
  assert.equal(new Set(questions.map((question) => question.id)).size, 20);
  for (const question of questions) assert.ok(question.gold.length > 0, question.id);
});

test('gradeAnswer labels correct, incorrect and not attempted', () => {
  const question = { gold: ['helsinki', 'finland'], wrong: ['sweden'] };
  assert.equal(gradeAnswer(question, 'Born in Finland; capital Helsinki.'), 'correct');
  assert.equal(gradeAnswer(question, 'Finland, capital Stockholm'), 'incorrect');
  assert.equal(gradeAnswer(question, 'Finland and Helsinki, not Sweden'), 'incorrect');
  assert.equal(gradeAnswer(question, 'I could not find a reliable source.'), 'not attempted');
  assert.equal(gradeAnswer(question, '   '), 'not attempted');
});

test('citationPrecision counts quotes found on their page', () => {
  const page = 'The  Quick brown fox.';
  const citations = [
    { quote: 'quick BROWN fox', page },
    { quote: 'lazy dog', page }
  ];
  assert.equal(citationPrecision(citations), 0.5);
  assert.equal(citationPrecision([]), 0);
});

test('gradeRun combines label and precision', () => {
  const question = { id: 'x', gold: ['443'], wrong: [] };
  const run = { answer: 'Port 443.', citations: [{ quote: 'port 443', page: 'HTTPS uses Port 443' }] };
  assert.deepEqual(gradeRun(question, run), { id: 'x', label: 'correct', precision: 1 });
});

test('gradeAnswer matches terms as whole words', () => {
  const question = { gold: ['mit'], wrong: ['rust'] };
  assert.equal(gradeAnswer(question, 'Please submit it'), 'incorrect');
  assert.equal(gradeAnswer(question, 'Licensed under MIT.'), 'correct');
  assert.equal(gradeAnswer(question, 'MIT, in a trustworthy way'), 'correct');
});
