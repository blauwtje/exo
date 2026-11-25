import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTestPath } from '../lib/red-green.mjs';

test('a .NET test project folder counts as a test path', () => {
  assert.equal(isTestPath('tools/app/App.Tests/ParserTests.cs'), true);
  assert.equal(isTestPath('src/App.Test/ParserTests.cs'), true);
  assert.equal(isTestPath('src/App.Core/Parser.cs'), false);
});
