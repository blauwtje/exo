import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { briefFailures, limitFailures } from '../verify/checks/brief-grammar.mjs';
import { createRepository } from '../verify/repository.mjs';
import { tempDir } from './harness.mjs';

function repositoryWith(files) {
  const root = tempDir('brief-grammar-');
  for (const [name, source] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), source);
  }
  return createRepository(root);
}

const fenced = (body) => `Send this to a \`general-purpose\` delegate.\n\n\`\`\`text\n${body}\n\`\`\`\n`;
const GOOD = 'exo-kind: build\nWorktree: <abs path>\nReads: <paths>\nResult: .exo/<name>.md\nFetches: <n>\nGo.';

test('one field per line with every label parsed passes', () => {
  assert.deepEqual(briefFailures(repositoryWith({ 'skills/build/ref.md': fenced(GOOD) })), []);
});

test('a field the parser cannot split from its neighbour fails by name', () => {
  const inline = 'exo-kind: build\nWorkers: 3 (Reads: a.md)\nGo.';
  const found = briefFailures(repositoryWith({ 'skills/build/ref.md': fenced(inline) }));
  assert.match(found[0], /skills\/build\/ref\.md shows Reads: but the parser does not read it/);
});

test('a description span the parser reads passes and an unsplittable span in the rules fails', () => {
  const agent = '---\nname: o\ndescription: "Brief: `Workers: <n>`, `Reads: a.md` or `none`."\n---\nBody\n';
  assert.deepEqual(briefFailures(repositoryWith({ 'agents/o.md': agent })), []);
  const rules = { 'hooks/dispatch-rules.md': 'Give `Workers: 3 (Reads: a.md)` here.\n' };
  assert.match(briefFailures(repositoryWith(rules))[0], /shows Reads:/);
});

test('a general-purpose delegate template with no Reads: or Fetches: line fails', () => {
  const text = 'Dispatch a `general-purpose` delegate whose prompt opens with `exo-kind: lookup`.\n';
  assert.match(briefFailures(repositoryWith({ 'skills/build/SKILL.md': text }))[0], /skills\/build\/SKILL\.md briefs a general-purpose delegate but shows no Reads: or Fetches: line/);
  assert.deepEqual(briefFailures(repositoryWith({ 'skills/build/SKILL.md': `${text}Add a \`Reads: <paths>\` line.\n` })), []);
});

test('agent texts that drop the reads count, budget or Fetches: rule fail by name', () => {
  const files = { 'agents/orchestrator.md': 'Read freely.\n', 'hooks/dispatch-rules.md': 'Fetches: <n>\n' };
  const found = limitFailures(repositoryWith(files));
  assert.equal(found.length, 5);
  assert.match(found[0], /does not state the reads count \(at most 4 reads\)/);
});

test('the shipped agent texts state the limits', () => {
  assert.deepEqual(limitFailures(createRepository(process.cwd())), []);
});

test('a repository without agents/orchestrator.md fails by naming the file', () => {
  const found = limitFailures(repositoryWith({ 'hooks/dispatch-rules.md': 'Fetches: <n>\n' }));
  assert.ok(found.includes('agents/orchestrator.md is missing'));
});

test('an orchestrator pointer to the dispatch rules passes when the rules state the budget and Fetches: rule', () => {
  const rules = 'Fetches: <n> whole number first, within 30k tokens.\n';
  const files = { 'agents/orchestrator.md': 'at most 4 reads; see the dispatch rules\n', 'hooks/dispatch-rules.md': rules };
  assert.deepEqual(limitFailures(repositoryWith(files)), []);
});

test('an orchestrator pointer to the dispatch rules fails when the rules lack the value', () => {
  const files = { 'agents/orchestrator.md': 'at most 4 reads; see the dispatch rules\n', 'hooks/dispatch-rules.md': 'Nothing here.\n' };
  const found = limitFailures(repositoryWith(files));
  assert.ok(found.some((line) => /does not state the context budget/.test(line)));
  assert.ok(found.some((line) => /does not state the Fetches: rule/.test(line)));
});
