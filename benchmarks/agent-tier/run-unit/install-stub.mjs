import fs from 'node:fs';
import path from 'node:path';

const STUB_DIR = 'stub-build-task';
const CHEAP_KIND = { tier: 'fast', effort: null };

function cheapBuildTask(table) {
  const kinds = { ...table.kinds, 'build-task': { on: CHEAP_KIND, retry: CHEAP_KIND } };
  return { ...table, kinds };
}

export function installStub({ pluginDir, fixture, destination }) {
  fs.cpSync(pluginDir, destination, { recursive: true });
  fs.copyFileSync(path.join(import.meta.dirname, 'stub-build-task.md'), path.join(destination, 'agents', 'build-task.md'));
  const stub = path.join(destination, STUB_DIR);
  fs.mkdirSync(stub, { recursive: true });
  fs.copyFileSync(path.join(import.meta.dirname, 'stub.mjs'), path.join(stub, 'stub.mjs'));
  fs.cpSync(path.join(fixture, 'prepared'), path.join(stub, 'prepared'), { recursive: true });
  const kinds = path.join(destination, 'lib', 'model-kinds.json');
  fs.writeFileSync(kinds, `${JSON.stringify(cheapBuildTask(JSON.parse(fs.readFileSync(kinds, 'utf8'))), null, 2)}\n`);
  return destination;
}
