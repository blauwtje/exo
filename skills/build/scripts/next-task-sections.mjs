import { inputPaths } from '#plan-inputs';

const SMALL_TASK_FILES = 2;

const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function namesFile(bullet, file) {
  if (bullet.includes(file.path) || (file.region !== null && bullet.includes(file.region))) return true;
  const segments = file.path.split('/');
  const basename = new RegExp(`(?<![\\w/])${escaped(segments.at(-1))}(?!\\w)`);
  const directories = segments.slice(0, -1).map((_, index) => escaped(segments.slice(0, index + 1).join('/')));
  return basename.test(bullet) || directories.some((directory) => new RegExp(`(?<![\\w/.-])${directory}(?:/(?![\\w.-])|(?![\\w/-]))`).test(bullet));
}

function bulletsFor(task, bullets) {
  const named = bullets.filter((bullet) => task.files.some((file) => namesFile(bullet, file)));
  if (named.length === 0 && task.files.length > SMALL_TASK_FILES) return bullets;
  return bullets.filter((bullet) => named.includes(bullet) || inputPaths(bullet).length > 0);
}

export function headedLines(task, heading, bullets) {
  if (bullets.length === 0 && task.files.length <= SMALL_TASK_FILES) return [];
  return [heading, ...bulletLines(bullets)];
}

export function sectionLines(task, heading, bullets) {
  return headedLines(task, heading, bulletsFor(task, bullets));
}

export function bulletLines(bullets) {
  return bullets.length === 0 ? ['- none'] : bullets.map((bullet) => `- ${bullet}`);
}
