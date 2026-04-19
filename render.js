// Tile + board rendering on HTML canvas.
// Procedurally draws tiles based on their features (edges).

const TILE_SIZE = 96; // pixels at zoom 1
const PLAYER_COLORS = ['#d62728', '#1f77b4', '#2ca02c', '#ffdd00', '#111111'];
const COLOR_FIELD = '#a9d47a';
const COLOR_FIELD_DARK = '#8dbd5e';
const COLOR_ROAD = '#d7c28e';
const COLOR_ROAD_EDGE = '#7a5a2b';
const COLOR_CITY = '#b5814b';
const COLOR_CITY_WALL = '#5a3a1a';
const COLOR_CLOISTER = '#d7c28e';

// Draw a single tile (id, rotation) into the given context at (px, py), size S.
function drawTile(ctx, tile, px, py, S, opts = {}) {
  ctx.save();
  ctx.translate(px, py);

  // Background field
  ctx.fillStyle = COLOR_FIELD;
  ctx.fillRect(0, 0, S, S);

  const edges = tile.edges;
  const feats = tile.features;

  // Draw cities first (chunks)
  feats.forEach(f => {
    if (f.type === 'city') drawCity(ctx, f, S);
  });

  // Then roads
  feats.forEach(f => {
    if (f.type === 'road') drawRoad(ctx, f, S);
  });

  // Cloister
  const hasCloister = feats.some(f => f.type === 'cloister');
  if (hasCloister) drawCloister(ctx, S);

  // Shield marker
  const hasShield = feats.some(f => f.shield);
  if (hasShield) drawShield(ctx, S);

  // Tile border
  ctx.strokeStyle = '#3a2a18';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, S, S);

  // Meeples
  if (opts.meeples) {
    for (const m of opts.meeples) {
      drawMeeple(ctx, m.fx * S, m.fy * S, S * 0.11, PLAYER_COLORS[m.playerIdx]);
    }
  }

  ctx.restore();
}

// Each side has a 1/3 central band where roads/cities emerge.
// Side coordinates (unit tile 0..1): N edge y=0, E edge x=1, S edge y=1, W edge x=0.

function sideMidpoint(side) {
  // Returns [x, y] at the center of the side
  if (side === 0) return [0.5, 0];
  if (side === 1) return [1, 0.5];
  if (side === 2) return [0.5, 1];
  if (side === 3) return [0, 0.5];
}

function drawCity(ctx, feat, S) {
  // If feat.sides covers all 4 sides -> full fill
  const sides = feat.sides.slice().sort();
  ctx.fillStyle = COLOR_CITY;
  ctx.strokeStyle = COLOR_CITY_WALL;
  ctx.lineWidth = 2;

  const full = sides.length === 4;
  if (full) {
    // Whole tile is city
    ctx.fillRect(0, 0, S, S);
    ctx.strokeRect(3, 3, S - 6, S - 6);
    return;
  }

  // For each side in the feature, draw a city blob extending from that edge toward center.
  // If the set of sides is adjacent (e.g. N+W), connect them with a curve through that corner.
  ctx.beginPath();
  const cx = S / 2, cy = S / 2;
  const depth = S * 0.38;
  for (const side of sides) {
    // Draw rectangle from that edge inward by `depth`
    if (side === 0) {
      // North band
      ctx.moveTo(0, 0); ctx.lineTo(S, 0); ctx.lineTo(S, depth); ctx.lineTo(0, depth); ctx.closePath();
    } else if (side === 1) {
      ctx.moveTo(S, 0); ctx.lineTo(S, S); ctx.lineTo(S - depth, S); ctx.lineTo(S - depth, 0); ctx.closePath();
    } else if (side === 2) {
      ctx.moveTo(0, S); ctx.lineTo(S, S); ctx.lineTo(S, S - depth); ctx.lineTo(0, S - depth); ctx.closePath();
    } else if (side === 3) {
      ctx.moveTo(0, 0); ctx.lineTo(depth, 0); ctx.lineTo(depth, S); ctx.lineTo(0, S); ctx.closePath();
    }
  }
  ctx.fill();
  ctx.stroke();

  // Add some brick pattern
  ctx.fillStyle = COLOR_CITY_WALL;
  ctx.globalAlpha = 0.2;
  for (const side of sides) {
    const [mx, my] = sideMidpoint(side);
    const x = mx * S, y = my * S;
    for (let i = -1; i <= 1; i++) {
      ctx.fillRect(x - 6 + i * 12, y - 3 + (Math.abs(i) * 6), 8, 3);
    }
  }
  ctx.globalAlpha = 1;
}

function drawRoad(ctx, feat, S) {
  const sides = feat.sides;
  const cx = S / 2, cy = S / 2;
  ctx.strokeStyle = COLOR_ROAD;
  ctx.lineWidth = S * 0.12;
  ctx.lineCap = 'round';
  if (sides.length === 0) return;
  if (sides.length === 1) {
    // Dead-end into center (for T-junctions etc)
    const [mx, my] = sideMidpoint(sides[0]);
    ctx.beginPath();
    ctx.moveTo(mx * S, my * S);
    ctx.lineTo(cx, cy);
    ctx.stroke();
  } else if (sides.length === 2) {
    ctx.beginPath();
    const [mx1, my1] = sideMidpoint(sides[0]);
    const [mx2, my2] = sideMidpoint(sides[1]);
    ctx.moveTo(mx1 * S, my1 * S);
    // Curve through center
    ctx.quadraticCurveTo(cx, cy, mx2 * S, my2 * S);
    ctx.stroke();
  }
  // Road edge
  ctx.strokeStyle = COLOR_ROAD_EDGE;
  ctx.lineWidth = 1;
  // skip edge strokes for simplicity
}

function drawCloister(ctx, S) {
  const cx = S / 2, cy = S / 2;
  // Small chapel: rect + roof
  ctx.fillStyle = '#e4caa0';
  ctx.fillRect(cx - S * 0.14, cy - S * 0.1, S * 0.28, S * 0.22);
  ctx.fillStyle = '#8a4a2a';
  ctx.beginPath();
  ctx.moveTo(cx - S * 0.18, cy - S * 0.1);
  ctx.lineTo(cx, cy - S * 0.25);
  ctx.lineTo(cx + S * 0.18, cy - S * 0.1);
  ctx.closePath();
  ctx.fill();
  // Cross
  ctx.fillStyle = '#333';
  ctx.fillRect(cx - 1, cy - S * 0.23, 2, S * 0.08);
  ctx.fillRect(cx - 3, cy - S * 0.2, 6, 2);
}

function drawShield(ctx, S) {
  const x = S * 0.72, y = S * 0.16;
  ctx.fillStyle = '#1a4fa8';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 14, y);
  ctx.lineTo(x + 14, y + 10);
  ctx.quadraticCurveTo(x + 7, y + 20, x, y + 10);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawMeeple(ctx, x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  // simple meeple shape: head + body
  ctx.beginPath();
  ctx.arc(0, -size * 0.8, size * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-size * 0.9, size * 0.9);
  ctx.lineTo(-size * 0.55, -size * 0.2);
  ctx.lineTo(-size * 0.2, -size * 0.35);
  ctx.lineTo(0, -size * 0.2);
  ctx.lineTo(size * 0.2, -size * 0.35);
  ctx.lineTo(size * 0.55, -size * 0.2);
  ctx.lineTo(size * 0.9, size * 0.9);
  ctx.lineTo(size * 0.35, size * 0.9);
  ctx.lineTo(size * 0.15, size * 0.3);
  ctx.lineTo(-size * 0.15, size * 0.3);
  ctx.lineTo(-size * 0.35, size * 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// Compute the anchor point (in tile-local fractional coords 0..1) for a feature, used for meeple placement + hit-testing.
function featureAnchor(feature) {
  if (feature.type === 'cloister') return [0.5, 0.5];
  if (feature.sides.length === 0) {
    // interior field – use a corner offset based on type
    return [0.5, 0.75];
  }
  // average of side midpoints biased toward center
  let sx = 0, sy = 0;
  for (const s of feature.sides) {
    const [mx, my] = sideMidpoint(s);
    sx += mx; sy += my;
  }
  sx /= feature.sides.length;
  sy /= feature.sides.length;
  // pull toward center for road/city so the dot sits on the feature
  if (feature.type === 'road') {
    return [(sx + 0.5) / 2, (sy + 0.5) / 2];
  }
  if (feature.type === 'city') {
    return [(sx + 0.5) / 2, (sy + 0.5) / 2];
  }
  // field: bias toward its external edge average (already sx,sy) but a touch inward
  return [sx * 0.7 + 0.5 * 0.3, sy * 0.7 + 0.5 * 0.3];
}

window.TILE_SIZE = TILE_SIZE;
window.PLAYER_COLORS = PLAYER_COLORS;
window.drawTile = drawTile;
window.drawMeeple = drawMeeple;
window.featureAnchor = featureAnchor;
