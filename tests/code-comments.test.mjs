import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CODE_EXTENSIONS, commentFindings } from '#code-comments';

const all = (text) => text.split('\n').map((_, index) => index + 1);
const find = (file, text) => commentFindings(file, all(text), text);
const kinds = (file, text) => find(file, text).map((finding) => finding.kind);

test('the table names code extensions and no prose or config', () => {
  for (const ext of ['.js', '.ts', '.py', '.rb', '.go', '.rs', '.java', '.kt', '.cs', '.c', '.h', '.cpp', '.hpp', '.swift', '.php', '.sh', '.bash', '.zsh', '.ps1', '.lua', '.sql']) {
    assert.ok(CODE_EXTENSIONS[ext], ext);
  }
  for (const ext of ['.md', '.json', '.yaml', '.yml', '.toml']) {
    assert.equal(CODE_EXTENSIONS[ext], undefined, ext);
  }
});

test('a file outside the table has no findings', () => {
  assert.deepEqual(find('notes.md', '// not code\n'), []);
  assert.deepEqual(find('package.json', '{}\n'), []);
});

test('a line comment and a trailing comment are found with their line', () => {
  const text = 'const a = 1;\n// explain a\nconst b = 2; // trailing\n';
  assert.deepEqual(find('a.js', text), [
    { line: 2, kind: 'comment', text: '// explain a' },
    { line: 3, kind: 'comment', text: 'const b = 2; // trailing' },
  ]);
});

test('only added lines are reported', () => {
  const text = '// old\nconst a = 1;\n// new\n';
  assert.deepEqual(commentFindings('a.js', [3], text), [{ line: 3, kind: 'comment', text: '// new' }]);
});

test('a block comment is one finding at its first added line', () => {
  const text = 'const a = 1;\n/*\n one\n two\n*/\n';
  assert.deepEqual(commentFindings('a.js', [3, 4], text), [{ line: 3, kind: 'comment', text: 'one' }]);
});

test('comment markers inside strings, templates and regexes are not comments', () => {
  const text = [
    "const url = 'http://example.com';",
    'const t = `a // b`;',
    'const r = /"[^/]*\'/;',
    'const d = a / b; const e = "/*";',
    '',
  ].join('\n');
  assert.deepEqual(find('a.js', text), []);
});

test('a license header before the first code line is allowed', () => {
  assert.deepEqual(find('a.js', '// Copyright 2026 Acme\n// Licensed under MIT\nconst a = 1;\n'), []);
  assert.deepEqual(find('a.js', '/* SPDX-License-Identifier: MIT */\nconst a = 1;\n'), []);
  assert.deepEqual(kinds('a.js', 'const a = 1;\n// Copyright 2026 Acme\n'), ['comment']);
  assert.deepEqual(kinds('a.js', '// plain header\nconst a = 1;\n'), ['comment']);
});

test('a doc comment directly above an exported declaration is allowed', () => {
  assert.deepEqual(find('a.js', '/** Adds. */\nexport function add() {}\n'), []);
  assert.deepEqual(find('a.go', '// Add sums.\nfunc Add() {}\n'), []);
  assert.deepEqual(find('a.rs', '/// Adds.\npub fn add() {}\n'), []);
  assert.deepEqual(find('A.java', '/** Adds. */\npublic int add() {}\n'), []);
});

test('a doc comment above a private declaration or after a blank line is a comment', () => {
  assert.deepEqual(kinds('a.js', '/** Adds. */\nfunction add() {}\n'), ['comment']);
  assert.deepEqual(kinds('a.go', '// add sums.\nfunc add() {}\n'), ['comment']);
  assert.deepEqual(kinds('a.js', '/** Adds. */\n\nexport function add() {}\n'), ['comment']);
  assert.deepEqual(kinds('a.js', '// Adds.\nexport function add() {}\n'), ['comment']);
});

test('a comment holding an issue, pull or RFC reference or a why: marker is allowed', () => {
  assert.deepEqual(find('a.py', '# see https://github.com/acme/app/issues/42\nx = 1\n'), []);
  assert.deepEqual(find('a.py', 'x = 1  # https://github.com/acme/app/pull/7\n'), []);
  assert.deepEqual(find('a.go', 'x := 1 // RFC 9110 says so\n'), []);
  assert.deepEqual(find('a.js', 'const a = 1; // why: the API sorts by id\n'), []);
  assert.deepEqual(kinds('a.js', 'const a = 1; // see the wiki\n'), ['comment']);
});

test('directives are not comments', () => {
  assert.deepEqual(find('a.sh', '#!/usr/bin/env bash\necho hi\n'), []);
  assert.deepEqual(find('a.py', '#!/usr/bin/env python3\n# -*- coding: utf-8 -*-\nx = 1\n'), []);
  assert.deepEqual(find('a.py', '# coding=utf-8\nx = 1\n'), []);
  assert.deepEqual(find('a.go', '//go:build linux\npackage a\n'), []);
  assert.deepEqual(find('a.ts', '/// <reference types="node" />\nconst a = 1;\n'), []);
  assert.deepEqual(find('a.js', '// @ts-check\nconst a = 1;\n'), []);
});

test('python and shell hash comments are found, a hash in a string or expansion is not', () => {
  assert.deepEqual(kinds('a.py', 'x = 1  # one\ny = "#no"\n'), ['comment']);
  assert.deepEqual(kinds('a.sh', 'echo $# ${#x}\n# note\n'), ['comment']);
  assert.deepEqual(find('a.py', 'x = """\n# in a docstring\n"""\n'), []);
});

test('other syntaxes: sql, lua, powershell, php, ruby, rust lifetimes', () => {
  assert.deepEqual(kinds('a.sql', "select '--'; -- c\n"), ['comment']);
  assert.deepEqual(kinds('a.lua', 'local a = 1 -- c\n--[[ b ]]\n'), ['comment', 'comment']);
  assert.deepEqual(kinds('a.ps1', '$a = 1 # c\n<# b #>\n'), ['comment', 'comment']);
  assert.deepEqual(kinds('a.php', '<?php\n# c\n// d\n'), ['comment', 'comment']);
  assert.deepEqual(kinds('a.rb', 'a = 1 # c\n'), ['comment']);
  assert.deepEqual(kinds('a.rs', "fn f<'a>(x: &'a str) {}\n// c\n"), ['comment']);
});

test('a suppression comment is a suppression, not a comment', () => {
  const cases = {
    'a.js': '// eslint-disable-next-line no-console\n',
    'b.ts': '// @ts-ignore\n',
    'c.ts': '// @ts-expect-error\n',
    'd.py': 'x = 1  # noqa\n',
    'e.py': 'x = 1  # type: ignore\n',
    'f.go': 'x := 1 // nolint\n',
    'g.rb': 'x = 1 # rubocop:disable Metrics/AbcSize\n',
    'h.js': '/* istanbul ignore next */\n',
    'i.js': '// biome-ignore lint/style/noVar: legacy\n',
  };
  for (const [file, text] of Object.entries(cases)) {
    assert.deepEqual(kinds(file, text), ['suppression'], file);
  }
});

test('a suppression in code is a suppression', () => {
  assert.deepEqual(kinds('A.java', '@SuppressWarnings("unchecked")\nvoid f() {}\n'), ['suppression']);
  assert.deepEqual(kinds('a.rs', '#[allow(dead_code)]\nfn f() {}\n'), ['suppression']);
  assert.deepEqual(kinds('a.cs', '#pragma warning disable CS1591\n'), ['suppression']);
});

test('a suppression naming only style rules passes', () => {
  assert.deepEqual(find('a.js', '// eslint-disable-next-line max-len\n'), []);
  assert.deepEqual(find('a.js', '/* eslint-disable max-len, @stylistic/indent */\n'), []);
  assert.deepEqual(find('a.js', '// eslint-disable-next-line @stylistic/js/indent -- long url\n'), []);
  assert.deepEqual(find('a.py', 'x = 1  # noqa: E501\n'), []);
  assert.deepEqual(find('a.js', '// prettier-ignore\n'), []);
});

test('a suppression naming a style rule and another rule fails', () => {
  assert.deepEqual(kinds('a.js', '// eslint-disable-next-line max-len, no-console\n'), ['suppression']);
  assert.deepEqual(kinds('a.py', 'x = 1  # noqa: E501, F401\n'), ['suppression']);
  assert.deepEqual(kinds('a.js', '// eslint-disable\n'), ['suppression']);
});
