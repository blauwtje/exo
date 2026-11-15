#!/usr/bin/env node
import { buildGraph } from './skill-graph-build.mjs';
import { cmdSize, cmdRange, cmdRangeSed, cmdInbound, cmdPins, cmdJson, cmdRefs, cmdOverlap } from './skill-graph-commands.mjs';

const COMMANDS = {
  size: { usage: 'size <skill>', required: 1, run: (graph, [skill]) => cmdSize(graph, skill) },
  range: {
    usage: 'range <path-or-skill> <heading text or prefix> [--sed]',
    required: 2,
    run: (graph, [target, ...heading], sed) => (sed ? cmdRangeSed : cmdRange)(graph, target, heading.join(' '))
  },
  inbound: { usage: 'inbound <path>[#heading]', required: 1, run: (graph, [target]) => cmdInbound(graph, target) },
  pins: { usage: 'pins <skill|path>', required: 1, run: (graph, [target]) => cmdPins(graph, target) },
  refs: { usage: 'refs <skill>', required: 1, run: (graph, [skill]) => cmdRefs(graph, skill) },
  overlap: { usage: 'overlap <json-file>', required: 1, run: (graph, [file]) => cmdOverlap(graph, file) },
  json: { usage: 'json', required: 0, run: (graph) => cmdJson(graph) }
};

function main() {
  const [command, ...args] = process.argv.slice(2);
  const positional = args.filter((arg) => arg !== '--sed');
  const spec = Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : undefined;
  if (!spec) {
    console.error(`usage: skill-graph.mjs <${Object.keys(COMMANDS).join('|')}> [args]`);
    process.exitCode = 1;
    return;
  }
  if (positional.length < spec.required) {
    console.error(`usage: skill-graph.mjs ${spec.usage}`);
    process.exitCode = 1;
    return;
  }
  spec.run(buildGraph(), positional, args.includes('--sed'));
}

main();
