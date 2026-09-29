// Which plugin copy a pressure run loads. Both pressure runners start
// `claude` in a scratch directory, so a relative --plugin-dir must resolve
// against the caller's cwd first; a path that holds no plugin makes `claude`
// fall back silently to the installed copy, which only the skill base
// directories in the stream reveal. Imported as `#plugin-copy`.

import fs from 'node:fs';
import path from 'node:path';
import { UsageError } from '#script-flags';

const BASE_DIRECTORY = /^Base directory for this skill: (.+)$/gm;

function manifestName(pluginDir, flagName, file) {
  const manifestPath = path.join(pluginDir, '.claude-plugin', file);
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new UsageError(`${flagName} needs a readable '${manifestPath}': ${error.message}`);
  }
  if (typeof manifest?.name !== 'string' || manifest.name === '') {
    throw new UsageError(`${flagName} needs a 'name' in '${manifestPath}'`);
  }
  return manifest.name;
}

/** The absolute plugin directory `value` names from `cwd`; a UsageError when it holds no plugin manifest. */
export function resolvePluginDir(flagName, value, cwd) {
  const pluginDir = path.resolve(cwd, value);
  manifestName(pluginDir, flagName, 'plugin.json');
  return pluginDir;
}

/** The id an installed copy of the plugin has in `enabledPlugins`, such as `exo@blauwtje`. */
export function installedPluginId(pluginDir, flagName) {
  return `${manifestName(pluginDir, flagName, 'plugin.json')}@${manifestName(pluginDir, flagName, 'marketplace.json')}`;
}

/**
 * The arm the with arm is compared against: a second plugin copy (`main`)
 * when `mainDir` is given, else no plugin at all (`without`), which has to
 * disable the installed copy, since an enabled one loads anyway.
 */
export function comparisonArm({ pluginId, mainDir }) {
  if (mainDir !== undefined) return { name: 'main', pluginDir: mainDir, flags: ['--plugin-dir', mainDir] };
  const disableInstalled = JSON.stringify({ enabledPlugins: { [pluginId]: false } });
  return { name: 'without', pluginDir: undefined, flags: ['--settings', disableInstalled] };
}

function blockTexts(content) {
  if (typeof content === 'string') return [content];
  if (!Array.isArray(content)) return [];
  return content.flatMap((block) => {
    if (block?.type === 'text' && typeof block.text === 'string') return [block.text];
    if (block?.type === 'tool_result') return blockTexts(block.content);
    return [];
  });
}

/** The base directory of every skill a stream-json event loaded, from its `user` message. */
export function loadedSkillDirs(event) {
  if (event?.type !== 'user') return [];
  return blockTexts(event.message?.content).flatMap((text) =>
    Array.from(text.matchAll(BASE_DIRECTORY), (match) => match[1].trim()));
}

// The plugin name in `pluginDir`'s manifest, or undefined when none is readable.
function readPluginName(pluginDir) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(pluginDir, '.claude-plugin', 'plugin.json'), 'utf8'));
    return typeof manifest?.name === 'string' && manifest.name !== '' ? manifest.name : undefined;
  } catch {
    return undefined;
  }
}

// The skill directory names under `pluginDir/skills`, or undefined when that folder is unreadable.
function readSkillNames(pluginDir) {
  try {
    return new Set(fs.readdirSync(path.join(pluginDir, 'skills'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory()).map((entry) => entry.name));
  } catch {
    return undefined;
  }
}

/**
 * The loaded skill directories that hold a skill of the arm's plugin from
 * another copy; none when the arm loads no plugin copy. A directory outside
 * `pluginDir` (absolute) is such a copy when the plugin root two levels up,
 * `<root>/skills/<name>`, names the same plugin in its manifest. With no
 * manifest there, such as a removed copy or a personal skill, its folder name
 * decides: one of the arm's skill names, or any name when the arm's skills
 * are unreadable. A skill of another plugin or a personal skill passes.
 */
export function wrongCopies(skillDirs, pluginDir) {
  if (pluginDir === undefined) return [];
  const candidates = [pluginDir];
  try {
    candidates.push(fs.realpathSync(pluginDir));
  } catch {
    // A plugin directory removed after the run still compares by its given path.
  }
  const isUnder = (dir) => candidates.some((root) => dir === root || dir.startsWith(root + path.sep));
  const armName = readPluginName(pluginDir);
  const armSkills = readSkillNames(pluginDir);
  const isArmSkill = (dir) => {
    const ownerName = readPluginName(path.dirname(path.dirname(dir)));
    if (ownerName !== undefined) return armName === undefined || ownerName === armName;
    return armSkills === undefined || armSkills.has(path.basename(dir));
  };
  return skillDirs.filter((dir) => !isUnder(dir) && isArmSkill(dir));
}
