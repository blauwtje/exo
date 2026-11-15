import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { isMain } from '#script-flags';
import { isFile } from '../repository.mjs';

const PARSER = import.meta.filename;
const FLAGS = ['--experimental-vm-modules', '--disable-warning=ExperimentalWarning'];
const parsed = new Map();

const undotted = (target) => !path.basename(target).startsWith('.');

function stamp(file) {
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  return stat ? `${file}\0${stat.mtimeMs}\0${stat.size}` : file;
}

function parseAll(files) {
  const parse = spawnSync(process.execPath, [...FLAGS, PARSER], { input: files.join('\n'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (parse.status === 0) return JSON.parse(parse.stdout);
  return [{ file: PARSER, message: `the parser stopped: ${`${parse.stdout ?? ''}${parse.stderr ?? ''}`.split('\n').join(' ').trim()}` }];
}

function syntaxFailures(files) {
  const pending = files.filter((file) => !parsed.has(stamp(file)));
  if (pending.length === 0) return files.flatMap((file) => parsed.get(stamp(file)));
  const failures = parseAll(pending);
  if (failures.some((failure) => failure.file === PARSER)) return failures;
  for (const file of pending) parsed.set(stamp(file), failures.filter((failure) => failure.file === file));
  return files.flatMap((file) => parsed.get(stamp(file)));
}

function failureOf(file) {
  try {
    new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { identifier: file });
    return null;
  } catch (error) {
    return { file, message: String(error.message).split('\n').join(' ').trim() };
  }
}

function moduleFiles(repository) {
  const listing = spawnSync('git', ['-C', repository.root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
  if (listing.status !== 0) {
    return repository.walk(repository.root, (file) => file.endsWith('.mjs') && undotted(file), undotted);
  }
  return listing.stdout.split('\0')
    .filter((entry) => entry.endsWith('.mjs') && entry.split('/').every((part) => !part.startsWith('.')))
    .map((entry) => repository.join(entry))
    .filter(isFile);
}

export function checkScriptSyntax(report, repository) {
  const files = moduleFiles(repository);
  const javascriptErrors = syntaxFailures(files).map(({ file, message }) => `${repository.relative(file)}: ${message}`);
  report.assert(
    javascriptErrors.length === 0,
    'javascript syntax',
    { pass: 'every JavaScript module parses', fail: javascriptErrors.join('; ') }
  );
}

if (isMain(import.meta.url)) {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  const files = input.split('\n').filter((line) => line !== '');
  process.stdout.write(JSON.stringify(files.map(failureOf).filter((failure) => failure !== null)));
}
