import fs from 'node:fs';
import process from 'node:process';
import vm from 'node:vm';

let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) input += chunk;
const files = input.split('\n').filter((line) => line !== '');

function failureOf(file) {
  try {
    new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { identifier: file });
    return null;
  } catch (error) {
    return { file, message: String(error.message).split('\n').join(' ').trim() };
  }
}

process.stdout.write(JSON.stringify(files.map(failureOf).filter((failure) => failure !== null)));
