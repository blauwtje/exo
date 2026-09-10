// Deterministic render diagnostics for the ui-design skill.
//
// Descriptive colour and spatial evidence over capture PNGs, with no browser
// and no aggregate score: every number here is input the critique reads, never
// a target to optimise. Low-variance areas are reported as candidates with the
// thresholds that produced them; whether one is a fault is a design judgement
// made against the selected direction contract, not here.
//
//   node scripts/inspect-render.mjs --image <png> [--image <png> …]
//                                   [--baseline <png>]
//                                   [--tile <8..128>] [--accent <#rrggbb>]
//                                   [--max-quiet-regions <n>]

import fs from 'node:fs/promises';
import process from 'node:process';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';

import { parseFlags, UsageError } from './capture.mjs';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 6: 4 };

const MAX_ANALYSIS_PIXELS = 4_194_304;
const HUE_BINS = 24;
const LIGHTNESS_BINS = 32;
const CHROMA_FLOOR = 0.02;
const CLUSTER_COUNT = 8;
const CLUSTER_ITERATIONS = 10;
const CLUSTER_SAMPLE_LIMIT = 100_000;
const ACCENT_TOLERANCE = 0.05;
const LIGHTNESS_SIGMA = 0.02;
const CHROMA_SIGMA = 0.01;
const DEFAULT_TILE = 32;
const MIN_TILE = 8;
const MAX_TILE = 128;
const DEFAULT_MAX_QUIET_REGIONS = 5;
const DECIMALS = 6;

const DETECTION_LIMITATIONS =
  'threshold-based low-variance detection; candidates are diagnostic input, not design faults';

export class UnsupportedPngError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsupportedPngError';
  }
}

// ── PNG decoding ────────────────────────────────────────────────────────────

function readChunks(bytes) {
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new UnsupportedPngError('missing PNG signature');
  }
  const chunks = [];
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('latin1', offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > bytes.length) {
      throw new UnsupportedPngError(`chunk '${type}' runs past the end of the file`);
    }
    chunks.push({ type, data: bytes.subarray(start, end) });
    offset = end + 4;
    if (type === 'IEND') break;
  }
  return chunks;
}

function readHeader(chunk) {
  if (!chunk || chunk.data.length < 13) throw new UnsupportedPngError('missing or truncated IHDR chunk');
  const header = {
    width: chunk.data.readUInt32BE(0),
    height: chunk.data.readUInt32BE(4),
    bitDepth: chunk.data[8],
    colorType: chunk.data[9],
    compression: chunk.data[10],
    filter: chunk.data[11],
    interlace: chunk.data[12]
  };
  if (header.width === 0 || header.height === 0) throw new UnsupportedPngError('zero-sized image');
  if (header.bitDepth !== 8) throw new UnsupportedPngError(`bit depth ${header.bitDepth} (only 8 is supported)`);
  if (!(header.colorType in CHANNELS)) {
    throw new UnsupportedPngError(`colour type ${header.colorType} (only 0, 2, 3 and 6 are supported)`);
  }
  if (header.interlace !== 0) throw new UnsupportedPngError('interlaced images are not supported');
  if (header.compression !== 0 || header.filter !== 0) {
    throw new UnsupportedPngError('non-standard compression or filter method');
  }
  return header;
}

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const toLeft = Math.abs(estimate - left);
  const toAbove = Math.abs(estimate - above);
  const toUpperLeft = Math.abs(estimate - upperLeft);
  if (toLeft <= toAbove && toLeft <= toUpperLeft) return left;
  return toAbove <= toUpperLeft ? above : upperLeft;
}

function unfilterRow(filterType, row, previous, bytesPerPixel) {
  switch (filterType) {
    case 0:
      return;
    case 1:
      for (let i = bytesPerPixel; i < row.length; i += 1) row[i] = (row[i] + row[i - bytesPerPixel]) & 0xff;
      return;
    case 2:
      for (let i = 0; i < row.length; i += 1) row[i] = (row[i] + previous[i]) & 0xff;
      return;
    case 3:
      for (let i = 0; i < row.length; i += 1) {
        const left = i >= bytesPerPixel ? row[i - bytesPerPixel] : 0;
        row[i] = (row[i] + ((left + previous[i]) >> 1)) & 0xff;
      }
      return;
    case 4:
      for (let i = 0; i < row.length; i += 1) {
        const left = i >= bytesPerPixel ? row[i - bytesPerPixel] : 0;
        const upperLeft = i >= bytesPerPixel ? previous[i - bytesPerPixel] : 0;
        row[i] = (row[i] + paeth(left, previous[i], upperLeft)) & 0xff;
      }
      return;
    default:
      throw new UnsupportedPngError(`unknown scanline filter ${filterType}`);
  }
}

function expandRow(colorType, palette, transparency, width, source, target) {
  for (let x = 0; x < width; x += 1) {
    const out = x * 4;
    if (colorType === 0) {
      target[out] = source[x];
      target[out + 1] = source[x];
      target[out + 2] = source[x];
      target[out + 3] = 255;
    } else if (colorType === 2) {
      target[out] = source[x * 3];
      target[out + 1] = source[x * 3 + 1];
      target[out + 2] = source[x * 3 + 2];
      target[out + 3] = 255;
    } else if (colorType === 3) {
      const entry = source[x] * 3;
      if (entry + 2 >= palette.length) throw new UnsupportedPngError('palette index outside the PLTE chunk');
      target[out] = palette[entry];
      target[out + 1] = palette[entry + 1];
      target[out + 2] = palette[entry + 2];
      target[out + 3] = transparency && source[x] < transparency.length ? transparency[source[x]] : 255;
    } else {
      target[out] = source[x * 4];
      target[out + 1] = source[x * 4 + 1];
      target[out + 2] = source[x * 4 + 2];
      target[out + 3] = source[x * 4 + 3];
    }
  }
}

/**
 * Decode an 8-bit non-interlaced PNG into a row-wise reader. `forEachRow`
 * unfilters one scanline at a time into a reused RGBA buffer, so no full-size
 * RGBA copy of the image ever exists; the inflated raster is the peak cost.
 */
export function decodePng(bytes) {
  const chunks = readChunks(bytes);
  const header = readHeader(chunks.find((chunk) => chunk.type === 'IHDR'));
  const palette = chunks.find((chunk) => chunk.type === 'PLTE')?.data ?? null;
  const transparency = chunks.find((chunk) => chunk.type === 'tRNS')?.data ?? null;
  if (header.colorType === 3 && !palette) throw new UnsupportedPngError('palette image without a PLTE chunk');

  const compressed = Buffer.concat(chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data));
  if (compressed.length === 0) throw new UnsupportedPngError('no IDAT data');
  let raster;
  try {
    raster = inflateSync(compressed);
  } catch (error) {
    throw new UnsupportedPngError(`corrupt image data (${error.message})`);
  }

  const bytesPerPixel = CHANNELS[header.colorType];
  const stride = header.width * bytesPerPixel;
  if (raster.length < (stride + 1) * header.height) {
    throw new UnsupportedPngError('image data is shorter than the declared geometry');
  }

  return {
    width: header.width,
    height: header.height,
    colorType: header.colorType,
    forEachRow(visit) {
      let current = Buffer.alloc(stride);
      let previous = Buffer.alloc(stride);
      const rgba = new Uint8Array(header.width * 4);
      for (let y = 0; y < header.height; y += 1) {
        const offset = y * (stride + 1);
        raster.copy(current, 0, offset + 1, offset + 1 + stride);
        unfilterRow(raster[offset], current, previous, bytesPerPixel);
        expandRow(header.colorType, palette, transparency, header.width, current, rgba);
        visit(y, rgba);
        // The next row overwrites `current` wholesale, so the two buffers swap
        // roles instead of allocating a fresh copy per scanline.
        const spent = previous;
        previous = current;
        current = spent;
      }
    }
  };
}

// ── Raster and colour space ─────────────────────────────────────────────────

function analysisFactor(width, height) {
  let factor = 1;
  while (Math.ceil(width / factor) * Math.ceil(height / factor) > MAX_ANALYSIS_PIXELS) factor += 1;
  return factor;
}

/**
 * Box-filter a decoded image down to at most MAX_ANALYSIS_PIXELS, compositing
 * translucent pixels over white. Every later metric reads this raster only.
 */
export function rasterize(image) {
  const factor = analysisFactor(image.width, image.height);
  const width = Math.ceil(image.width / factor);
  const height = Math.ceil(image.height / factor);
  const cells = width * height;
  const sums = new Float64Array(cells * 3);
  const counts = new Uint32Array(cells);
  let translucentPixels = 0;

  image.forEachRow((y, rgba) => {
    const rowBase = Math.floor(y / factor) * width;
    for (let x = 0; x < image.width; x += 1) {
      const source = x * 4;
      const alpha = rgba[source + 3];
      if (alpha < 255) translucentPixels += 1;
      const cover = alpha / 255;
      const ground = 255 * (1 - cover);
      const cell = rowBase + Math.floor(x / factor);
      sums[cell * 3] += rgba[source] * cover + ground;
      sums[cell * 3 + 1] += rgba[source + 1] * cover + ground;
      sums[cell * 3 + 2] += rgba[source + 2] * cover + ground;
      counts[cell] += 1;
    }
  });

  const rgb = new Float32Array(cells * 3);
  for (let cell = 0; cell < cells; cell += 1) {
    const divisor = counts[cell] || 1;
    rgb[cell * 3] = sums[cell * 3] / divisor;
    rgb[cell * 3 + 1] = sums[cell * 3 + 1] / divisor;
    rgb[cell * 3 + 2] = sums[cell * 3 + 2] / divisor;
  }

  const raster = {
    width,
    height,
    factor,
    rgb,
    sourceWidth: image.width,
    sourceHeight: image.height,
    alphaCoverage: translucentPixels / (image.width * image.height)
  };
  // Every metric below reads OKLab, so the conversion happens once here rather
  // than once per metric call.
  raster.oklab = toOklab(raster);
  return raster;
}

// The sRGB spec's knee, 0.04045, because these metrics are colorimetric rather than
// WCAG contrast; check-ui.mjs keeps WCAG's 0.03928. No 8-bit channel scales into the
// gap between the two (10/255 = 0.039216, 11/255 = 0.043137), so both agree exactly.
function linearize(channel) {
  const scaled = channel / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function oklabInto(r, g, b, out) {
  const red = linearize(r);
  const green = linearize(g);
  const blue = linearize(b);
  const long = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const medium = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const short = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  out[0] = 0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short;
  out[1] = 1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short;
  out[2] = 0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short;
}

/** Convert one sRGB triple (channels 0..255) to OKLab. */
export function srgbToOklab(r, g, b) {
  const out = new Float64Array(3);
  oklabInto(r, g, b, out);
  return { L: out[0], a: out[1], b: out[2] };
}

function toOklab(raster) {
  const cells = raster.width * raster.height;
  const lightness = new Float32Array(cells);
  const green = new Float32Array(cells);
  const blue = new Float32Array(cells);
  const chroma = new Float32Array(cells);
  const scratch = new Float64Array(3);
  for (let cell = 0; cell < cells; cell += 1) {
    oklabInto(raster.rgb[cell * 3], raster.rgb[cell * 3 + 1], raster.rgb[cell * 3 + 2], scratch);
    lightness[cell] = scratch[0];
    green[cell] = scratch[1];
    blue[cell] = scratch[2];
    chroma[cell] = Math.hypot(scratch[1], scratch[2]);
  }
  return { lightness, green, blue, chroma, cells };
}

// ── Colour metrics ──────────────────────────────────────────────────────────

// Negative zero is a rounding artefact here, never a measurement: it survives
// JSON as `0` but not a strict comparison, so it is normalised away at source.
function round(value) {
  const rounded = Number(value.toFixed(DECIMALS));
  return rounded === 0 ? 0 : rounded;
}

function percentile(sorted, fraction) {
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function meanAndDeviation(values) {
  let total = 0;
  for (let index = 0; index < values.length; index += 1) total += values[index];
  const mean = total / values.length;
  let squared = 0;
  for (let index = 0; index < values.length; index += 1) squared += (values[index] - mean) ** 2;
  return { mean, deviation: Math.sqrt(squared / values.length) };
}

function entropy(weights, total) {
  if (total <= 0) return 0;
  let sum = 0;
  for (const weight of weights) {
    if (weight <= 0) continue;
    const share = weight / total;
    sum -= share * Math.log(share);
  }
  return sum;
}

function lightnessEntropy(lightness) {
  const bins = new Float64Array(LIGHTNESS_BINS);
  for (let index = 0; index < lightness.length; index += 1) {
    const bin = Math.min(LIGHTNESS_BINS - 1, Math.max(0, Math.floor(lightness[index] * LIGHTNESS_BINS)));
    bins[bin] += 1;
  }
  return entropy(bins, lightness.length);
}

function hueStatistics(lab) {
  const bins = new Float64Array(HUE_BINS);
  let weight = 0;
  let cosine = 0;
  let sine = 0;
  for (let cell = 0; cell < lab.cells; cell += 1) {
    const chroma = lab.chroma[cell];
    if (chroma < CHROMA_FLOOR) continue;
    const angle = Math.atan2(lab.blue[cell], lab.green[cell]);
    const normalized = (angle + Math.PI * 2) % (Math.PI * 2);
    bins[Math.min(HUE_BINS - 1, Math.floor((normalized / (Math.PI * 2)) * HUE_BINS))] += chroma;
    weight += chroma;
    cosine += chroma * Math.cos(normalized);
    sine += chroma * Math.sin(normalized);
  }
  if (weight <= 0) return { effectiveHueCount: 0, hueDispersion: 0 };
  return {
    effectiveHueCount: Math.exp(entropy(bins, weight)),
    // The resultant length cannot exceed the total weight; float error can push
    // it a hair past, so the floor keeps dispersion inside [0, 1].
    hueDispersion: Math.max(0, 1 - Math.hypot(cosine, sine) / weight)
  };
}

/**
 * Share of the largest of eight OKLab k-means clusters over a fixed-stride
 * sample. Centroids start at even quantiles of the sample ordered by lightness
 * then chroma, so the result depends on the pixels alone, never on a seed.
 */
function dominantClusterShare(lab) {
  const stride = Math.max(1, Math.ceil(lab.cells / CLUSTER_SAMPLE_LIMIT));
  const sample = [];
  for (let cell = 0; cell < lab.cells; cell += stride) sample.push(cell);
  const clusters = Math.min(CLUSTER_COUNT, sample.length);

  const ordered = [...sample].sort((left, right) =>
    lab.lightness[left] - lab.lightness[right] || lab.chroma[left] - lab.chroma[right] || left - right);
  const centroids = [];
  for (let index = 0; index < clusters; index += 1) {
    const pick = ordered[Math.floor(((index + 0.5) / clusters) * ordered.length)];
    centroids.push([lab.lightness[pick], lab.green[pick], lab.blue[pick]]);
  }

  const counts = new Uint32Array(clusters);
  for (let iteration = 0; iteration < CLUSTER_ITERATIONS; iteration += 1) {
    const sums = new Float64Array(clusters * 3);
    counts.fill(0);
    for (const cell of sample) {
      let best = 0;
      let bestDistance = Infinity;
      for (let index = 0; index < clusters; index += 1) {
        const centroid = centroids[index];
        const distance = (lab.lightness[cell] - centroid[0]) ** 2
          + (lab.green[cell] - centroid[1]) ** 2
          + (lab.blue[cell] - centroid[2]) ** 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      }
      counts[best] += 1;
      sums[best * 3] += lab.lightness[cell];
      sums[best * 3 + 1] += lab.green[cell];
      sums[best * 3 + 2] += lab.blue[cell];
    }
    for (let index = 0; index < clusters; index += 1) {
      if (counts[index] === 0) continue;
      centroids[index] = [
        sums[index * 3] / counts[index],
        sums[index * 3 + 1] / counts[index],
        sums[index * 3 + 2] / counts[index]
      ];
    }
  }
  return Math.max(...counts) / sample.length;
}

/** Hasler–Süsstrunk colourfulness over the sRGB opponent axes. */
function colorfulness(raster) {
  const cells = raster.width * raster.height;
  const redGreen = new Float64Array(cells);
  const yellowBlue = new Float64Array(cells);
  for (let cell = 0; cell < cells; cell += 1) {
    const red = raster.rgb[cell * 3];
    const green = raster.rgb[cell * 3 + 1];
    const blue = raster.rgb[cell * 3 + 2];
    redGreen[cell] = red - green;
    yellowBlue[cell] = 0.5 * (red + green) - blue;
  }
  const first = meanAndDeviation(redGreen);
  const second = meanAndDeviation(yellowBlue);
  return Math.hypot(first.deviation, second.deviation) + 0.3 * Math.hypot(first.mean, second.mean);
}

function accentAreaShare(lab, accent) {
  if (!accent) return null;
  const target = srgbToOklab(accent.r, accent.g, accent.b);
  let matches = 0;
  for (let cell = 0; cell < lab.cells; cell += 1) {
    const distance = Math.hypot(
      lab.lightness[cell] - target.L,
      lab.green[cell] - target.a,
      lab.blue[cell] - target.b
    );
    if (distance <= ACCENT_TOLERANCE) matches += 1;
  }
  return matches / lab.cells;
}

function colorReport(raster, lab, accent) {
  const sortedChroma = Float32Array.from(lab.chroma).sort();
  const sortedLightness = Float32Array.from(lab.lightness).sort();
  const chroma = meanAndDeviation(lab.chroma);
  const hue = hueStatistics(lab);
  return {
    chromaMean: round(chroma.mean),
    chromaStd: round(chroma.deviation),
    chromaP10: round(percentile(sortedChroma, 0.1)),
    chromaP50: round(percentile(sortedChroma, 0.5)),
    chromaP90: round(percentile(sortedChroma, 0.9)),
    lightnessP05: round(percentile(sortedLightness, 0.05)),
    lightnessP95: round(percentile(sortedLightness, 0.95)),
    lightnessEntropy: round(lightnessEntropy(lab.lightness)),
    effectiveHueCount: round(hue.effectiveHueCount),
    hueDispersion: round(hue.hueDispersion),
    dominantClusterShare: round(dominantClusterShare(lab)),
    colorfulness: round(colorfulness(raster)),
    accentAreaShare: accent ? round(accentAreaShare(lab, accent)) : null
  };
}

// ── Spatial metrics ─────────────────────────────────────────────────────────

const TILE_ACCUMULATORS = 6;

function tileGrid(raster, tile) {
  const lab = raster.oklab;
  const columns = Math.ceil(raster.width / tile);
  const rows = Math.ceil(raster.height / tile);
  const size = columns * rows;
  const counts = new Uint32Array(size);
  const sums = new Float64Array(size * TILE_ACCUMULATORS);
  for (let y = 0; y < raster.height; y += 1) {
    const tileRow = Math.floor(y / tile) * columns;
    for (let x = 0; x < raster.width; x += 1) {
      const cell = y * raster.width + x;
      const index = tileRow + Math.floor(x / tile);
      const slot = index * TILE_ACCUMULATORS;
      counts[index] += 1;
      sums[slot] += lab.lightness[cell];
      sums[slot + 1] += lab.lightness[cell] ** 2;
      sums[slot + 2] += lab.chroma[cell];
      sums[slot + 3] += lab.chroma[cell] ** 2;
      sums[slot + 4] += lab.green[cell];
      sums[slot + 5] += lab.blue[cell];
    }
  }
  const meanLightness = new Float64Array(size);
  const meanChroma = new Float64Array(size);
  const meanGreen = new Float64Array(size);
  const meanBlue = new Float64Array(size);
  const deviationLightness = new Float64Array(size);
  const deviationChroma = new Float64Array(size);
  for (let index = 0; index < size; index += 1) {
    const divisor = counts[index] || 1;
    const slot = index * TILE_ACCUMULATORS;
    meanLightness[index] = sums[slot] / divisor;
    meanChroma[index] = sums[slot + 2] / divisor;
    meanGreen[index] = sums[slot + 4] / divisor;
    meanBlue[index] = sums[slot + 5] / divisor;
    deviationLightness[index] = Math.sqrt(Math.max(0, sums[slot + 1] / divisor - meanLightness[index] ** 2));
    deviationChroma[index] = Math.sqrt(Math.max(0, sums[slot + 3] / divisor - meanChroma[index] ** 2));
  }
  return {
    columns,
    rows,
    counts,
    meanLightness,
    meanChroma,
    meanGreen,
    meanBlue,
    deviationLightness,
    deviationChroma
  };
}

function edgeBandVariance(grid) {
  const edges = [];
  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const onEdge = row === 0 || column === 0 || row === grid.rows - 1 || column === grid.columns - 1;
      if (onEdge) edges.push(grid.meanLightness[row * grid.columns + column]);
    }
  }
  return meanAndDeviation(edges).deviation ** 2;
}

function quietGroups(grid) {
  const quiet = new Uint8Array(grid.columns * grid.rows);
  for (let index = 0; index < quiet.length; index += 1) {
    quiet[index] = grid.deviationLightness[index] < LIGHTNESS_SIGMA && grid.deviationChroma[index] < CHROMA_SIGMA ? 1 : 0;
  }
  const seen = new Uint8Array(quiet.length);
  const groups = [];
  for (let start = 0; start < quiet.length; start += 1) {
    if (!quiet[start] || seen[start]) continue;
    const members = [];
    const pending = [start];
    seen[start] = 1;
    while (pending.length > 0) {
      const index = pending.pop();
      members.push(index);
      const row = Math.floor(index / grid.columns);
      const column = index % grid.columns;
      const neighbours = [
        column > 0 ? index - 1 : -1,
        column < grid.columns - 1 ? index + 1 : -1,
        row > 0 ? index - grid.columns : -1,
        row < grid.rows - 1 ? index + grid.columns : -1
      ];
      for (const neighbour of neighbours) {
        if (neighbour >= 0 && quiet[neighbour] && !seen[neighbour]) {
          seen[neighbour] = 1;
          pending.push(neighbour);
        }
      }
    }
    groups.push(members);
  }
  return groups;
}

function quietRegionCandidate(members, grid, raster, tile) {
  let minColumn = Infinity;
  let maxColumn = -Infinity;
  let minRow = Infinity;
  let maxRow = -Infinity;
  let pixels = 0;
  let lightness = 0;
  let chroma = 0;
  let confident = true;
  for (const index of members) {
    const row = Math.floor(index / grid.columns);
    const column = index % grid.columns;
    minColumn = Math.min(minColumn, column);
    maxColumn = Math.max(maxColumn, column);
    minRow = Math.min(minRow, row);
    maxRow = Math.max(maxRow, row);
    pixels += grid.counts[index];
    lightness += grid.meanLightness[index] * grid.counts[index];
    chroma += grid.meanChroma[index] * grid.counts[index];
    if (grid.deviationLightness[index] >= LIGHTNESS_SIGMA / 2 || grid.deviationChroma[index] >= CHROMA_SIGMA / 2) {
      confident = false;
    }
  }
  // Reported in source-image coordinates: the bounding box of the tile group,
  // scaled back through the analysis downsample factor.
  const left = minColumn * tile * raster.factor;
  const top = minRow * tile * raster.factor;
  const right = Math.min(raster.sourceWidth, (maxColumn + 1) * tile * raster.factor);
  const bottom = Math.min(raster.sourceHeight, (maxRow + 1) * tile * raster.factor);
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    areaShare: round(pixels / (raster.width * raster.height)),
    meanL: round(lightness / pixels),
    meanC: round(chroma / pixels),
    confidence: confident ? 'high' : 'potential',
    tilePixels: pixels
  };
}

function spatialReport(raster, tile, maxQuietRegions) {
  const grid = tileGrid(raster, tile);
  const candidates = quietGroups(grid)
    .map((members) => quietRegionCandidate(members, grid, raster, tile))
    .sort((left, right) => right.tilePixels - left.tilePixels || left.y - right.y || left.x - right.x)
    .slice(0, maxQuietRegions)
    .map(({ tilePixels, ...candidate }) => candidate);
  return {
    tileChromaVariance: round(meanAndDeviation(grid.meanChroma).deviation ** 2),
    tileLightnessVariance: round(meanAndDeviation(grid.meanLightness).deviation ** 2),
    edgeBandVariance: round(edgeBandVariance(grid)),
    quietRegionCandidates: candidates
  };
}

// ── Public metric entry points ──────────────────────────────────────────────

/** Full descriptive record for one raster produced by `rasterize`. */
export function renderMetrics(image, { tile = DEFAULT_TILE, accent = null, maxQuietRegions = DEFAULT_MAX_QUIET_REGIONS } = {}) {
  return {
    width: image.sourceWidth,
    height: image.sourceHeight,
    downsampleFactor: image.factor,
    alphaCoverage: round(image.alphaCoverage),
    color: colorReport(image, image.oklab, accent),
    spatial: spatialReport(image, tile, maxQuietRegions)
  };
}

function sampleTile(grid, column, columns, row, rows) {
  const x = Math.min(grid.columns - 1, Math.floor((column / columns) * grid.columns));
  const y = Math.min(grid.rows - 1, Math.floor((row / rows) * grid.rows));
  return y * grid.columns + x;
}

/**
 * Mean OKLab distance between corresponding tile means of two rasters. Grids of
 * different shapes are compared at matching relative positions on the smaller of
 * the two, so the measure stays defined across viewports without pretending the
 * pixels align.
 */
export function compareImages(a, b, { tile = DEFAULT_TILE } = {}) {
  const first = tileGrid(a, tile);
  const second = tileGrid(b, tile);
  const columns = Math.min(first.columns, second.columns);
  const rows = Math.min(first.rows, second.rows);
  let total = 0;
  let identical = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const left = sampleTile(first, column, columns, row, rows);
      const right = sampleTile(second, column, columns, row, rows);
      const distance = Math.hypot(
        first.meanLightness[left] - second.meanLightness[right],
        first.meanGreen[left] - second.meanGreen[right],
        first.meanBlue[left] - second.meanBlue[right]
      );
      total += distance;
      if (distance < 1e-9) identical += 1;
    }
  }
  const compared = columns * rows;
  return {
    meanTileDeltaE: round(compared > 0 ? total / compared : 0),
    identicalTileShare: round(compared > 0 ? identical / compared : 0)
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseTile(raw) {
  if (raw === undefined) return DEFAULT_TILE;
  const tile = Number(raw);
  if (!Number.isInteger(tile) || tile < MIN_TILE || tile > MAX_TILE) {
    throw new UsageError(`--tile must be an integer between ${MIN_TILE} and ${MAX_TILE}`);
  }
  return tile;
}

function parseAccent(raw) {
  if (raw === undefined) return null;
  if (!/^#[0-9a-fA-F]{6}$/.test(raw)) throw new UsageError('--accent must be a #rrggbb hex colour');
  return {
    r: Number.parseInt(raw.slice(1, 3), 16),
    g: Number.parseInt(raw.slice(3, 5), 16),
    b: Number.parseInt(raw.slice(5, 7), 16)
  };
}

function parseMaxQuietRegions(raw) {
  if (raw === undefined) return DEFAULT_MAX_QUIET_REGIONS;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1) throw new UsageError('--max-quiet-regions must be a positive integer');
  return limit;
}

async function loadRaster(file) {
  let bytes;
  try {
    bytes = await fs.readFile(file);
  } catch (error) {
    throw new UsageError(`cannot read image '${file}' (${error.code ?? error.message})`);
  }
  try {
    return rasterize(decodePng(bytes));
  } catch (error) {
    if (error instanceof UnsupportedPngError) throw new UnsupportedPngError(`'${file}': ${error.message}`);
    throw error;
  }
}

function baselineDelta(image, baseline) {
  const quietArea = (record) =>
    record.spatial.quietRegionCandidates.reduce((total, candidate) => total + candidate.areaShare, 0);
  return {
    chromaStd: round(image.color.chromaStd - baseline.color.chromaStd),
    lightnessSpread: round(
      image.color.lightnessP95 - image.color.lightnessP05 - (baseline.color.lightnessP95 - baseline.color.lightnessP05)
    ),
    tileChromaVariance: round(image.spatial.tileChromaVariance - baseline.spatial.tileChromaVariance),
    effectiveHueCount: round(image.color.effectiveHueCount - baseline.color.effectiveHueCount),
    quietAreaShare: round(quietArea(image) - quietArea(baseline))
  };
}

async function main(argv) {
  const flags = parseFlags(argv, {
    image: 'list',
    baseline: 'value',
    tile: 'value',
    accent: 'value',
    'max-quiet-regions': 'value'
  });
  const paths = flags.image ?? [];
  if (paths.length === 0) throw new UsageError('--image is required at least once');
  const tile = parseTile(flags.tile);
  const accent = parseAccent(flags.accent);
  const maxQuietRegions = parseMaxQuietRegions(flags['max-quiet-regions']);

  const rasters = [];
  for (const file of paths) rasters.push(await loadRaster(file));
  const images = rasters.map((raster, index) => ({
    path: paths[index],
    ...renderMetrics(raster, { tile, accent, maxQuietRegions })
  }));

  const pairs = [];
  for (let left = 0; left < rasters.length; left += 1) {
    for (let right = left + 1; right < rasters.length; right += 1) {
      pairs.push({ a: paths[left], b: paths[right], ...compareImages(rasters[left], rasters[right], { tile }) });
    }
  }

  let delta = null;
  if (flags.baseline !== undefined) {
    const baseline = renderMetrics(await loadRaster(flags.baseline), { tile, accent, maxQuietRegions });
    delta = baselineDelta(images[0], baseline);
  }

  process.stderr.write(`ui-design: analysed ${images.length} image(s) at tile ${tile}\n`);
  process.stdout.write(`${JSON.stringify({
    status: 'ok',
    tile,
    detection: {
      parameters: { tile, lightnessSigma: LIGHTNESS_SIGMA, chromaSigma: CHROMA_SIGMA, accentTolerance: accent ? ACCENT_TOLERANCE : null },
      limitations: DETECTION_LIMITATIONS
    },
    images,
    pairs,
    baselineDelta: delta
  })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    if (error instanceof UsageError) {
      process.stderr.write(`ui-design: ${error.message}\n`);
      process.exitCode = 2;
      return;
    }
    if (error instanceof UnsupportedPngError) {
      process.stderr.write(`ui-design: unsupported PNG ${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    process.stderr.write(`ui-design: ${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
