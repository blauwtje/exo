// Syntax parsing for the disposable fixture repositories cases.json carries as
// inline text. The fixture language follows FIXTURE_SCRIPT_EXTENSION, so a rename of
// the fixture corpus moves this dispatch with it.
//
// Port of the ParseInput loop inside Test-EvalCases (verify.ps1:1184-1191).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { FIXTURE_SCRIPT_EXTENSION } from './oracles.mjs';

// `node --check` parses a module without executing it, so an import of a sibling
// fixture file that does not exist in the temp directory never surfaces here: only
// a genuine syntax error does.
function parseErrorMessage(stderr) {
  const errorLine = stderr.split(/\r?\n/).find((line) => /Error:/.test(line));
  return (errorLine ?? stderr).trim();
}

function parseWithNode(scripts) {
  const payloadDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-syntax-'));
  try {
    return scripts.map((script, index) => {
      const scriptPath = path.join(payloadDirectory, `script-${index}${FIXTURE_SCRIPT_EXTENSION}`);
      fs.writeFileSync(scriptPath, script, 'utf8');
      const result = spawnSync(process.execPath, ['--check', scriptPath], { encoding: 'utf8' });
      return result.status === 0 ? [] : [parseErrorMessage(result.stderr)];
    });
  } finally {
    fs.rmSync(payloadDirectory, { recursive: true, force: true });
  }
}

// Answers, for each script body handed in, the parse errors it produces. Identical
// bodies are parsed once: the same fixture sources repeat across all thirty cases.
export function parseFixtureScripts(scripts) {
  const unique = [...new Set(scripts)];
  if (unique.length === 0) return new Map();
  if (FIXTURE_SCRIPT_EXTENSION !== '.mjs') {
    throw new Error(`no fixture parser for ${FIXTURE_SCRIPT_EXTENSION} scripts`);
  }
  const messages = parseWithNode(unique);
  return new Map(unique.map((script, index) => [script, messages[index]]));
}
