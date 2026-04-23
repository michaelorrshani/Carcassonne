// Tile + board rendering. Uses PNG tile images drawn with rotation; procedural meeple overlay.

const TILE_SIZE = 110;
const PLAYER_COLORS = ['#d62728', '#1f77b4', '#2ca02c', '#f5c518', '#111111'];

// --- Preload tile images ---
const TILE_IMAGES = {};
let TILE_IMAGES_READY = false;

function preloadTileImages(onReady) {
  const ids = Object.keys(window.TILE_TYPES);
  let remaining = ids.length;
  const done = () => {
    if (--remaining === 0) { TILE_IMAGES_READY = true; onReady && onReady(); }
  };
  const data = window.TILE_IMAGE_DATA || {};
  for (const id of ids) {
    const img = new Image();
    img.onload = done;
    img.onerror = () => { console.error('Failed to load tile', id); done(); };
    img.src = data[id] || `assets/tiles/${id}.png`;
    TILE_IMAGES[id] = img;
  }
}

// --- Main tile draw ---

function drawTile(ctx, tile, px, py, S, opts = {}) {
  const img = TILE_IMAGES[tile.id];
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.save();
    ctx.translate(px + S / 2, py + S / 2);
    ctx.rotate((tile.rotation || 0) * Math.PI / 2);
    ctx.drawImage(img, -S / 2, -S / 2, S, S);
    ctx.restore();
  } else {
    // Fallback placeholder
    ctx.fillStyle = '#a8d56a';
    ctx.fillRect(px, py, S, S);
    ctx.strokeStyle = '#2d1f11';
    ctx.strokeRect(px + 0.5, py + 0.5, S - 1, S - 1);
  }

  // Meeples on top (positions are already expressed in the rotated-tile frame)
  if (opts.meeples) {
    for (const m of opts.meeples) {
      drawMeeple(ctx, px + m.fx * S, py + m.fy * S, S * 0.11, PLAYER_COLORS[m.playerIdx]);
    }
  }
}

// --- Feature anchor (for meeple placement) ---

function sideMidpoint(side) {
  if (side === 0) return [0.5, 0];
  if (side === 1) return [1, 0.5];
  if (side === 2) return [0.5, 1];
  return [0, 0.5];
}

function featureAnchor(feature) {
  if (feature.type === 'cloister') return [0.5, 0.5];
  if (feature.sides.length === 0) return [0.5, 0.6];
  let sx = 0, sy = 0;
  for (const s of feature.sides) {
    const [mx, my] = sideMidpoint(s);
    sx += mx; sy += my;
  }
  sx /= feature.sides.length;
  sy /= feature.sides.length;
  if (feature.type === 'road' || feature.type === 'city') {
    return [(sx + 0.5) / 2, (sy + 0.5) / 2];
  }
  return [sx * 0.75 + 0.5 * 0.25, sy * 0.75 + 0.5 * 0.25];
}

// --- Meeple (procedural, overlaid on top of tile images) ---

function drawMeeple(ctx, x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.4;
  // soft shadow
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, size * 1.05, size * 1.1, size * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // head
  ctx.beginPath();
  ctx.arc(0, -size * 0.85, size * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // body
  ctx.beginPath();
  ctx.moveTo(-size * 0.95, size * 0.9);
  ctx.lineTo(-size * 0.55, -size * 0.2);
  ctx.lineTo(-size * 0.22, -size * 0.38);
  ctx.lineTo(0, -size * 0.22);
  ctx.lineTo(size * 0.22, -size * 0.38);
  ctx.lineTo(size * 0.55, -size * 0.2);
  ctx.lineTo(size * 0.95, size * 0.9);
  ctx.lineTo(size * 0.4, size * 0.9);
  ctx.lineTo(size * 0.15, size * 0.3);
  ctx.lineTo(-size * 0.15, size * 0.3);
  ctx.lineTo(-size * 0.4, size * 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// Exports
window.TILE_SIZE = TILE_SIZE;
window.PLAYER_COLORS = PLAYER_COLORS;
window.drawTile = drawTile;
window.drawMeeple = drawMeeple;
window.featureAnchor = featureAnchor;
window.preloadTileImages = preloadTileImages;
