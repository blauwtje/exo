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

export function resolvePluginDir(flagName, value, cwd) {
  const pluginDir = path.resolve(cwd, value);
  manifestName(pluginDir, flagName, 'plugin.json');
  return pluginDir;
}

export function installedPluginId(pluginDir, flagName) {
  return `${manifestName(pluginDir, flagName, 'plugin.json')}@${manifestName(pluginDir, flagName, 'marketplace.json')}`;
}

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

export function loadedSkillDirs(event) {
  if (event?.type !== 'user') return [];
  return blockTexts(event.message?.content).flatMap((text) =>
    Array.from(text.matchAll(BASE_DIRECTORY), (match) => match[1].trim()));
}

function readPluginName(pluginDir) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(pluginDir, '.claude-plugin', 'plugin.json'), 'utf8'));
    return typeof manifest?.name === 'string' && manifest.name !== '' ? manifest.name : undefined;
  } catch {
    return undefined;
  }
}

function readSkillNames(pluginDir) {
  try {
    return new Set(fs.readdirSync(path.join(pluginDir, 'skills'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory()).map((entry) => entry.name));
  } catch {
    return undefined;
  }
}

export function wrongCopies(skillDirs, pluginDir) {
  if (pluginDir === undefined) return [];
  const candidates = [pluginDir];
  try {
    candidates.push(fs.realpathSync(pluginDir));
  } catch {
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
