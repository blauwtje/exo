import fs from 'node:fs';

function renderedHtml(url) {
  const { renders = [] } = JSON.parse(fs.readFileSync(process.env.EXO_FETCH_STUB, 'utf8'));
  const hit = renders.find(([match]) => url.includes(match));
  return hit ? hit[1] : '';
}

export const chromium = {
  async launch() {
    return {
      async newPage() {
        let current = '';
        return {
          async goto(url) {
            current = url;
          },
          async content() {
            return renderedHtml(current);
          },
        };
      },
      async close() {},
    };
  },
};
