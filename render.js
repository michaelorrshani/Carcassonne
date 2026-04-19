// Tile + board rendering on HTML canvas, in the visual style of the Carcassonne rulebook.
// Fields: green grass with scattered trees/shrubs.
// Roads: tan path with dark edges.
// Cities: tan ground enclosed by stone wall with small red-roofed houses inside.
// Cloisters: a small chapel with red roof and a cross.
// Shields: small blue/yellow heraldic shields.

const TILE_SIZE = 110;
const PLAYER_COLORS = ['#d62728', '#1f77b4', '#2ca02c', '#f5c518', '#111111'];

// Palette
const C_FIELD = '#a8d56a';
const C_FIELD_DARK = '#6fa83d';
const C_ROAD = '#e4cf9e';
const C_ROAD_EDGE = '#8a6e3a';
const C_CITY_GROUND = '#c69356';
const C_CITY_GROUND_DARK = '#8c5e2e';
const C_STONE = '#b5a79a';
const C_STONE_DARK = '#6b5b4c';
const C_ROOF = '#c94a3b';
const C_ROOF_DARK = '#8e2d22';
const C_WALL = '#efe2c8';
const C_WALL_DARK = '#c2ae87';
const C_TRUNK = '#6a4324';
const C_TREE = '#2e6b2a';
const C_TREE_LIGHT = '#3f8a3a';

// -------- Seeded PRNG --------
// Simple mulberry32 for deterministic per-tile details.
function prng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tileSeed(x, y, id, rotation) {
  // Simple hash of coordinates and tile identity
  let h = 2166136261 >>> 0;
  for (const c of `${x}|${y}|${id}|${rotation}`) {
    h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  }
  return h >>> 0;
}

// -------- Drawing primitives --------

function drawGrassTexture(ctx, rand, S, clipFn) {
  // scatter small darker grass tufts
  ctx.save();
  if (clipFn) clipFn();
  for (let i = 0; i < 34; i++) {
    const x = rand() * S;
    const y = rand() * S;
    ctx.fillStyle = rand() < 0.5 ? C_FIELD_DARK : '#96c85a';
    ctx.fillRect(x, y, 2, 1);
    ctx.fillRect(x + 1, y - 1, 1, 1);
  }
  ctx.restore();
}

function drawTree(ctx, x, y, size) {
  // trunk
  ctx.fillStyle = C_TRUNK;
  ctx.fillRect(x - size * 0.1, y - size * 0.1, size * 0.2, size * 0.45);
  // canopy - two circles
  ctx.fillStyle = C_TREE;
  ctx.beginPath();
  ctx.arc(x - size * 0.25, y - size * 0.25, size * 0.4, 0, Math.PI * 2);
  ctx.arc(x + size * 0.25, y - size * 0.25, size * 0.4, 0, Math.PI * 2);
  ctx.arc(x, y - size * 0.45, size * 0.42, 0, Math.PI * 2);
  ctx.fill();
  // highlight
  ctx.fillStyle = C_TREE_LIGHT;
  ctx.beginPath();
  ctx.arc(x - size * 0.15, y - size * 0.45, size * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1b4a1b';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x - size * 0.25, y - size * 0.25, size * 0.4, 0, Math.PI * 2);
  ctx.arc(x + size * 0.25, y - size * 0.25, size * 0.4, 0, Math.PI * 2);
  ctx.arc(x, y - size * 0.45, size * 0.42, 0, Math.PI * 2);
  ctx.stroke();
}

function drawShrub(ctx, x, y, size) {
  ctx.fillStyle = C_TREE;
  ctx.beginPath();
  ctx.arc(x, y, size * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C_TREE_LIGHT;
  ctx.beginPath();
  ctx.arc(x - size * 0.1, y - size * 0.08, size * 0.15, 0, Math.PI * 2);
  ctx.fill();
}

function drawHouse(ctx, cx, cy, w, h, rand) {
  // body (walls)
  ctx.fillStyle = C_WALL;
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  // shadow side
  ctx.fillStyle = C_WALL_DARK;
  ctx.fillRect(cx + w / 2 - w * 0.25, cy - h / 2, w * 0.25, h);
  // roof (triangle)
  ctx.fillStyle = C_ROOF;
  ctx.beginPath();
  ctx.moveTo(cx - w / 2 - 2, cy - h / 2);
  ctx.lineTo(cx, cy - h / 2 - h * 0.7);
  ctx.lineTo(cx + w / 2 + 2, cy - h / 2);
  ctx.closePath();
  ctx.fill();
  // roof shadow
  ctx.fillStyle = C_ROOF_DARK;
  ctx.beginPath();
  ctx.moveTo(cx, cy - h / 2 - h * 0.7);
  ctx.lineTo(cx + w / 2 + 2, cy - h / 2);
  ctx.lineTo(cx + w / 2 * 0.3, cy - h / 2);
  ctx.closePath();
  ctx.fill();
  // door
  ctx.fillStyle = C_TRUNK;
  ctx.fillRect(cx - w * 0.08, cy - h * 0.1, w * 0.16, h * 0.45);
  // window
  ctx.fillStyle = '#3b4a6a';
  const wx = cx - w * 0.3, wy = cy - h * 0.15;
  ctx.fillRect(wx, wy, w * 0.18, h * 0.2);
  // outline
  ctx.strokeStyle = C_STONE_DARK;
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
  ctx.beginPath();
  ctx.moveTo(cx - w / 2 - 2, cy - h / 2);
  ctx.lineTo(cx, cy - h / 2 - h * 0.7);
  ctx.lineTo(cx + w / 2 + 2, cy - h / 2);
  ctx.stroke();
}

// -------- Field/Road path helpers --------

function sideMidpoint(side) {
  if (side === 0) return [0.5, 0];
  if (side === 1) return [1, 0.5];
  if (side === 2) return [0.5, 1];
  return [0, 0.5];
}

// Build a polygon (in 0..1) representing the city region on the tile for given sides.
function cityRegionPath(ctx, sides, S) {
  ctx.beginPath();
  const depth = 0.36;
  if (sides.length === 4) {
    ctx.rect(0, 0, S, S);
    return;
  }
  for (const side of sides) {
    // rectangle from that edge inward by depth
    if (side === 0) ctx.rect(0, 0, S, S * depth);
    else if (side === 1) ctx.rect(S * (1 - depth), 0, S * depth, S);
    else if (side === 2) ctx.rect(0, S * (1 - depth), S, S * depth);
    else if (side === 3) ctx.rect(0, 0, S * depth, S);
  }
}

// -------- Main tile draw --------

function drawTile(ctx, tile, px, py, S, opts = {}) {
  ctx.save();
  ctx.translate(px, py);

  const seed = tileSeed(opts.x ?? 0, opts.y ?? 0, tile.id, tile.rotation);
  const rand = prng(seed);

  // 1. Field base
  ctx.fillStyle = C_FIELD;
  ctx.fillRect(0, 0, S, S);
  drawGrassTexture(ctx, rand, S);

  const feats = tile.features;
  const cityFeats = feats.filter(f => f.type === 'city');
  const roadFeats = feats.filter(f => f.type === 'road');
  const hasCloister = feats.some(f => f.type === 'cloister');

  // 2. City regions (ground + walls + buildings)
  for (const f of cityFeats) {
    drawCityRegion(ctx, f, S, rand);
  }

  // 3. Roads
  for (const f of roadFeats) {
    drawRoad(ctx, f, S, rand);
  }

  // 4. Trees scattered in field (but not too close to city/road centers)
  drawFieldDecorations(ctx, tile, S, rand);

  // 5. Cloister
  if (hasCloister) drawCloister(ctx, S);

  // 6. Shields on cities
  for (const f of cityFeats) {
    if (f.shield) drawShield(ctx, f, S);
  }

  // 7. Border
  ctx.strokeStyle = '#2d1f11';
  ctx.lineWidth = 2;
  ctx.strokeRect(0.5, 0.5, S - 1, S - 1);

  // 8. Meeples
  if (opts.meeples) {
    for (const m of opts.meeples) {
      drawMeeple(ctx, m.fx * S, m.fy * S, S * 0.11, PLAYER_COLORS[m.playerIdx]);
    }
  }

  ctx.restore();
}

// -------- City --------

function drawCityRegion(ctx, feat, S, rand) {
  const sides = feat.sides.slice().sort();
  ctx.save();
  // Clip to city shape
  ctx.beginPath();
  const depth = 0.36;
  if (sides.length === 4) {
    ctx.rect(0, 0, S, S);
  } else {
    for (const side of sides) {
      if (side === 0) ctx.rect(0, 0, S, S * depth);
      else if (side === 1) ctx.rect(S * (1 - depth), 0, S * depth, S);
      else if (side === 2) ctx.rect(0, S * (1 - depth), S, S * depth);
      else if (side === 3) ctx.rect(0, 0, S * depth, S);
    }
  }
  ctx.save();
  ctx.clip();
  // Ground fill
  ctx.fillStyle = C_CITY_GROUND;
  ctx.fillRect(0, 0, S, S);
  // Texture
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = rand() < 0.5 ? C_CITY_GROUND_DARK : '#b78045';
    const x = rand() * S, y = rand() * S;
    ctx.fillRect(x, y, 2, 1);
  }
  // Buildings inside
  const buildings = chooseBuildings(sides, S, rand);
  for (const b of buildings) {
    drawHouse(ctx, b.x, b.y, b.w, b.h, rand);
  }
  ctx.restore();

  // Wall outline: draw a thick darker border along the inside of the clipped region
  ctx.lineWidth = 3;
  ctx.strokeStyle = C_STONE_DARK;
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = C_STONE;
  ctx.stroke();
  ctx.restore();
}

function chooseBuildings(sides, S, rand) {
  // Pick up to 3 building positions within the city region
  const positions = [];
  const depth = 0.36;
  const candidatePoints = [];
  for (const side of sides) {
    for (let t = 0.25; t <= 0.75; t += 0.25) {
      if (side === 0) candidatePoints.push([t * S, depth * 0.55 * S]);
      else if (side === 1) candidatePoints.push([(1 - depth * 0.55) * S, t * S]);
      else if (side === 2) candidatePoints.push([t * S, (1 - depth * 0.55) * S]);
      else if (side === 3) candidatePoints.push([depth * 0.55 * S, t * S]);
    }
  }
  // center for 4-side cities
  if (sides.length === 4) candidatePoints.push([S / 2, S / 2]);

  // Shuffle and pick
  for (let i = candidatePoints.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [candidatePoints[i], candidatePoints[j]] = [candidatePoints[j], candidatePoints[i]];
  }
  const count = Math.min(candidatePoints.length, sides.length === 4 ? 4 : Math.max(1, sides.length + Math.floor(rand() * 2)));
  for (let i = 0; i < count; i++) {
    const [x, y] = candidatePoints[i];
    const w = S * (0.18 + rand() * 0.06);
    const h = S * (0.14 + rand() * 0.05);
    positions.push({ x, y, w, h });
  }
  return positions;
}

function drawShield(ctx, feat, S) {
  // Find a spot inside the city region
  const sides = feat.sides;
  let cx = S / 2, cy = S / 2;
  if (sides.length === 1) {
    const [mx, my] = sideMidpoint(sides[0]);
    cx = mx * S; cy = my * S;
    // nudge toward center
    cx = (cx + S / 2) / 2;
    cy = (cy + S / 2) / 2;
  } else if (sides.length === 2) {
    // corner/junction
    const [m1x, m1y] = sideMidpoint(sides[0]);
    const [m2x, m2y] = sideMidpoint(sides[1]);
    cx = ((m1x + m2x) / 2 + 0.5) / 2 * S;
    cy = ((m1y + m2y) / 2 + 0.5) / 2 * S;
  }
  const w = S * 0.16;
  ctx.save();
  ctx.translate(cx, cy);
  // Shield shape
  ctx.beginPath();
  ctx.moveTo(-w / 2, -w * 0.5);
  ctx.lineTo(w / 2, -w * 0.5);
  ctx.lineTo(w / 2, w * 0.1);
  ctx.quadraticCurveTo(w / 2, w * 0.6, 0, w * 0.6);
  ctx.quadraticCurveTo(-w / 2, w * 0.6, -w / 2, w * 0.1);
  ctx.closePath();
  ctx.fillStyle = '#f4c02d';
  ctx.fill();
  ctx.strokeStyle = '#3b2a14';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // Blue cross
  ctx.fillStyle = '#1a4fa8';
  ctx.fillRect(-w * 0.08, -w * 0.4, w * 0.16, w * 0.85);
  ctx.fillRect(-w * 0.35, -w * 0.05, w * 0.7, w * 0.18);
  ctx.restore();
}

// -------- Roads --------

function drawRoad(ctx, feat, S, rand) {
  const sides = feat.sides;
  if (sides.length === 0) return;
  const cx = S / 2, cy = S / 2;

  const outerWidth = S * 0.18;
  const innerWidth = S * 0.12;

  ctx.lineCap = 'round';
  const drawPath = (width, color) => {
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.beginPath();
    if (sides.length === 1) {
      const [mx, my] = sideMidpoint(sides[0]);
      ctx.moveTo(mx * S, my * S);
      ctx.lineTo(cx, cy);
    } else if (sides.length === 2) {
      const [mx1, my1] = sideMidpoint(sides[0]);
      const [mx2, my2] = sideMidpoint(sides[1]);
      ctx.moveTo(mx1 * S, my1 * S);
      ctx.quadraticCurveTo(cx, cy, mx2 * S, my2 * S);
    }
    ctx.stroke();
  };
  drawPath(outerWidth, C_ROAD_EDGE);
  drawPath(innerWidth, C_ROAD);

  // Road dashes (only if road goes roughly in a straight line)
  if (sides.length === 2) {
    const dashColor = '#fff';
    ctx.strokeStyle = dashColor;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    const [mx1, my1] = sideMidpoint(sides[0]);
    const [mx2, my2] = sideMidpoint(sides[1]);
    ctx.moveTo(mx1 * S, my1 * S);
    ctx.quadraticCurveTo(cx, cy, mx2 * S, my2 * S);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// -------- Cloister --------

function drawCloister(ctx, S) {
  const cx = S / 2, cy = S / 2 + 4;
  const w = S * 0.32, h = S * 0.28;
  // Walls
  ctx.fillStyle = C_WALL;
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  ctx.fillStyle = C_WALL_DARK;
  ctx.fillRect(cx + w / 2 - w * 0.2, cy - h / 2, w * 0.2, h);
  // Roof
  ctx.fillStyle = C_ROOF;
  ctx.beginPath();
  ctx.moveTo(cx - w / 2 - 3, cy - h / 2);
  ctx.lineTo(cx, cy - h / 2 - h * 0.9);
  ctx.lineTo(cx + w / 2 + 3, cy - h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = C_ROOF_DARK;
  ctx.beginPath();
  ctx.moveTo(cx, cy - h / 2 - h * 0.9);
  ctx.lineTo(cx + w / 2 + 3, cy - h / 2);
  ctx.lineTo(cx + w / 2 * 0.25, cy - h / 2);
  ctx.closePath();
  ctx.fill();
  // Cross on top
  ctx.fillStyle = '#3a2a14';
  ctx.fillRect(cx - 1, cy - h / 2 - h * 1.1, 2, h * 0.25);
  ctx.fillRect(cx - 3, cy - h / 2 - h * 1.0, 6, 2);
  // Door (arched)
  ctx.fillStyle = C_TRUNK;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.12, cy + h * 0.4);
  ctx.lineTo(cx - w * 0.12, cy - h * 0.05);
  ctx.quadraticCurveTo(cx, cy - h * 0.25, cx + w * 0.12, cy - h * 0.05);
  ctx.lineTo(cx + w * 0.12, cy + h * 0.4);
  ctx.closePath();
  ctx.fill();
  // Window
  ctx.fillStyle = '#4a6a9a';
  ctx.fillRect(cx - w * 0.34, cy - h * 0.15, w * 0.14, h * 0.2);
  ctx.fillRect(cx + w * 0.2, cy - h * 0.15, w * 0.14, h * 0.2);
  // Outline
  ctx.strokeStyle = C_STONE_DARK;
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
}

// -------- Field decorations --------

function drawFieldDecorations(ctx, tile, S, rand) {
  // Collect field regions: any feature of type 'field'
  const fieldFeats = tile.features.filter(f => f.type === 'field');
  // For each field feature that touches at least one side, scatter a couple of trees near its area
  for (const f of fieldFeats) {
    if (f.sides.length === 0) continue;
    for (const side of f.sides) {
      const [mx, my] = sideMidpoint(side);
      // Put 1-2 trees near this edge
      const count = 1 + Math.floor(rand() * 2);
      for (let i = 0; i < count; i++) {
        // offset from edge into interior
        let x = mx * S + (rand() - 0.5) * S * 0.32;
        let y = my * S + (rand() - 0.5) * S * 0.32;
        // pull toward interior slightly
        x = x * 0.6 + S / 2 * 0.4;
        y = y * 0.6 + S / 2 * 0.4;
        // avoid road center
        const distC = Math.hypot(x - S / 2, y - S / 2);
        if (distC < S * 0.22) continue;
        if (rand() < 0.65) {
          drawTree(ctx, x, y, S * 0.12);
        } else {
          drawShrub(ctx, x, y, S * 0.1);
        }
      }
    }
  }
}

// -------- Meeple --------

function drawMeeple(ctx, x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, -size * 0.85, size * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
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

// -------- Feature anchor (for meeple placement + rendering) --------

function featureAnchor(feature) {
  if (feature.type === 'cloister') return [0.5, 0.5];
  if (feature.sides.length === 0) return [0.5, 0.75];
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

// Exports
window.TILE_SIZE = TILE_SIZE;
window.PLAYER_COLORS = PLAYER_COLORS;
window.drawTile = drawTile;
window.drawMeeple = drawMeeple;
window.featureAnchor = featureAnchor;
