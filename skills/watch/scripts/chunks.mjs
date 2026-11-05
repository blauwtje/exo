function packSegments(segments, windowSeconds) {
  const packed = [];
  let current = null;
  for (const segment of segments) {
    if (current && current.end - current.start >= windowSeconds) {
      packed.push(current);
      current = null;
    }
    current = current ? { ...current, end: segment.end, last: segment.title } : { start: segment.start, end: segment.end, first: segment.title, last: segment.title };
  }
  if (current) packed.push(current);
  return packed;
}

function foldTail(packed, windowSeconds) {
  const tail = packed.at(-1);
  if (packed.length < 2 || tail.end - tail.start >= windowSeconds / 2) return packed;
  const before = packed.at(-2);
  return [...packed.slice(0, -2), { ...before, end: tail.end, last: tail.last }];
}

function splitEvenly(chunk, windowSeconds) {
  const title = chunk.first === chunk.last ? chunk.first : `${chunk.first} to ${chunk.last}`;
  const length = chunk.end - chunk.start;
  const parts = length > windowSeconds * 1.5 ? Math.ceil(length / windowSeconds) : 1;
  if (parts === 1) return [{ start: chunk.start, end: chunk.end, title }];
  const step = length / parts;
  return Array.from({ length: parts }, (_, index) => ({
    start: chunk.start + step * index,
    end: index === parts - 1 ? chunk.end : chunk.start + step * (index + 1),
    title: `${title} (part ${index + 1}/${parts})`,
  }));
}

function closeGaps(chunks, duration) {
  return chunks.map((chunk, index) => ({
    ...chunk,
    start: index === 0 ? 0 : chunk.start,
    end: index === chunks.length - 1 ? Math.max(chunk.end, duration) : chunks[index + 1].start,
  }));
}

export function planChunks(duration, chapters, windowSeconds) {
  const segments = chapters.length > 0
    ? chapters.map((chapter) => ({ start: chapter.start, end: chapter.end, title: chapter.title }))
    : [{ start: 0, end: duration, title: 'Part' }];
  const packed = foldTail(packSegments(segments, windowSeconds), windowSeconds);
  return closeGaps(packed.flatMap((chunk) => splitEvenly(chunk, windowSeconds)), duration);
}
