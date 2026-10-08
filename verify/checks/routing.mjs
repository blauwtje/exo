// A skill is chosen from its description alone, so a description that a user's
// plain request matches better in another skill's text misroutes. Each
// model-invocable skill has two user-worded sample prompts in
// verify/routing-samples.json; every description is ranked against a prompt by
// the number of distinct non-stopword words they share, and a sample whose own
// skill is not strictly first FAILs, naming the skill that outranked it. Two
// descriptions whose word sets overlap above ROUTING_SIMILARITY_CEILING
// (Jaccard) FAIL as well, because text that close cannot route apart.
// Run standalone: node verify/checks/routing.mjs

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { readFrontmatter } from '../frontmatter.mjs';
import { ROUTING_SIMILARITY_CEILING } from '../budgets.mjs';
import { createReport } from '../report.mjs';
import { createRepository } from '../repository.mjs';

const STOPWORDS = new Set((
  'a an and are as at be but by can do does for from has have how if in into is it its not of on or so than that the their them then there these this to up use used uses using was what when where which while who will with without you your i me my we our'
).split(' '));

export function words(text) {
  const found = new Set();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || STOPWORDS.has(raw)) continue;
    found.add(raw.length > 3 && raw.endsWith('s') && !raw.endsWith('ss') ? raw.slice(0, -1) : raw);
  }
  return found;
}

function overlap(left, right) {
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared;
}

export function checkRouting(report, repository) {
  const descriptions = new Map();
  for (const file of repository.everySkillFile()) {
    const parsed = readFrontmatter(repository.lines(file));
    if (parsed.errors.length > 0) {
      report.result('UNRUN', 'routing', `blocked by unparsed frontmatter in ${repository.relative(file)}`);
      return;
    }
    if (parsed.values.get('disable-model-invocation') === 'true') continue;
    descriptions.set(parsed.values.get('name'), words(parsed.values.get('description') ?? ''));
  }
  const samplesFile = repository.join('verify', 'routing-samples.json');
  if (!fs.existsSync(samplesFile)) {
    report.result('UNRUN', 'routing', 'verify/routing-samples.json is missing');
    return;
  }
  const samples = JSON.parse(fs.readFileSync(samplesFile, 'utf8'));
  const problems = [];
  for (const name of descriptions.keys()) {
    if (!Array.isArray(samples[name]) || samples[name].length < 2) problems.push(`${name} has fewer than two sample prompts`);
  }
  for (const name of Object.keys(samples)) {
    if (!descriptions.has(name)) problems.push(`sample skill ${name} is not a model-invocable skill`);
  }
  let count = 0;
  for (const [name, prompts] of Object.entries(samples)) {
    if (!descriptions.has(name)) continue;
    for (const prompt of prompts) {
      count += 1;
      const promptWords = words(prompt);
      const own = overlap(promptWords, descriptions.get(name));
      let best = { name: '', score: -1 };
      for (const [other, set] of descriptions) {
        const score = other === name ? -1 : overlap(promptWords, set);
        if (score > best.score) best = { name: other, score };
      }
      if (best.score >= own) {
        problems.push(`"${prompt}" belongs to ${name} (${own} shared words) but ${best.name} ${best.score > own ? 'outranks it' : 'ties it'} (${best.score})`);
      }
    }
  }
  const names = [...descriptions.keys()].sort();
  let highest = { value: 0, pair: '' };
  for (let first = 0; first < names.length; first += 1) {
    for (let second = first + 1; second < names.length; second += 1) {
      const left = descriptions.get(names[first]);
      const right = descriptions.get(names[second]);
      const value = overlap(left, right) / (left.size + right.size - overlap(left, right));
      if (value > highest.value) highest = { value, pair: `${names[first]} and ${names[second]}` };
      if (value > ROUTING_SIMILARITY_CEILING) {
        problems.push(`${names[first]} and ${names[second]} descriptions overlap ${value.toFixed(2)} (> ${ROUTING_SIMILARITY_CEILING})`);
      }
    }
  }
  if (problems.length > 0) {
    report.result('FAIL', 'routing', problems.join('; '));
    return;
  }
  report.result('PASS', 'routing', `${count} sample prompts each rank their own skill first; most similar descriptions ${highest.pair} at ${highest.value.toFixed(2)} (ceiling ${ROUTING_SIMILARITY_CEILING})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = createReport();
  checkRouting(report, createRepository(path.resolve(import.meta.dirname, '..', '..')));
  process.exit(report.counts().FAIL > 0 ? 1 : 0);
}
