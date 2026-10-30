import { normalizeTags } from './tags.mjs';

export function indexTags(items) {
  const index = {};
  for (const { id, tags } of items) {
    for (const tag of normalizeTags(tags)) (index[tag] ??= []).push(id);
  }
  return index;
}
