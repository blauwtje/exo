const INITIAL_DATA = 'var ytInitialData = ';

function titleOf(text) {
  return text?.simpleText ?? text?.runs?.map((run) => run.text).join('') ?? '';
}

function panelMarkers(panel) {
  const items = panel.engagementPanelSectionListRenderer?.content?.macroMarkersListRenderer?.contents ?? [];
  return items.map((item) => item.macroMarkersListItemRenderer).filter(Boolean);
}

function firstMarkers(data) {
  return (data?.engagementPanels ?? []).map(panelMarkers).find((markers) => markers.length > 0) ?? [];
}

function initialDataOf(html) {
  const from = html.indexOf(INITIAL_DATA);
  if (from < 0) return null;
  const start = from + INITIAL_DATA.length;
  try {
    return JSON.parse(html.slice(start, html.indexOf(';</script>', start)));
  } catch {
    return null;
  }
}

export function chaptersFromHtml(html, duration) {
  const markers = firstMarkers(initialDataOf(html));
  const starts = new Map();
  for (const marker of markers) {
    const start = marker.onTap?.watchEndpoint?.startTimeSeconds;
    if (typeof start === 'number' && !starts.has(start)) starts.set(start, titleOf(marker.title).replace(/\s+/g, ' ').trim() || 'Chapter');
  }
  const ordered = [...starts].sort((a, b) => a[0] - b[0]);
  return ordered.map(([start, title], index) => ({ start, end: ordered[index + 1]?.[0] ?? duration, title }));
}
