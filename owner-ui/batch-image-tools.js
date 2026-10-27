/* Pure RGBA tools for the owner's canvas preview. No DOM, decoding, or uploads. */
(function (root, factory) {
  const tools = factory();
  if (typeof module === 'object' && module.exports) module.exports = tools;
  else root.BatchImageTools = tools;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_SIDE = 2048;

  function validate(image) {
    if (!image || typeof image !== 'object') throw new TypeError('Expected RGBA image data.');
    const { width, height, data } = image;
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > MAX_SIDE || height > MAX_SIDE) {
      throw new RangeError('Image dimensions must be integers between 1 and 2048.');
    }
    const type = Object.prototype.toString.call(data);
    if (!ArrayBuffer.isView(data) || !['[object Uint8ClampedArray]', '[object Uint8Array]'].includes(type)) {
      throw new TypeError('Expected an RGBA Uint8ClampedArray or Uint8Array.');
    }
    if (data.length !== width * height * 4) throw new RangeError('RGBA data length does not match the image dimensions.');
    return image;
  }

  /** Clip the selection to the image, rounding fractional edges outwards.
   * Empty/outside selections throw RangeError. Transparent pixels and RGB are copied verbatim.
   */
  function crop(image, rectangle) {
    const { data, width, height } = validate(image);
    if (!rectangle || typeof rectangle !== 'object') throw new TypeError('Expected a crop rectangle.');
    const { x, y, width: selectedWidth, height: selectedHeight } = rectangle;
    if (![x, y, selectedWidth, selectedHeight, x + selectedWidth, y + selectedHeight].every(Number.isFinite)) {
      throw new TypeError('Crop coordinates and dimensions must be finite numbers.');
    }
    if (selectedWidth <= 0 || selectedHeight <= 0) throw new RangeError('Crop dimensions must be positive.');
    const left = Math.max(0, Math.floor(x)), top = Math.max(0, Math.floor(y));
    const right = Math.min(width, Math.ceil(x + selectedWidth)), bottom = Math.min(height, Math.ceil(y + selectedHeight));
    if (right <= left || bottom <= top) throw new RangeError('The crop does not intersect the image.');
    const resultWidth = right - left, resultHeight = bottom - top;
    const result = new Uint8ClampedArray(resultWidth * resultHeight * 4);
    for (let row = 0; row < resultHeight; row++) {
      const start = ((top + row) * width + left) * 4;
      result.set(data.subarray(start, start + resultWidth * 4), row * resultWidth * 4);
    }
    return { data: result, width: resultWidth, height: resultHeight };
  }

  // Restrict removal to muted navy/blue. Pure black, white/grey, saturated blue
  // and luminous blue/cyan sparks remain barriers even with a high tolerance.
  function mutedBlue(r, g, b) {
    return b >= 40 && b <= 205 && b - r >= 12 && b - g >= 6 && g >= r - 4
      && b - r <= Math.max(96, b * .7) && .2126 * r + .7152 * g + .0722 * b <= 178;
  }

  /** Find a coherent muted-blue cluster in a narrow outer band.
   * Sampling includes each actual edge; white Excel cells, grid lines and alpha
   * don't vote as blue. Nearby quantized bins combine JPEG/noise variations.
   * A small isolated border accent cannot determine the background color.
   */
  function detectBlueBackground(image) {
    const { data, width, height } = validate(image);
    // Transparent padding is already exterior: sample the visible bounding box
    // instead of mistaking that padding for an image with no background.
    let left = 0, top = 0, right = width - 1, bottom = height - 1;
    if ([0, width - 1, (height - 1) * width, width * height - 1].some(index => data[index * 4 + 3] < 32)) {
      left = width; top = height; right = -1; bottom = -1;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] < 32) continue;
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
      if (right < left) return null;
    }
    const sampleWidth = right - left + 1, sampleHeight = bottom - top + 1;
    const band = Math.max(1, Math.min(32, Math.ceil(Math.min(sampleWidth, sampleHeight) * .12)));
    const step = Math.max(1, Math.ceil(Math.max(sampleWidth, sampleHeight) / 256));
    const positions = size => {
      const values = [];
      for (let value = 0; value < size; value += step) values.push(value);
      if (values[values.length - 1] !== size - 1) values.push(size - 1);
      return values;
    };
    const bins = new Map();
    let opaque = 0, blue = 0;
    const xs = positions(sampleWidth), ys = positions(sampleHeight);
    for (const y of ys) {
      for (const x of xs) {
        const sides = (y < band ? 1 : 0) | (x >= sampleWidth - band ? 2 : 0) | (y >= sampleHeight - band ? 4 : 0) | (x < band ? 8 : 0);
        if (!sides) continue;
        const offset = ((top + y) * width + left + x) * 4;
        if (data[offset + 3] < 32) continue;
        opaque++;
        const r = data[offset], g = data[offset + 1], b = data[offset + 2];
        if (!mutedBlue(r, g, b)) continue;
        blue++;
        const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        let bin = bins.get(key);
        if (!bin) { bin = { count: 0, r: 0, g: 0, b: 0, sides: 0 }; bins.set(key, bin); }
        bin.count++; bin.r += r; bin.g += g; bin.b += b; bin.sides |= sides;
      }
    }
    let best = null;
    for (const [key, center] of bins) {
      const qr = key >> 8, qg = (key >> 4) & 15, qb = key & 15;
      const cluster = { count: 0, r: 0, g: 0, b: 0, sides: 0 };
      const cr = center.r / center.count, cg = center.g / center.count, cb = center.b / center.count;
      for (let r = Math.max(0, qr - 1); r <= Math.min(15, qr + 1); r++) {
        for (let g = Math.max(0, qg - 1); g <= Math.min(15, qg + 1); g++) {
          for (let b = Math.max(0, qb - 1); b <= Math.min(15, qb + 1); b++) {
            const neighbor = bins.get((r << 8) | (g << 4) | b);
            if (!neighbor || (neighbor.r / neighbor.count - cr) ** 2 + (neighbor.g / neighbor.count - cg) ** 2 + (neighbor.b / neighbor.count - cb) ** 2 > 28 ** 2) continue;
            cluster.count += neighbor.count; cluster.r += neighbor.r; cluster.g += neighbor.g; cluster.b += neighbor.b; cluster.sides |= neighbor.sides;
          }
        }
      }
      if (!best || cluster.count > best.count) best = cluster;
    }
    if (!best || best.count < Math.max(Math.min(4, opaque), Math.ceil(opaque * .06), Math.ceil(blue * .25))) return null;
    const multipleSides = (best.sides & (best.sides - 1)) !== 0;
    if (!multipleSides && best.count < opaque * .5) return null;
    return [Math.round(best.r / best.count), Math.round(best.g / best.count), Math.round(best.b / best.count)];
  }

  /** Remove only four-connected exterior blue (transparent pixels are passable).
   * White cells and protected foreground colors never bridge two blue regions.
   * Default tolerance is 42 RGB units; finite numeric values clamp to 10..100.
   * The inner 55% of that radius clears fully; the outer band tapers alpha with
   * smoothstep. RGB is retained, existing alpha is never increased or flattened.
   * `removed` counts pixels whose alpha decreased, including softened pixels.
   * No detected blue means a fresh unchanged copy, color:null, removed:0.
   */
  function removeBlueBackground(image, options = {}) {
    const { data, width, height } = validate(image);
    if (!options || typeof options !== 'object') throw new TypeError('Expected background-removal options.');
    const suppliedTolerance = options.tolerance === undefined ? 42 : options.tolerance;
    if (!Number.isFinite(suppliedTolerance)) throw new TypeError('Tolerance must be a finite number.');
    const tolerance = Math.max(10, Math.min(100, suppliedTolerance));
    let color;
    if (options.color !== undefined) {
      if (!Array.isArray(options.color) || options.color.length !== 3 || !options.color.every(value => Number.isInteger(value) && value >= 0 && value <= 255)) {
        throw new TypeError('Background color must contain three integer RGB channels from 0 to 255.');
      }
      color = options.color.slice();
    } else color = detectBlueBackground(image);
    const result = new Uint8ClampedArray(data);
    let removed = 0;
    if (!color) return { data: result, width, height, color: null, removed };
    const count = width * height, seen = new Uint8Array(count), queue = new Uint32Array(count);
    const radiusSquared = tolerance * tolerance, coreSquared = (tolerance * .55) ** 2;
    let head = 0, tail = 0;
    function visit(index) {
      if (seen[index]) return;
      seen[index] = 1;
      const offset = index * 4;
      if (data[offset + 3] !== 0) {
        const r = data[offset], g = data[offset + 1], b = data[offset + 2];
        if (!mutedBlue(r, g, b)) return;
        // A dim blue/cyan halo may still be below the absolute spark thresholds.
        // Protect a coherent green+blue lift above the sampled background rather
        // than letting a large user tolerance erase that foreground glow.
        if (g - color[1] >= 12 && b - color[2] >= 22
          && (b - r > color[2] - color[0] + 8 || .2126 * (r - color[0]) + .7152 * (g - color[1]) + .0722 * (b - color[2]) >= 18)) return;
        const distanceSquared = (r - color[0]) ** 2 + (g - color[1]) ** 2 + (b - color[2]) ** 2;
        if (distanceSquared > radiusSquared) return;
        const edge = Math.max(0, (distanceSquared - coreSquared) / (radiusSquared - coreSquared));
        const alpha = Math.round(data[offset + 3] * edge * edge * (3 - 2 * edge));
        if (alpha < data[offset + 3]) { result[offset + 3] = alpha; removed++; }
      }
      queue[tail++] = index;
    }
    for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
    for (let y = 1; y < height - 1; y++) { visit(y * width); visit(y * width + width - 1); }
    while (head < tail) {
      const index = queue[head++], x = index % width;
      if (x) visit(index - 1);
      if (x + 1 < width) visit(index + 1);
      if (index >= width) visit(index - width);
      if (index + width < count) visit(index + width);
    }
    return { data: result, width, height, color, removed };
  }

  return Object.freeze({ crop, detectBlueBackground, removeBlueBackground });
});
