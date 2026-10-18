import { makeDefaultOptionsHome } from '#default-options-home';

// why: Every cell runs with this HOME. It leaves out the global CLAUDE.md, so
// a score measures exo and not the user's personal rules.
export function makeCellHome() {
  return makeDefaultOptionsHome({ withoutClaudeMd: true });
}
