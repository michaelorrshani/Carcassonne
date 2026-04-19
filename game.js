// Main game controller: turn flow, input handling, rendering loop.

const state = {
  mode: 'classic',   // 'classic' | 'fields'
  players: [],       // [{name, score, meeples}]
  current: 0,
  board: null,
  deck: [],
  currentTileId: null,
  currentRotation: 0,
  phase: 'menu',     // 'menu' | 'placeTile' | 'placeMeeple' | 'gameover'
  hover: null,       // {x, y} for tile preview
  canvas: null,
  ctx: null,
  camera: { x: 0, y: 0, zoom: 1 },
  dragging: false,
  dragLast: null,
  lastPlacement: null // {x, y} of last placed tile, for meeple UI
};

// ---------- Menu / setup ----------

function showMenu() {
  document.getElementById('menu').style.display = 'flex';
  document.getElementById('game').style.display = 'none';
}

function startGame(mode, numPlayers) {
  state.mode = mode;
  state.players = [];
  const names = ['אדום', 'כחול', 'ירוק', 'צהוב', 'שחור'];
  for (let i = 0; i < numPlayers; i++) {
    state.players.push({ name: names[i], score: 0, meeples: 7 });
  }
  state.current = 0;
  state.board = new window.Board();
  state.board.placeStart();
  state.deck = window.buildDeck();
  state.phase = 'placeTile';
  state.currentRotation = 0;
  drawNextTile();
  document.getElementById('menu').style.display = 'none';
  document.getElementById('game').style.display = 'flex';
  resizeCanvas();
  // Center camera on start tile
  state.camera.x = state.canvas.width / 2;
  state.camera.y = state.canvas.height / 2;
  updateHud();
  render();
}

function drawNextTile() {
  while (state.deck.length > 0) {
    const id = state.deck.pop();
    if (state.board.canTileFitAnywhere(id)) {
      state.currentTileId = id;
      state.currentRotation = 0;
      return;
    }
    // discard and draw next
  }
  state.currentTileId = null;
  endGame();
}

// ---------- End of game ----------

function endGame() {
  const events = state.board.endGameScore(state.mode === 'fields');
  for (const ev of events) applyScoreEvent(ev);
  state.phase = 'gameover';
  updateHud();
  render();
  showGameOver();
}

function showGameOver() {
  const sorted = [...state.players].map((p, i) => ({ ...p, idx: i })).sort((a, b) => b.score - a.score);
  const lines = sorted.map(p => `${p.name} — ${p.score} נקודות`);
  const winner = sorted[0];
  alert(`המשחק הסתיים!\n\nהמנצח: ${winner.name} עם ${winner.score} נקודות\n\n${lines.join('\n')}`);
}

// ---------- Turn flow ----------

function applyScoreEvent(ev) {
  const pts = ev.points;
  for (const pi of ev.winners) {
    state.players[pi].score += pts;
  }
  // Return meeples to players
  for (const m of ev.returned) {
    state.players[m.playerIdx].meeples++;
  }
}

function afterTilePlacement(x, y) {
  state.lastPlacement = { x, y };
  state.phase = 'placeMeeple';
  updateHud();
  render();
}

function endTurn() {
  // Score completed features after any meeple placement
  if (state.lastPlacement) {
    const events = state.board.scoreCompleted(state.lastPlacement.x, state.lastPlacement.y);
    for (const ev of events) applyScoreEvent(ev);
  }
  state.lastPlacement = null;
  state.current = (state.current + 1) % state.players.length;
  if (state.deck.length === 0) { endGame(); return; }
  drawNextTile();
  state.phase = 'placeTile';
  state.currentRotation = 0;
  updateHud();
  render();
}

function skipMeeple() {
  endTurn();
}

// ---------- Input ----------

function screenToWorld(sx, sy) {
  return {
    x: (sx - state.camera.x) / state.camera.zoom,
    y: (sy - state.camera.y) / state.camera.zoom
  };
}

function worldToCell(wx, wy) {
  return {
    cx: Math.floor(wx / window.TILE_SIZE),
    cy: Math.floor(wy / window.TILE_SIZE)
  };
}

function onMouseMove(e) {
  const rect = state.canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  if (state.dragging) {
    const dx = sx - state.dragLast.x;
    const dy = sy - state.dragLast.y;
    state.camera.x += dx;
    state.camera.y += dy;
    state.dragLast = { x: sx, y: sy };
    render();
    return;
  }
  const w = screenToWorld(sx, sy);
  const { cx, cy } = worldToCell(w.x, w.y);
  state.hover = { x: cx, y: cy };
  render();
}

function onMouseDown(e) {
  if (e.button === 2 || e.shiftKey) {
    state.dragging = true;
    const rect = state.canvas.getBoundingClientRect();
    state.dragLast = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    e.preventDefault();
  }
}

function onMouseUp(e) {
  if (state.dragging) { state.dragging = false; return; }
  const rect = state.canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  if (state.phase === 'placeTile') {
    handleTilePlaceClick(sx, sy);
  } else if (state.phase === 'placeMeeple') {
    handleMeeplePlaceClick(sx, sy);
  }
}

function handleTilePlaceClick(sx, sy) {
  const w = screenToWorld(sx, sy);
  const { cx, cy } = worldToCell(w.x, w.y);
  const tile = window.makeTile(state.currentTileId, state.currentRotation);
  if (state.board.canPlace(cx, cy, tile)) {
    state.board.tiles.set(`${cx},${cy}`, tile);
    state.board.placedTiles.push({ x: cx, y: cy });
    state.board.registerFeatures(cx, cy, tile);
    afterTilePlacement(cx, cy);
  }
}

function handleMeeplePlaceClick(sx, sy) {
  if (state.players[state.current].meeples <= 0) { endTurn(); return; }
  const { x, y } = state.lastPlacement;
  const tile = state.board.tileAt(x, y);
  const w = screenToWorld(sx, sy);
  const S = window.TILE_SIZE;
  const tileX = x * S, tileY = y * S;
  // Find nearest feature anchor within the tile
  let best = -1, bestDist = Infinity;
  tile.features.forEach((f, i) => {
    if (state.mode === 'classic' && f.type === 'field') return; // no field meeples in classic
    const [ax, ay] = window.featureAnchor(f);
    const worldX = tileX + ax * S, worldY = tileY + ay * S;
    const d = Math.hypot(worldX - w.x, worldY - w.y);
    if (d < bestDist && d < S * 0.35) { bestDist = d; best = i; }
  });
  if (best < 0) return;
  if (!state.board.canPlaceMeeple(x, y, best)) {
    return;
  }
  state.board.placeMeeple(x, y, best, state.current);
  state.players[state.current].meeples--;
  endTurn();
}

function rotateTile() {
  if (state.phase !== 'placeTile') return;
  state.currentRotation = (state.currentRotation + 1) % 4;
  render();
}

function onWheel(e) {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  const rect = state.canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const w = screenToWorld(sx, sy);
  state.camera.zoom *= factor;
  state.camera.zoom = Math.max(0.3, Math.min(3, state.camera.zoom));
  // Keep world point under cursor
  state.camera.x = sx - w.x * state.camera.zoom;
  state.camera.y = sy - w.y * state.camera.zoom;
  render();
}

// ---------- Rendering ----------

function resizeCanvas() {
  const c = state.canvas;
  c.width = c.clientWidth;
  c.height = c.clientHeight;
}

function render() {
  if (!state.ctx) return;
  const ctx = state.ctx;
  const c = state.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#2e3640';
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.setTransform(state.camera.zoom, 0, 0, state.camera.zoom, state.camera.x, state.camera.y);

  const S = window.TILE_SIZE;

  // Draw candidate placement highlights
  if (state.phase === 'placeTile' && state.currentTileId) {
    const spots = state.board.candidateSpots();
    const currentTile = window.makeTile(state.currentTileId, state.currentRotation);
    ctx.globalAlpha = 0.25;
    for (const [x, y] of spots) {
      if (state.board.canPlace(x, y, currentTile)) {
        ctx.fillStyle = '#a0e0a0';
      } else {
        ctx.fillStyle = '#f0a0a0';
      }
      ctx.fillRect(x * S, y * S, S, S);
    }
    ctx.globalAlpha = 1;
  }

  // Draw placed tiles
  for (const [k, tile] of state.board.tiles) {
    const [x, y] = k.split(',').map(Number);
    // Collect meeples for this tile
    const meeples = [];
    tile.features.forEach((f, i) => {
      const root = state.board.uf.find(window.fkey(x, y, i));
      const meta = state.board.uf.data.get(root);
      for (const m of meta.meeples) {
        if (m.fkey === window.fkey(x, y, i)) {
          const [ax, ay] = window.featureAnchor(f);
          meeples.push({ fx: ax, fy: ay, playerIdx: m.playerIdx });
        }
      }
    });
    window.drawTile(ctx, tile, x * S, y * S, S, { meeples, x, y });
  }

  // Hover preview
  if (state.phase === 'placeTile' && state.hover && state.currentTileId) {
    const { x, y } = state.hover;
    const tile = window.makeTile(state.currentTileId, state.currentRotation);
    const canPlace = state.board.canPlace(x, y, tile);
    ctx.globalAlpha = canPlace ? 0.8 : 0.4;
    window.drawTile(ctx, tile, x * S, y * S, S, { x, y });
    ctx.globalAlpha = 1;
    if (!canPlace) {
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 3;
      ctx.strokeRect(x * S, y * S, S, S);
    }
  }

  // Meeple placement highlights
  if (state.phase === 'placeMeeple' && state.lastPlacement) {
    const { x, y } = state.lastPlacement;
    const tile = state.board.tileAt(x, y);
    tile.features.forEach((f, i) => {
      if (state.mode === 'classic' && f.type === 'field') return;
      if (!state.board.canPlaceMeeple(x, y, i)) return;
      const [ax, ay] = window.featureAnchor(f);
      const px = x * S + ax * S;
      const py = y * S + ay * S;
      ctx.fillStyle = window.PLAYER_COLORS[state.current];
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(px, py, S * 0.09, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    ctx.strokeStyle = 'yellow';
    ctx.lineWidth = 3;
    ctx.strokeRect(x * S, y * S, S, S);
  }
}

function updateHud() {
  const hud = document.getElementById('hud');
  const modeLabel = state.mode === 'fields' ? 'עם שדות' : 'קלאסי (ללא שדות)';
  const playerList = state.players.map((p, i) => {
    const active = i === state.current ? ' — תור' : '';
    return `<div class="player" style="--c:${window.PLAYER_COLORS[i]}">
      <span class="dot"></span>
      <b>${p.name}</b>${active}<br>
      ${p.score} נק׳ · ${p.meeples} חיילים
    </div>`;
  }).join('');
  const remaining = state.deck.length;
  hud.innerHTML = `
    <h2>קרקסון — ${modeLabel}</h2>
    <div class="players">${playerList}</div>
    <div class="status">
      ${state.phase === 'placeTile' ? 'הנח אריח' : state.phase === 'placeMeeple' ? 'הנח חייל (או דלג)' : 'סיום'}<br>
      נותרו בערימה: ${remaining}
    </div>
  `;
  const next = document.getElementById('nextTile');
  if (state.currentTileId && state.phase === 'placeTile') {
    const ctx = next.getContext('2d');
    ctx.clearRect(0, 0, next.width, next.height);
    const tile = window.makeTile(state.currentTileId, state.currentRotation);
    window.drawTile(ctx, tile, 0, 0, next.width);
    next.style.display = 'block';
  } else {
    next.style.display = 'none';
  }
  document.getElementById('rotateBtn').style.display = state.phase === 'placeTile' ? 'inline-block' : 'none';
  document.getElementById('skipBtn').style.display = state.phase === 'placeMeeple' ? 'inline-block' : 'none';
}

// ---------- Init ----------

function initApp() {
  state.canvas = document.getElementById('boardCanvas');
  state.ctx = state.canvas.getContext('2d');
  window.addEventListener('resize', () => { resizeCanvas(); render(); });
  state.canvas.addEventListener('mousemove', onMouseMove);
  state.canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  state.canvas.addEventListener('wheel', onWheel, { passive: false });
  state.canvas.addEventListener('contextmenu', e => e.preventDefault());

  document.getElementById('rotateBtn').addEventListener('click', rotateTile);
  document.getElementById('skipBtn').addEventListener('click', skipMeeple);
  document.getElementById('menuBtn').addEventListener('click', () => {
    if (confirm('לחזור לתפריט? המשחק הנוכחי יאבד.')) showMenu();
  });

  document.querySelectorAll('.start-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = document.querySelector('input[name="mode"]:checked').value;
      const np = parseInt(document.querySelector('input[name="players"]:checked').value, 10);
      startGame(mode, np);
    });
  });

  window.addEventListener('keydown', e => {
    if (e.key === 'r' || e.key === 'R' || e.key === ' ') rotateTile();
    if (e.key === 'Escape' && state.phase === 'placeMeeple') skipMeeple();
  });
}

window.addEventListener('DOMContentLoaded', initApp);
