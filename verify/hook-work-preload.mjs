import fs from 'node:fs';
import { registerHooks, syncBuiltinESMExports } from 'node:module';
import process from 'node:process';

const PRELOAD_URL = import.meta.url;
const OUTPUT = process.env.EXO_HOOK_WORK_OUT;
const READERS = ['readFileSync', 'readFile', 'openSync', 'open', 'createReadStream', 'readdirSync'];
const writeFileSync = fs.writeFileSync;
const modules = new Set();
let reads = 0;
let depth = 0;

registerHooks({
  load(url, context, nextLoad) {
    if (url !== PRELOAD_URL) modules.add(url);
    depth += 1;
    try {
      return nextLoad(url, context);
    } finally {
      depth -= 1;
    }
  }
});

function counted(original, owner) {
  return function wrapped(target, ...rest) {
    const outermost = depth === 0;
    if (outermost && typeof target !== 'number') reads += 1;
    depth += 1;
    try {
      return original.call(owner, target, ...rest);
    } finally {
      depth -= 1;
    }
  };
}

for (const name of READERS) fs[name] = counted(fs[name], fs);
fs.promises.readFile = counted(fs.promises.readFile, fs.promises);
syncBuiltinESMExports();

process.on('exit', () => {
  const urls = [...modules];
  writeFileSync(OUTPUT, JSON.stringify({ modules: modules.size, reads, urls }));
});
