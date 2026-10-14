function publicAssetUrl(value) {
  if (!String(value).startsWith("/assets/")) return value;
  const script = document.querySelector('script[src*="member-badge.js"]');
  return new URL(`.${value}`, script ? script.src : document.baseURI).href;
}

function licenseBadge(member) {
  const license = String(member.license || "").trim().toLowerCase();
  const labels = { sol: "Sol", luna: "Luna", estrella: "Estrella" };
  if (!Object.hasOwn(labels, license)) {
    return '<span class="license-pending" title="Licencia sin datos" aria-label="Licencia sin datos">?</span>';
  }
  return `<img class="license-icon" src="${publicAssetUrl(`/assets/license-${license}.png`)}" alt="${labels[license]}" title="Licencia ${labels[license]}" loading="lazy">`;
}

function memberFogColor(member) {
  return /^#[0-9a-f]{6}$/i.test(member.fogColor || "") ? member.fogColor : "#ffd45c";
}

function perimeterMist(member) {
  if (!member.goldEffect) return "";
  return `<canvas class="solar-mist" data-mist-color="${memberFogColor(member)}" aria-hidden="true"></canvas>`;
}

const mistScenes = new Map();
const mistTextures = new Map();
let mistFrame = 0;
let mistLastDraw = 0;

function cloudTextures(color) {
  if (mistTextures.has(color)) return mistTextures.get(color);
  const rgb = color.slice(1).match(/../g).map((value) => parseInt(value, 16));
  const textures = Array.from({ length: 4 }, (_, variant) => {
    const texture = document.createElement("canvas");
    texture.width = texture.height = 96;
    const context = texture.getContext("2d");
    const pixels = context.createImageData(96, 96);
    const hash = (x, y) => {
      const n = Math.sin(x * 127.1 + y * 311.7 + variant * 74.7) * 43758.5453;
      return n - Math.floor(n);
    };
    const noise = (x, y) => {
      const ix = Math.floor(x), iy = Math.floor(y);
      const fx = x - ix, fy = y - iy;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const top = hash(ix, iy) * (1 - sx) + hash(ix + 1, iy) * sx;
      const bottom = hash(ix, iy + 1) * (1 - sx) + hash(ix + 1, iy + 1) * sx;
      return top * (1 - sy) + bottom * sy;
    };
    // Warped multiscale noise makes ragged wisps instead of round glow particles.
    for (let y = 0; y < 96; y += 1) {
      for (let x = 0; x < 96; x += 1) {
        const nx = x / 96, ny = y / 96;
        const warp = noise(nx * 3, ny * 3) * 1.8;
        const density = noise(nx * 5 + warp, ny * 4) * 0.55
          + noise(nx * 11, ny * 9 + warp) * 0.3 + noise(nx * 23, ny * 19) * 0.15;
        const ridge = (ny - 0.5) + (noise(nx * 4, variant + 2) - 0.5) * 0.42;
        const envelope = Math.pow(Math.sin(Math.PI * nx), 1.2) * Math.exp(-ridge * ridge * 14)
          * Math.pow(Math.sin(Math.PI * ny), 0.7);
        const alpha = Math.max(0, density - 0.29) * 2.1 * envelope;
        const i = (y * 96 + x) * 4;
        pixels.data[i] = rgb[0];
        pixels.data[i + 1] = rgb[1];
        pixels.data[i + 2] = rgb[2];
        pixels.data[i + 3] = Math.min(255, alpha * 255);
      }
    }
    context.putImageData(pixels, 0, 0);
    return texture;
  });
  mistTextures.set(color, textures);
  return textures;
}

function mistPoint(progress, width, height) {
  const inset = 10, radius = 8;
  const horizontal = Math.max(1, width - inset * 2 - radius * 2);
  const vertical = Math.max(1, height - inset * 2 - radius * 2);
  const arc = Math.PI * radius / 2;
  const lengths = [horizontal, arc, vertical, arc, horizontal, arc, vertical, arc];
  let distance = progress * (horizontal * 2 + vertical * 2 + arc * 4);
  let segment = 0;
  while (segment < 7 && distance >= lengths[segment]) distance -= lengths[segment++];
  const right = width - inset, bottom = height - inset;
  if (segment === 0) return { x: inset + radius + distance, y: inset, angle: 0 };
  if (segment === 2) return { x: right, y: inset + radius + distance, angle: Math.PI / 2 };
  if (segment === 4) return { x: right - radius - distance, y: bottom, angle: Math.PI };
  if (segment === 6) return { x: inset, y: bottom - radius - distance, angle: Math.PI * 1.5 };
  const corner = (segment - 1) / 2;
  const angle = -Math.PI / 2 + corner * Math.PI / 2 + distance / radius;
  const cx = corner < 2 ? right - radius : inset + radius;
  const cy = corner === 0 || corner === 3 ? inset + radius : bottom - radius;
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, angle: angle + Math.PI / 2 };
}

function drawMistFrame(timestamp) {
  mistFrame = 0;
  if (timestamp - mistLastDraw >= 1000 / 30) {
    mistLastDraw = timestamp;
    const time = timestamp / 1000;
    for (const [canvas, scene] of mistScenes) {
      if (!canvas.isConnected) {
        scene.resize.disconnect();
        scene.intersection.disconnect();
        mistScenes.delete(canvas);
        continue;
      }
      if (!scene.visible || !scene.width) continue;
      const { context, width, height, dpr, textures } = scene;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      context.save();
      // Keep smoke on the frame, leaving text and adjacent cards unobscured.
      context.beginPath();
      context.rect(0, 0, width, height);
      context.roundRect(25, 25, width - 50, height - 50, 6);
      context.clip("evenodd");
      context.globalCompositeOperation = "lighter";
      for (let i = 0; i < 56; i += 1) {
        const phase = i * 2.39996 + scene.phase;
        const progress = (i / 56 + time / (25 + (i % 4) * 1.5) + scene.phase) % 1;
        const point = mistPoint(progress, width, height);
        const swirl = Math.sin(time * 0.85 + phase);
        const breadth = 26 + Math.sin(time * 0.6 + phase) * 5;
        const length = 48 + (i % 5) * 7;
        const pulse = 0.7 + Math.sin(time * 1.15 + progress * Math.PI * 4) * 0.2;
        context.save();
        context.translate(point.x - Math.sin(point.angle) * swirl * 3, point.y + Math.cos(point.angle) * swirl * 3);
        context.rotate(point.angle + swirl * 0.18);
        context.globalAlpha = pulse * (0.38 + (i % 3) * 0.12);
        context.drawImage(textures[i % 4], -length / 2, -breadth / 2, length, breadth);
        context.restore();
      }
      context.restore();
      context.globalCompositeOperation = "destination-in";
      context.drawImage(scene.edgeMask, 0, 0, width, height);
      context.globalCompositeOperation = "source-over";
    }
  }
  if ([...mistScenes.values()].some((scene) => scene.visible)) mistFrame = requestAnimationFrame(drawMistFrame);
}

function startPerimeterMist(root = document) {
  root.querySelectorAll("canvas.solar-mist").forEach((canvas, index) => {
    if (mistScenes.has(canvas)) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const scene = { context, textures: cloudTextures(canvas.dataset.mistColor), phase: index * 0.17, visible: false };
    scene.resize = new ResizeObserver(([entry]) => {
      scene.width = entry.contentRect.width;
      scene.height = entry.contentRect.height;
      if (scene.width <= 50 || scene.height <= 50) {
        scene.width = 0;
        return;
      }
      scene.dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(scene.width * scene.dpr);
      canvas.height = Math.round(scene.height * scene.dpr);
      scene.edgeMask = document.createElement("canvas");
      scene.edgeMask.width = canvas.width;
      scene.edgeMask.height = canvas.height;
      const mask = scene.edgeMask.getContext("2d");
      mask.scale(scene.dpr, scene.dpr);
      mask.fillStyle = "white";
      mask.fillRect(0, 0, scene.width, scene.height);
      mask.globalCompositeOperation = "destination-in";
      for (const [x, y] of [[scene.width, 0], [0, scene.height]]) {
        const gradient = mask.createLinearGradient(0, 0, x, y);
        const feather = 7 / (x || y);
        gradient.addColorStop(0, "transparent");
        gradient.addColorStop(feather, "white");
        gradient.addColorStop(1 - feather, "white");
        gradient.addColorStop(1, "transparent");
        mask.fillStyle = gradient;
        mask.fillRect(0, 0, scene.width, scene.height);
      }
    });
    scene.intersection = new IntersectionObserver(([entry]) => {
      scene.visible = entry.isIntersecting;
      if (scene.visible && !mistFrame) mistFrame = requestAnimationFrame(drawMistFrame);
    });
    mistScenes.set(canvas, scene);
    scene.resize.observe(canvas);
    scene.intersection.observe(canvas);
  });
}
