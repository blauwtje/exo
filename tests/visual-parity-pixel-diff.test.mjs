// Behavioral tests for the visual-parity pixel-diff.mjs comparison script.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { describe, it } from 'node:test';
import { fixture, run } from './harness.mjs';

const PIXEL_DIFF = fileURLToPath(new URL('../skills/visual-parity/scripts/pixel-diff.mjs', import.meta.url));

const CRC_TABLE = Array.from({ length: 256 }, (_, byte) => {
  let value = byte;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

/** An 8-bit RGBA PNG filled with `fill`, with each [x, y, rgba] in `paints` overwritten. */
function encodePng(width, height, fill, paints = []) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const stride = width * 4 + 1;
  const raster = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) raster.set(fill, y * stride + 1 + x * 4);
  }
  for (const [x, y, rgba] of paints) raster.set(rgba, y * stride + 1 + x * 4);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raster)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

async function writePngs(files) {
  const directory = await fixture();
  const written = {};
  for (const [name, bytes] of Object.entries(files)) {
    written[name] = path.join(directory, `${name}.png`);
    await fs.writeFile(written[name], bytes);
  }
  return written;
}

const WHITE = [255, 255, 255, 255];

describe('pixel-diff', () => {
  it('passes identical images with exit 0 and a zero count', async () => {
    const files = await writePngs({ baseline: encodePng(4, 3, WHITE), candidate: encodePng(4, 3, WHITE) });
    const result = await run(PIXEL_DIFF, ['--baseline', files.baseline, '--candidate', files.candidate]);
    assert.equal(result.code, 0);
    assert.equal(result.stdout.trim(), `PASS ${files.candidate} differing=0 of 12`);
  });

  it('fails a single channel off by one and boxes the differing pixels', async () => {
    const files = await writePngs({
      baseline: encodePng(5, 5, WHITE),
      candidate: encodePng(5, 5, WHITE, [[1, 2, [254, 255, 255, 255]], [3, 4, [255, 255, 255, 254]]])
    });
    const result = await run(PIXEL_DIFF, ['--baseline', files.baseline, '--candidate', files.candidate]);
    assert.equal(result.code, 1);
    assert.equal(result.stdout.trim(), `FAIL ${files.candidate} differing=2 of 25 box=1,2 3x3`);
  });

  it('fails a size mismatch instead of cropping', async () => {
    const files = await writePngs({ baseline: encodePng(4, 4, WHITE), candidate: encodePng(4, 5, WHITE) });
    const result = await run(PIXEL_DIFF, ['--baseline', files.baseline, '--candidate', files.candidate]);
    assert.equal(result.code, 1);
    assert.equal(result.stdout.trim(), `FAIL ${files.candidate} size 4x5 against baseline 4x4`);
  });

  it('reports every pair and fails the run when one pair fails', async () => {
    const files = await writePngs({
      same: encodePng(2, 2, WHITE),
      sameCopy: encodePng(2, 2, WHITE),
      changed: encodePng(2, 2, WHITE, [[0, 0, [0, 0, 0, 255]]])
    });
    const result = await run(PIXEL_DIFF, [
      '--baseline', files.same, '--candidate', files.sameCopy,
      '--baseline', files.same, '--candidate', files.changed
    ]);
    assert.equal(result.code, 1);
    assert.deepEqual(result.stdout.trim().split('\n').map((line) => line.split(' ')[0]), ['PASS', 'FAIL']);
  });

  it('decodes a Sub-filtered RGB image as the opaque RGBA image it encodes', async () => {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(2, 0);
    header.writeUInt32BE(1, 4);
    header[8] = 8;
    header[9] = 2;
    const subFilteredRow = Buffer.from([1, 10, 20, 30, 5, 5, 5]);
    const rgb = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(subFilteredRow)),
      chunk('IEND', Buffer.alloc(0))
    ]);
    const files = await writePngs({
      baseline: encodePng(2, 1, [10, 20, 30, 255], [[1, 0, [15, 25, 35, 255]]]),
      candidate: rgb
    });
    const result = await run(PIXEL_DIFF, ['--baseline', files.baseline, '--candidate', files.candidate]);
    assert.equal(result.code, 0, result.stdout + result.stderr);
  });

  it('exits 2 on unpaired flags and on a file that is not a PNG', async () => {
    const files = await writePngs({ baseline: encodePng(2, 2, WHITE), broken: Buffer.from('not a png') });
    const unpaired = await run(PIXEL_DIFF, ['--baseline', files.baseline]);
    assert.equal(unpaired.code, 2);
    assert.match(unpaired.stderr, /one --candidate per --baseline/);
    const broken = await run(PIXEL_DIFF, ['--baseline', files.baseline, '--candidate', files.broken]);
    assert.equal(broken.code, 2);
    assert.match(broken.stderr, /pixel-diff: /);
  });
});
