import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { configDirectory } from '#config-directory';

export function withoutExoOptions(settingsText, { withoutInstalledPlugins = false } = {}) {
  const settings = JSON.parse(settingsText);
  for (const [key, config] of Object.entries(settings.pluginConfigs ?? {})) {
    if (key.startsWith('exo@')) delete config.options;
  }
  if (withoutInstalledPlugins) {
    for (const key of Object.keys(settings.enabledPlugins ?? {})) settings.enabledPlugins[key] = false;
  }
  return `${JSON.stringify(settings, null, 2)}\n`;
}

function linkExoFolder(realExo, mirrorExo) {
  let entries;
  try {
    entries = fs.readdirSync(realExo);
  } catch {
    return;
  }
  fs.mkdirSync(mirrorExo);
  for (const entry of entries.filter((name) => name !== 'plugin-root' && name !== 'plugin-main')) {
    fs.symlinkSync(path.join(realExo, entry), path.join(mirrorExo, entry));
  }
}

export function makeDefaultOptionsHome({ withoutClaudeMd = false, withoutInstalledPlugins = false } = {}) {
  const home = os.homedir();
  const realConfig = configDirectory();
  const mirror = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-bench-home-'));
  const mirrorConfig = path.join(mirror, '.claude');
  for (const entry of fs.readdirSync(home)) {
    if (entry !== '.claude') fs.symlinkSync(path.join(home, entry), path.join(mirror, entry));
  }
  fs.mkdirSync(mirrorConfig);
  if (!fs.existsSync(realConfig)) return mirror;
  for (const entry of fs.readdirSync(realConfig)) {
    if (entry === 'settings.json' || entry === 'exo') continue;
    if (withoutClaudeMd && entry === 'CLAUDE.md') continue;
    fs.symlinkSync(path.join(realConfig, entry), path.join(mirrorConfig, entry));
  }
  linkExoFolder(path.join(realConfig, 'exo'), path.join(mirrorConfig, 'exo'));
  const settingsFile = path.join(realConfig, 'settings.json');
  if (fs.existsSync(settingsFile)) fs.writeFileSync(path.join(mirrorConfig, 'settings.json'), withoutExoOptions(fs.readFileSync(settingsFile, 'utf8'), { withoutInstalledPlugins }));
  return mirror;
}
