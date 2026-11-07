import os from 'node:os';
import { draw, seeded } from '#draw';
import { runDefaults } from '../../build/scripts/run-config.mjs';

const ANALOGIST = 'Far-domain analogist';
const PERSONAS = [
  'Minimalist',
  'Contrarian',
  'User advocate',
  'Systems thinker',
  'Pragmatic shipper',
  'Skeptical operator',
  'Tinkerer'
];

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    values[argv[index].replace(/^--/, '')] = argv[index + 1];
  }
  return values;
}

function buildPlan({ mode, agents, ideas, random }) {
  const size = Math.min(agents, PERSONAS.length + 1);
  const drawn = draw(PERSONAS, random, size - 1);
  return {
    mode,
    agents: size,
    ideas,
    capped: size < agents,
    workers: mode === 'fast' ? 0 : size,
    personas: [ANALOGIST, ...drawn]
  };
}

function main(argv) {
  const args = parseArgs(argv);
  const defaults = runDefaults(os.homedir()).ideate;
  const random = args.seed === undefined ? Math.random : seeded(Number(args.seed));
  const plan = buildPlan({
    mode: args.mode ?? 'standard',
    agents: Number(args.agents ?? defaults.agents),
    ideas: Number(args.ideas ?? defaults.ideas),
    random
  });
  console.log(`Mode: ${plan.mode}`);
  console.log(`Agents: ${plan.agents}`);
  console.log(`Ideas: ${plan.ideas}`);
  console.log(`Workers: ${plan.workers}`);
  if (plan.capped) console.log(`Capped: persona pool holds ${plan.agents}`);
  plan.personas.forEach((persona, index) => console.log(`Persona ${index + 1}: ${persona}`));
}

if (import.meta.url === new URL(process.argv[1] ?? '', 'file:').href) main(process.argv.slice(2));
