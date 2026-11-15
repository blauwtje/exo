import { makeDefaultOptionsHome } from '#default-options-home';

export function withHome(run, home) {
  return { ...run, env: { ...run.env, HOME: home, CLAUDE_CONFIG_DIR: undefined } };
}

export function pressureHome() {
  return makeDefaultOptionsHome({ withoutInstalledPlugins: true });
}
