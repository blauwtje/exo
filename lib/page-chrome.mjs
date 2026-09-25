// The chrome every browser page exo opens wears: design-ui's picker and sketch
// tab, and define-scope's question page, so a user who moves from one to the other
// stays in one tool. Imported as `#page-chrome`, because a skill script never
// reaches into another skill's folder.

export const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export const CHROME_TOKENS = `      color-scheme: light dark;
      --ground: light-dark(oklch(0.982 0.003 85), oklch(0.238 0.004 85));
      --surface: light-dark(oklch(1 0 0), oklch(0.292 0.005 85));
      --ink: light-dark(oklch(0.24 0.010 85), oklch(0.955 0.003 85));
      --ink-muted: light-dark(oklch(0.505 0.010 85), oklch(0.735 0.006 85));
      --border: light-dark(oklch(0.885 0.005 85), oklch(0.365 0.006 85));
      /* The hairline that separates surfaces is not the edge that identifies a
         control: that one owes 3:1 against its own fill, so it is its own token. */
      --border-control: light-dark(oklch(0.60 0.010 85), oklch(0.575 0.008 85));
      /* Amber, and only on marks the size of a coin: the comps carry the colour
         being judged, so chrome that competes with them is chrome that lies. */
      --accent: light-dark(oklch(0.52 0.145 52), oklch(0.765 0.135 68));
      --accent-ink: light-dark(oklch(0.99 0 0), oklch(0.22 0.03 68));
      --font-stack: ui-sans-serif, system-ui, sans-serif;
      --radius-control: 8px;`;
