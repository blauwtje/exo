#!/usr/bin/env node
import { buildGraph } from './skill-graph-build.mjs';
import { cmdSize, cmdRange, cmdInbound, cmdPins, cmdJson } from './skill-graph-commands.mjs';
import { cmdRefs, cmdOverlap } from './skill-graph-refs.mjs';

const COMMANDS = {
  size: { usage: 'size <skill>', required: 1 },
  range: { usage: 'range <path-or-skill> <heading text or prefix> [--sed]', required: 2 },
  inbound: { usage: 'inbound <path>[#heading]', required: 1 },
  pins: { usage: 'pins <skill|path>', required: 1 },
  refs: { usage: 'refs <skill>', required: 1 },
  overlap: { usage: 'overlap <json-file>', required: 1 },
  json: { usage: 'json', required: 0 }
};

function main() {
  const [command, ...args] = process.argv.slice(2);
  const positional = args.filter((arg) => arg !== '--sed');
  const spec = COMMANDS[command];
  if (spec && positional.length < spec.required) {
    console.error(`usage: skill-graph.mjs ${spec.usage}`);
    process.exitCode = 1;
    return;
  }
  const graph = buildGraph();

  switch (command) {
    case 'size':
      cmdSize(graph, args[0]);
      break;
    case 'range':
      cmdRange(graph, positional[0], positional.slice(1).join(' '), args.includes('--sed'));
      break;
    case 'inbound':
      cmdInbound(graph, args[0]);
      break;
    case 'pins':
      cmdPins(graph, args[0]);
      break;
    case 'refs':
      cmdRefs(graph, args[0]);
      break;
    case 'overlap':
      cmdOverlap(graph, args[0]);
      break;
    case 'json':
      cmdJson(graph);
      break;
    default:
      console.error('usage: skill-graph.mjs <size|range|inbound|pins|refs|overlap|json> [args]');
      process.exitCode = 1;
  }
}

main();
