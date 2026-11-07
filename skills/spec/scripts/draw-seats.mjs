import { draw, seeded } from '#draw';

const POOL = [
  ['Smallest interface. One to three entry points.', 'The platform default, or the shape the code already has.'],
  ['Commonest caller. Its call reads as one line.', 'Keeping the current data model.'],
  ['Most flexible. A new use case needs no interface change.', 'Adding a server, service or background job.'],
  ['Data first. One new stored fact; every behavior derives from it.', 'Updating state in place.'],
  ['Pure core. Logic is a function of its inputs; effects sit at the edge.', 'A stateful object, manager or class.'],
  ['Manual first. The user does the step by hand or with a tool they already have; code only supplies what they lack.', 'Any new code path that runs without the user asking.'],
  ['Extend in place. The change lives inside modules that exist.', 'A new module, folder or abstraction.'],
  ['Record of events. Append what happened; compute the current view when read.', 'Storing the current state directly.']
];

const at = process.argv.indexOf('--seed');
const random = at === -1 ? Math.random : seeded(Number(process.argv[at + 1]));
draw(POOL, random).forEach(([seat, forbidden], index) => {
  console.log(`Pair ${index + 1}`);
  console.log(`Seat: ${seat}`);
  console.log(`Forbidden: ${forbidden}`);
});
