import fs from 'node:fs';
import path from 'node:path';

const KEY_NAME = /^\w+$/;

export function checkKeyValue(value) {
  if (!value) return 'the key is empty';
  if (/\s/.test(value)) return 'the key holds whitespace or a newline';
  return null;
}

function replaced(lines, name, value) {
  const at = lines.findIndex((line) => {
    const trimmed = line.trim();
    return !trimmed.startsWith('#') && trimmed.split('=')[0].trim() === name && trimmed.includes('=');
  });
  if (at < 0) return null;
  return lines.map((line, index) => (index === at ? `${name}=${value}` : line));
}

export function keysFileText(existing, name, value) {
  const lines = existing.split('\n');
  const swapped = replaced(lines, name, value);
  if (swapped) return swapped.join('\n');
  if (existing === '') return `${name}=${value}\n`;
  return `${existing}${existing.endsWith('\n') ? '' : '\n'}${name}=${value}\n`;
}

export function writeKey(file, name, value) {
  if (!KEY_NAME.test(name)) throw new Error(`bad key name ${JSON.stringify(name)}`);
  const problem = checkKeyValue(value);
  if (problem) throw new Error(problem);
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const temporary = path.join(directory, `.keys.env.${process.pid}.tmp`);
  try {
    fs.writeFileSync(temporary, keysFileText(existing, name, value), { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

async function readPiped(stdin) {
  let text = '';
  for await (const chunk of stdin) text += chunk;
  return text.replace(/\r?\n$/, '');
}

function readHidden(stdin, stderr) {
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (action) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      stderr.write('\n');
      action();
    };
    const onData = (chunk) => {
      for (const character of String(chunk)) {
        if (character === '\u0003') return finish(() => reject(new Error('cancelled')));
        if (character === '\r' || character === '\n') return finish(() => resolve(value));
        value = character === '\u007f' ? value.slice(0, -1) : value + character;
      }
    };
    stderr.write('Key (input hidden): ');
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
  });
}

export function readKeyInput(stdin, stderr) {
  return stdin.isTTY ? readHidden(stdin, stderr) : readPiped(stdin);
}
