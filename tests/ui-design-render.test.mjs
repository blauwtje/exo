// Behaviour tests for skills/ui-design/scripts/inspect-render.mjs.
//
// Fixtures are encoded here rather than committed as binaries: the encoder
// below is deliberately written against the PNG specification and not against
// the decoder under test, so a round-trip failure indicts one of the two.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { deflateSync } from 'node:zlib';

import { fixture, run, script } from './harness.mjs';
import {
  compareImages,
  decodePng,
  rasterize,
  renderMetrics,
  srgbToOklab
} from '../skills/designing/scripts/inspect-render.mjs';

const SCRIPT = script('inspect-render.mjs');
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 6: 4 };

// ── PNG encoder (fixtures only) ─────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let byte = 0; byte < 256; byte += 1) {
    let value = byte;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[byte] = value >>> 0;
  }
  return table;
})();

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([head.subarray(4), data])) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 0);
  return Buffer.concat([head, data, tail]);
}

function predict(type, row, previous, index, bytesPerPixel) {
  const left = index >= bytesPerPixel ? row[index - bytesPerPixel] : 0;
  const above = previous[index];
  const upperLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;
  if (type === 1) return left;
  if (type === 2) return above;
  if (type === 3) return (left + above) >> 1;
  if (type === 4) {
    const estimate = left + above - upperLeft;
    const toLeft = Math.abs(estimate - left);
    const toAbove = Math.abs(estimate - above);
    const toUpperLeft = Math.abs(estimate - upperLeft);
    if (toLeft <= toAbove && toLeft <= toUpperLeft) return left;
    return toAbove <= toUpperLeft ? above : upperLeft;
  }
  return 0;
}

function encodePng({ width, height, pixels, colorType = 2, bitDepth = 8, palette = null, transparency = null, interlace = 0, filters = null }) {
  const channels = CHANNELS[colorType] ?? 3;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  const previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.from(pixels.subarray(y * stride, (y + 1) * stride));
    const filter = filters ? filters[y % filters.length] : 0;
    raw[y * (stride + 1)] = filter;
    for (let index = 0; index < stride; index += 1) {
      raw[y * (stride + 1) + 1 + index] = (row[index] - predict(filter, row, previous, index, channels)) & 0xff;
    }
    row.copy(previous);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = bitDepth;
  header[9] = colorType;
  header[12] = interlace;
  const parts = [SIGNATURE, chunk('IHDR', header)];
  if (palette) parts.push(chunk('PLTE', palette));
  if (transparency) parts.push(chunk('tRNS', transparency));
  parts.push(chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

async function pngFixture(name, options) {
  const directory = await fixture();
  const file = path.join(directory, name);
  await fs.writeFile(file, encodePng(options));
  return file;
}

// ── Pixel builders ──────────────────────────────────────────────────────────

function solidPixels(width, height, [red, green, blue]) {
  const pixels = new Uint8Array(width * height * 3);
  for (let index = 0; index < width * height; index += 1) {
    pixels[index * 3] = red;
    pixels[index * 3 + 1] = green;
    pixels[index * 3 + 2] = blue;
  }
  return pixels;
}

/** `bands` is a list of `[rows, [r,g,b]]` or `[rows, 'noise']` stacked top to bottom. */
function bandedPixels(width, bands) {
  const height = bands.reduce((total, [rows]) => total + rows, 0);
  const pixels = new Uint8Array(width * height * 3);
  let y = 0;
  for (const [rows, fill] of bands) {
    for (let row = 0; row < rows; row += 1, y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 3;
        const color = fill === 'noise' ? [(x * 7 + y * 13) % 2 ? 20 : 235, (x + y) % 2 ? 40 : 210, (x * 3) % 2 ? 15 : 240] : fill;
        pixels[index] = color[0];
        pixels[index + 1] = color[1];
        pixels[index + 2] = color[2];
      }
    }
  }
  return { pixels, width, height };
}

const parse = (stdout) => JSON.parse(stdout.trim());

function everyKey(value, found = []) {
  if (Array.isArray(value)) for (const entry of value) everyKey(entry, found);
  else if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      found.push(key);
      everyKey(entry, found);
    }
  }
  return found;
}

// ── Decoding ────────────────────────────────────────────────────────────────

test('decoding', async (t) => {
  await t.test('round-trips truecolour pixels through every scanline filter', () => {
    const width = 9;
    const height = 10;
    const { pixels } = bandedPixels(width, [[height, 'noise']]);
    const bytes = encodePng({ width, height, pixels, filters: [0, 1, 2, 3, 4] });
    const image = decodePng(bytes);
    assert.equal(image.width, width);
    assert.equal(image.height, height);
    const decoded = [];
    image.forEachRow((y, rgba) => {
      for (let x = 0; x < width; x += 1) decoded.push(rgba[x * 4], rgba[x * 4 + 1], rgba[x * 4 + 2]);
    });
    assert.deepEqual(decoded, [...pixels]);
  });

  await t.test('decodes greyscale, palette and truecolour-alpha images alike', () => {
    const grey = decodePng(encodePng({ width: 2, height: 1, colorType: 0, pixels: new Uint8Array([10, 200]) }));
    const greyRow = [];
    grey.forEachRow((_, rgba) => greyRow.push(...rgba.slice(0, 8)));
    assert.deepEqual(greyRow, [10, 10, 10, 255, 200, 200, 200, 255]);

    const indexed = decodePng(encodePng({
      width: 2,
      height: 1,
      colorType: 3,
      palette: Buffer.from([255, 0, 0, 0, 0, 255]),
      transparency: Buffer.from([0, 255]),
      pixels: new Uint8Array([0, 1])
    }));
    const indexedRow = [];
    indexed.forEachRow((_, rgba) => indexedRow.push(...rgba.slice(0, 8)));
    assert.deepEqual(indexedRow, [255, 0, 0, 0, 0, 0, 255, 255]);

    const withAlpha = decodePng(encodePng({ width: 1, height: 1, colorType: 6, pixels: new Uint8Array([9, 8, 7, 128]) }));
    const alphaRow = [];
    withAlpha.forEachRow((_, rgba) => alphaRow.push(...rgba.slice(0, 4)));
    assert.deepEqual(alphaRow, [9, 8, 7, 128]);
  });

  await t.test('composites translucent pixels over white and reports the coverage', () => {
    const raster = rasterize(decodePng(encodePng({
      width: 2,
      height: 1,
      colorType: 6,
      pixels: new Uint8Array([0, 0, 0, 0, 0, 0, 0, 255])
    })));
    assert.equal(raster.alphaCoverage, 0.5);
    assert.equal(Math.round(raster.rgb[0]), 255);
    assert.equal(Math.round(raster.rgb[3]), 0);
  });

  await t.test('rejects the formats it does not claim to support', () => {
    for (const [label, options] of [
      ['16-bit', { bitDepth: 16 }],
      ['interlaced', { interlace: 1 }],
      ['greyscale+alpha', { colorType: 4 }]
    ]) {
      assert.throws(
        () => decodePng(encodePng({ width: 2, height: 2, pixels: solidPixels(2, 2, [1, 2, 3]), ...options })),
        (error) => error.name === 'UnsupportedPngError',
        label
      );
    }
    assert.throws(() => decodePng(Buffer.from('not a png at all')), (error) => error.name === 'UnsupportedPngError');
  });
});

// ── Colour space ────────────────────────────────────────────────────────────

test('srgbToOklab places the achromatic axis where OKLab defines it', () => {
  const white = srgbToOklab(255, 255, 255);
  assert.ok(Math.abs(white.L - 1) < 1e-4, `white L was ${white.L}`);
  assert.ok(Math.hypot(white.a, white.b) < 1e-4);
  const black = srgbToOklab(0, 0, 0);
  assert.ok(Math.abs(black.L) < 1e-9);
  const red = srgbToOklab(255, 0, 0);
  assert.ok(red.a > 0.2, `red should sit far along +a, was ${red.a}`);
});

// ── Metrics ─────────────────────────────────────────────────────────────────

const metricsOf = (width, height, pixels, options) =>
  renderMetrics(rasterize(decodePng(encodePng({ width, height, pixels }))), options);

test('metrics', async (t) => {
  await t.test('reports a flat grey field as chromaless and wholly quiet', () => {
    const report = metricsOf(64, 64, solidPixels(64, 64, [128, 128, 128]));
    assert.ok(report.color.chromaMean < 0.001, `chromaMean ${report.color.chromaMean}`);
    assert.equal(report.color.chromaStd, 0);
    assert.equal(report.color.effectiveHueCount, 0, 'pixels under the chroma floor carry no hue');
    assert.equal(report.color.dominantClusterShare, 1);
    assert.equal(report.spatial.tileChromaVariance, 0);
    assert.deepEqual(report.spatial.quietRegionCandidates, [
      { x: 0, y: 0, width: 64, height: 64, areaShare: 1, meanL: report.spatial.quietRegionCandidates[0].meanL, meanC: report.spatial.quietRegionCandidates[0].meanC, confidence: 'high' }
    ]);
  });

  await t.test('counts one effective hue for a single saturated field', () => {
    const report = metricsOf(64, 64, solidPixels(64, 64, [204, 34, 0]));
    assert.equal(report.color.effectiveHueCount, 1);
    assert.equal(report.color.hueDispersion, 0);
    assert.ok(report.color.colorfulness > 0);
  });

  await t.test('splits a two-colour field evenly across clusters', () => {
    const { pixels, width, height } = bandedPixels(64, [[32, [10, 20, 200]], [32, [240, 200, 20]]]);
    const report = metricsOf(width, height, pixels);
    assert.equal(report.color.dominantClusterShare, 0.5);
    assert.ok(report.color.effectiveHueCount > 1.9, `two hues expected, got ${report.color.effectiveHueCount}`);
  });

  await t.test('finds no quiet candidate in a high-frequency field', () => {
    const { pixels, width, height } = bandedPixels(64, [[64, 'noise']]);
    const report = metricsOf(width, height, pixels);
    assert.deepEqual(report.spatial.quietRegionCandidates, []);
    assert.ok(report.spatial.tileLightnessVariance >= 0);
  });

  await t.test('separates quiet regions split by a busy band and honours the cap', () => {
    const { pixels, width, height } = bandedPixels(96, [[32, [250, 250, 250]], [32, 'noise'], [32, [20, 20, 20]]]);
    const all = metricsOf(width, height, pixels, { tile: 32 });
    assert.equal(all.spatial.quietRegionCandidates.length, 2);
    assert.deepEqual(
      all.spatial.quietRegionCandidates.map((candidate) => [candidate.x, candidate.y, candidate.width, candidate.height]),
      [[0, 0, 96, 32], [0, 64, 96, 32]]
    );
    const capped = metricsOf(width, height, pixels, { tile: 32, maxQuietRegions: 1 });
    assert.equal(capped.spatial.quietRegionCandidates.length, 1);
  });

  await t.test('measures accent area only when an accent is named', () => {
    const pixels = solidPixels(32, 32, [204, 34, 0]);
    assert.equal(metricsOf(32, 32, pixels).color.accentAreaShare, null);
    assert.equal(metricsOf(32, 32, pixels, { accent: { r: 204, g: 34, b: 0 } }).color.accentAreaShare, 1);
    assert.equal(metricsOf(32, 32, pixels, { accent: { r: 0, g: 0, b: 255 } }).color.accentAreaShare, 0);
  });

  await t.test('compares tile grids of identical and divergent images', () => {
    const flat = rasterize(decodePng(encodePng({ width: 64, height: 64, pixels: solidPixels(64, 64, [30, 90, 180]) })));
    const other = rasterize(decodePng(encodePng({ width: 64, height: 64, pixels: solidPixels(64, 64, [230, 190, 40]) })));
    assert.deepEqual(compareImages(flat, flat, { tile: 32 }), { meanTileDeltaE: 0, identicalTileShare: 1 });
    const changed = compareImages(flat, other, { tile: 32 });
    assert.ok(changed.meanTileDeltaE > 0.1, `expected a visible distance, got ${changed.meanTileDeltaE}`);
    assert.equal(changed.identicalTileShare, 0);
  });
});

// ── CLI ─────────────────────────────────────────────────────────────────────

test('command line', async (t) => {
  await t.test('prints the documented schema for a single image', async () => {
    const file = await pngFixture('one.png', { width: 64, height: 64, pixels: solidPixels(64, 64, [200, 40, 60]) });
    const result = await run(SCRIPT, ['--image', file, '--tile', '32', '--accent', '#c8283c']);
    assert.equal(result.code, 0, result.stderr);
    const report = parse(result.stdout);
    assert.equal(report.status, 'ok');
    assert.equal(report.tile, 32);
    assert.deepEqual(Object.keys(report).sort(), ['baselineDelta', 'detection', 'images', 'pairs', 'status', 'tile']);
    assert.deepEqual(report.detection.parameters, { tile: 32, lightnessSigma: 0.02, chromaSigma: 0.01, accentTolerance: 0.05 });
    assert.match(report.detection.limitations, /candidates are diagnostic input, not design faults/);
    assert.equal(report.images.length, 1);
    const image = report.images[0];
    assert.equal(image.path, file);
    assert.deepEqual(Object.keys(image).sort(), ['alphaCoverage', 'color', 'downsampleFactor', 'height', 'path', 'spatial', 'width']);
    assert.deepEqual(Object.keys(image.color).sort(), [
      'accentAreaShare', 'chromaMean', 'chromaP10', 'chromaP50', 'chromaP90', 'chromaStd',
      'colorfulness', 'dominantClusterShare', 'effectiveHueCount', 'hueDispersion',
      'lightnessEntropy', 'lightnessP05', 'lightnessP95'
    ]);
    assert.deepEqual(Object.keys(image.spatial).sort(), ['edgeBandVariance', 'quietRegionCandidates', 'tileChromaVariance', 'tileLightnessVariance']);
    assert.equal(image.width, 64);
    assert.equal(image.downsampleFactor, 1);
    assert.deepEqual(report.pairs, []);
    assert.equal(report.baselineDelta, null);
    assert.match(result.stderr, /^ui-design: /m);
  });

  await t.test('emits no key that could be read as a score', async () => {
    const file = await pngFixture('scored.png', { width: 64, height: 64, pixels: bandedPixels(64, [[32, [10, 20, 200]], [32, 'noise']]).pixels });
    const result = await run(SCRIPT, ['--image', file]);
    assert.equal(result.code, 0, result.stderr);
    const scored = everyKey(parse(result.stdout)).filter((key) => /score/i.test(key));
    assert.deepEqual(scored, []);
  });

  await t.test('pairs every image and deltas the first against the baseline', async () => {
    const flat = await pngFixture('flat.png', { width: 64, height: 64, pixels: solidPixels(64, 64, [245, 245, 245]) });
    const rich = await pngFixture('rich.png', { width: 64, height: 64, pixels: bandedPixels(64, [[32, [10, 20, 200]], [32, 'noise']]).pixels });
    const result = await run(SCRIPT, ['--image', rich, '--image', flat, '--baseline', flat, '--tile', '32']);
    assert.equal(result.code, 0, result.stderr);
    const report = parse(result.stdout);
    assert.equal(report.pairs.length, 1);
    assert.deepEqual([report.pairs[0].a, report.pairs[0].b], [rich, flat]);
    assert.ok(report.pairs[0].meanTileDeltaE > 0);
    assert.deepEqual(Object.keys(report.baselineDelta).sort(), ['chromaStd', 'effectiveHueCount', 'lightnessSpread', 'quietAreaShare', 'tileChromaVariance']);
    assert.ok(report.baselineDelta.chromaStd > 0, 'the richer render should gain chroma spread over the flat baseline');
    assert.ok(report.baselineDelta.quietAreaShare < 0, 'the richer render should lose quiet area');
  });

  await t.test('is byte-identical across runs on the same input', async () => {
    const file = await pngFixture('stable.png', { width: 96, height: 96, pixels: bandedPixels(96, [[48, [12, 90, 160]], [48, 'noise']]).pixels });
    const first = await run(SCRIPT, ['--image', file]);
    const second = await run(SCRIPT, ['--image', file]);
    assert.equal(first.code, 0, first.stderr);
    assert.equal(first.stdout, second.stdout);
  });

  await t.test('downsamples an image past the analysis bound and says by how much', async () => {
    const file = await pngFixture('huge.png', { width: 2100, height: 2100, pixels: solidPixels(2100, 2100, [60, 120, 90]) });
    const result = await run(SCRIPT, ['--image', file]);
    assert.equal(result.code, 0, result.stderr);
    const [image] = parse(result.stdout).images;
    assert.deepEqual([image.width, image.height], [2100, 2100], 'source geometry is reported, not the analysed size');
    assert.ok(image.downsampleFactor >= 2, `expected a downsample, got ${image.downsampleFactor}`);
    assert.deepEqual(
      image.spatial.quietRegionCandidates.map((candidate) => [candidate.width, candidate.height]),
      [[2100, 2100]],
      'quiet-region geometry is scaled back to source coordinates'
    );
  });

  await t.test('reports an unsupported PNG as a tool error, not a usage error', async () => {
    const file = await pngFixture('deep.png', { width: 4, height: 4, bitDepth: 16, pixels: solidPixels(4, 4, [1, 2, 3]) });
    const result = await run(SCRIPT, ['--image', file]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /^ui-design: unsupported PNG '.*deep\.png': bit depth 16/m);
    assert.equal(result.stdout, '');
  });

  await t.test('rejects malformed invocations before reading anything', async () => {
    const file = await pngFixture('ok.png', { width: 8, height: 8, pixels: solidPixels(8, 8, [0, 0, 0]) });
    const invalid = [
      [[], 'no image'],
      [['--image', path.join(path.dirname(file), 'absent.png')], 'missing file'],
      [['--image', file, '--baseline', path.join(path.dirname(file), 'absent.png')], 'missing baseline'],
      [['--image', file, '--tile', '4'], 'tile below the range'],
      [['--image', file, '--tile', '200'], 'tile above the range'],
      [['--image', file, '--tile', 'wide'], 'non-numeric tile'],
      [['--image', file, '--accent', 'red'], 'non-hex accent'],
      [['--image', file, '--max-quiet-regions', '0'], 'zero region cap'],
      [['--image', file, '--depth', '3'], 'unknown flag']
    ];
    for (const [args, label] of invalid) {
      const result = await run(SCRIPT, args);
      assert.equal(result.code, 2, `${label}: ${result.stderr}`);
      assert.match(result.stderr, /^ui-design: /m, label);
    }
  });
});
