import { makeDefaultOptionsHome } from '#default-options-home';

export function withHome(run, home) {
  return { ...run, env: { ...run.env, HOME: home } };
}

export function pressureHome() {
  return makeDefaultOptionsHome({ withoutInstalledPlugins: true });
}
