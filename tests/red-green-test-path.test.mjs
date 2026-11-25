import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTestPath, testPaths } from '../lib/red-green.mjs';

test('common naming conventions mark test paths', () => {
  const tests = [
    'tests/a.js', 'src/test/a.js', 'src/__tests__/a.js', 'spec/a.rb', 'Specs/a.rb', 'spec/models/user_spec.rb', 'TESTS/a.c',
    'tools/app/App.Tests/Parser.cs', 'src/App.Test/Parser.cs', 'pkg/foo_test/a.go', 'pkg/foo-tests/a.go',
    'src/AppTests/a.swift', 'src/UnitTest/a.kt', 'app/src/androidTest/a.kt', 'src/FooSpec/a.scala',
    'src/foo.test.ts', 'pkg/foo_test.go', 'src/foo-spec.js', 'lib/foo.spec.rb', 'pkg/test_foo.py',
    'src/FooTest.java', 'src/FooTests.cs', 'Sources/FooTests.swift', 'src/FooSpec.scala',
  ];
  const production = [
    'src/Contest.java', 'src/latest.js', 'src/attestation.go', 'src/App.Core/Parser.cs', 'src/Testing.md',
    'src/contest/a.js', 'src/latest/a.js', 'src/protests.py', 'lib/specification.rb', 'src/Tester.java',
    'skills/spec/scripts/plan-check.mjs', 'lib/spec/x.js',
  ];
  for (const file of tests) assert.equal(isTestPath(file), true, file);
  for (const file of production) assert.equal(isTestPath(file), false, file);
});

test('a path the proof command names counts as a test only when no convention matches', () => {
  const changed = ['tools/pz/PzChecks/Finder.cs', 'tools/pz/Pz.Core/Finder.cs'];
  assert.deepEqual(testPaths(changed, ['dotnet test tools/pz/PzChecks']), ['tools/pz/PzChecks/Finder.cs']);
  assert.deepEqual(testPaths(changed, ['node ./tools/pz/PzChecks/ "x"']), ['tools/pz/PzChecks/Finder.cs']);
  assert.deepEqual(testPaths(['a/check.mjs', 'a/run.mjs'], ['node a/check.mjs']), ['a/check.mjs']);
  assert.deepEqual(testPaths(changed, ['npm test .']), []);
  assert.deepEqual(testPaths([...changed, 'tests/a.js'], ['dotnet test tools/pz/PzChecks']), ['tests/a.js']);
});
