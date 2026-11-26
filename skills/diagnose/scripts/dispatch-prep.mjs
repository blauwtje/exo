#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { git } from '#git';
import { isMain, parseFlags } from '#script-flags';
import { scratchPath } from '#scratch-path';

const USAGE = 'usage: dispatch-prep.mjs --symptom <text> [--bisect <file>] [--handoff <file>] [--ruled-out <text>]';
const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SLUG_MAX = 40;

function template(name) {
  const text = fs.readFileSync(path.join(SKILL_DIR, 'references', name), 'utf8');
  return text.match(/```text\n([\s\S]*?)\n```/)[1];
}

function fill(text, values) {
  return Object.entries(values).reduce((out, [key, value]) => out.replaceAll(`<${key}>`, () => value), text);
}

export function slugOf(symptom) {
  const slug = symptom.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, SLUG_MAX).replace(/^-+|-+$/g, '');
  return slug === '' ? 'symptom' : slug;
}

function firstBad(file) {
  if (file === undefined) return 'none';
  return fs.readFileSync(file, 'utf8').split('\n').find((line) => line.startsWith('First bad:'))?.slice('First bad:'.length).trim() || 'none';
}

export function prepare({ symptom, bisect, handoff, ruledOut = 'none' }, cwd) {
  const top = git(cwd, ['rev-parse', '--show-toplevel']).stdout.trim() || cwd;
  const root = fs.realpathSync(top);
  if (handoff !== undefined) {
    const worktree = fs.realpathSync(cwd);
    return fill(template('fixer-prompt.md'), { root, 'abs path': worktree, 'skill dir': SKILL_DIR, 'handoff path': handoff });
  }
  const report = path.join(scratchPath(cwd, 'debug', path.resolve(top)), `${slugOf(symptom)}.md`);
  const prompt = fill(template('investigator-prompt.md'), {
    root,
    'skill dir': SKILL_DIR,
    'one line': symptom,
    'the First bad line of bisect.mjs, or none': firstBad(bisect),
    'the approaches the failed build already tried, or none': ruledOut,
  });
  return `Report: ${report}\n${prompt}`;
}

if (isMain(import.meta.url)) {
  const flags = parseFlags(process.argv.slice(2), { symptom: 'value', bisect: 'value', handoff: 'value', 'ruled-out': 'value' }, { usage: USAGE });
  process.stdout.write(`${prepare({ symptom: flags.symptom ?? '', bisect: flags.bisect, handoff: flags.handoff, ruledOut: flags['ruled-out'] }, process.cwd())}\n`);
}
