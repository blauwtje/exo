import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// why: The user's settings.json with the options of every exo@ plugin config
// removed, so exo falls back to its schema defaults.
// withoutInstalledExo also turns off every installed exo@ plugin, so a session
// loads exo only from its --plugin-dir.
export function withoutExoOptions(settingsText, { withoutInstalledExo = false } = {}) {
  const settings = JSON.parse(settingsText);
  for (const [key, config] of Object.entries(settings.pluginConfigs ?? {})) {
    if (key.startsWith('exo@')) delete config.options;
  }
  if (withoutInstalledExo) {
    for (const key of Object.keys(settings.enabledPlugins ?? {})) {
      if (key.startsWith('exo@')) settings.enabledPlugins[key] = false;
    }
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
  for (const entry of entries.filter((name) => name !== 'plugin-root')) {
    fs.symlinkSync(path.join(realExo, entry), path.join(mirrorExo, entry));
  }
}

// why: A HOME for every cell, so arms differ only by what they load and none picks
// up the user's global exo options, whichever directory exo loads from: a
// symlink to every entry of the real home except .claude, and a real .claude
// holding a symlink to every entry of ~/.claude except settings.json, which is
// a copy without exo's options. HOME, not
// CLAUDE_CONFIG_DIR: a moved config directory loses the login (the keychain
// entry keys on it) and moves the transcripts away from where findTranscript
// in cell-usage.mjs looks; through the symlink they still land in the real
// ~/.claude/projects. withoutClaudeMd skips the CLAUDE.md link, so a session
// keeps the login but loads no global instructions. A real .claude/exo of links to every entry but
// plugin-root keeps exo's session hook from rewriting the user's real pointer.
export function makeDefaultOptionsHome({ withoutClaudeMd = false, withoutInstalledExo = false } = {}) {
  const home = os.homedir();
  const realConfig = path.join(home, '.claude');
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
  if (fs.existsSync(settingsFile)) fs.writeFileSync(path.join(mirrorConfig, 'settings.json'), withoutExoOptions(fs.readFileSync(settingsFile, 'utf8'), { withoutInstalledExo }));
  return mirror;
}
