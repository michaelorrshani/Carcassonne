// Main game controller: turn flow, input handling, rendering loop.

const state = {
  mode: 'classic',   // 'classic' | 'fields' | 'dragon'
  players: [],
  current: 0,
  board: null,
  deck: [],
  currentTileId: null,
  currentRotation: 0,
  phase: 'menu',     // 'menu' | 'placeTile' | 'placeMeeple' | 'dragonMove' | 'gameover'
  hover: null,
  canvas: null,
  ctx: null,
  camera: { x: 0, y: 0, zoom: 1 },
  dragging: false,
  dragLast: null,
  lastPlacement: null,
  // Dragon
  dragonTiles: new Set(),  // tile IDs flagged as dragon (for current game)
  dragonDrawIndexes: new Set(), // indices in the deck that are dragon tiles
  currentIsDragon: false,
  dragonPos: null,         // {x, y} when active
  dragonMovesLeft: 0,
  dragonVisited: null,     // Set of "x,y" visited this move chain
  dragonEatenCount: 0,     // meeples eaten during the current dragon chain
  eatenFx: [],             // [{x,y,ax,ay,playerIdx,start,dur}] active eat animations
  scoreFx: [],             // [{x,y,pts,color,start,dur}] floating score popups
  flashFx: [],             // [{tiles:[[x,y]],color,start,dur}] completed-feature flashes
  lastPlacedAt: 0,         // performance.now() of last tile placement, for gold-fade highlight
  initialDeckSize: 0,      // for progress bar
  _fxRaf: 0
};

function fieldsEnabled() { return state.mode === 'fields'; }
function dragonEnabled() { return state.mode === 'dragon'; }

// ---------- Menu / setup ----------

function showMenu() {
  document.getElementById('menu').style.display = 'flex';
  document.getElementById('game').style.display = 'none';
  closeAllModals();
}

function startGame(mode, numPlayers, deckSize, customNames) {
  state.mode = mode;
  state.players = [];
  const defaults = ['אדום', 'כחול', 'ירוק', 'צהוב', 'שחור'];
  for (let i = 0; i < numPlayers; i++) {
    const n = (customNames && customNames[i] && customNames[i].trim()) || defaults[i];
    state.players.push({ name: n, score: 0, meeples: 7, tilesPlaced: 0 });
  }
  state.current = 0;
  state.board = new window.Board();
  state.board.placeStart();
  state.deck = window.buildDeck();
  if (Number.isFinite(deckSize) && deckSize > 0 && deckSize < state.deck.length) {
    state.deck = state.deck.slice(0, deckSize);
  }
  state.initialDeckSize = state.deck.length;
  state.scoreFx = [];
  state.flashFx = [];
  state.lastPlacedAt = 0;
  state.phase = 'placeTile';
  state.currentRotation = 0;
  state.dragonPos = null;
  state.dragonMovesLeft = 0;
  state.dragonVisited = null;
  state.currentIsDragon = false;
  state.dragonEatenCount = 0;
  state.eatenFx = [];
  if (dragonEnabled()) {
    const n = Math.min(14, Math.max(1, Math.ceil(state.deck.length * 0.3)));
    state.dragonDrawIndexes = new Set();
    const cap = Math.min(n, Math.max(1, state.deck.length - 1));
    while (state.dragonDrawIndexes.size < cap) {
      state.dragonDrawIndexes.add(Math.floor(Math.random() * state.deck.length));
    }
  } else {
    state.dragonDrawIndexes = new Set();
  }
  drawNextTile();
  document.getElementById('menu').style.display = 'none';
  document.getElementById('game').style.display = 'flex';
  resizeCanvas();
  state.camera.x = state.canvas.width / 2;
  state.camera.y = state.canvas.height / 2;
  updateHud();
  render();
}

function drawNextTile() {
  while (state.deck.length > 0) {
    const drawIdx = state.deck.length - 1;
    const id = state.deck.pop();
    if (state.board.canTileFitAnywhere(id)) {
      state.currentTileId = id;
      state.currentRotation = 0;
      state.currentIsDragon = state.dragonDrawIndexes.has(drawIdx);
      return;
    }
    // discard and draw next
  }
  state.currentTileId = null;
  state.currentIsDragon = false;
  // Natural deck-empty: offer to extend or end
  openExtendDeckModal();
}

// ---------- Deck extension ----------

function openExtendDeckModal() {
  document.getElementById('extendCount').value = '0';
  document.getElementById('extendModal').classList.add('open');
}

function confirmExtendDeck() {
  const n = Math.max(0, parseInt(document.getElementById('extendCount').value, 10) || 0);
  document.getElementById('extendModal').classList.remove('open');
  if (n === 0) {
    endGame();
    return;
  }
  // Add N tiles by cloning from existing TILE_TYPES (weighted by count)
  const pool = [];
  for (const [id, t] of Object.entries(window.TILE_TYPES)) {
    for (let i = 0; i < t.count; i++) pool.push(id);
  }
  for (let i = 0; i < n; i++) {
    state.deck.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  // Shuffle
  for (let i = state.deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.deck[i], state.deck[j]] = [state.deck[j], state.deck[i]];
  }
  if (dragonEnabled()) {
    const extraDragons = Math.min(Math.ceil(n * 0.3), Math.max(0, n - 1));
    for (let i = 0; i < extraDragons; i++) {
      state.dragonDrawIndexes.add(Math.floor(Math.random() * state.deck.length));
    }
  }
  drawNextTile();
  if (state.currentTileId) {
    state.phase = 'placeTile';
    state.currentRotation = 0;
  }
  updateHud();
  render();
}

// ---------- End of game ----------

function endGame() {
  const events = state.board.endGameScore(fieldsEnabled());
  for (const ev of events) applyScoreEvent(ev);
  state.phase = 'gameover';
  updateHud();
  render();
  showGameOver();
}

function showGameOver() {
  const sorted = [...state.players].map((p, i) => ({ ...p, idx: i })).sort((a, b) => b.score - a.score);
  const winner = sorted[0];
  const title = document.getElementById('endTitle');
  title.textContent = `🏆 המנצח: ${winner.name} — ${winner.score} נקודות`;
  const scoresDiv = document.getElementById('endScores');
  // Per-player feature stats from the union-find
  const perPlayer = state.players.map(() => ({ cities: 0, roads: 0, cloisters: 0, fields: 0, shields: 0 }));
  const seenRoots = new Set();
  const groups = state.board.uf.all();
  for (const [root] of groups) {
    if (seenRoots.has(root)) continue;
    seenRoots.add(root);
    const meta = state.board.uf.data.get(root);
    if (!meta.meeples.length) continue;
    const counts = {};
    for (const m of meta.meeples) counts[m.playerIdx] = (counts[m.playerIdx] || 0) + 1;
    const maxC = Math.max(...Object.values(counts));
    const winners = Object.keys(counts).filter(k => counts[k] === maxC).map(Number);
    for (const pi of winners) {
      if (meta.type === 'city') { perPlayer[pi].cities++; perPlayer[pi].shields += meta.shield; }
      else if (meta.type === 'road') perPlayer[pi].roads++;
      else if (meta.type === 'cloister') perPlayer[pi].cloisters++;
      else if (meta.type === 'field') perPlayer[pi].fields++;
    }
  }
  scoresDiv.innerHTML = sorted.map(p => {
    const stats = perPlayer[p.idx];
    const breakdownParts = [];
    if (stats.cities) breakdownParts.push(`<span>ערים: ${stats.cities}</span>`);
    if (stats.shields) breakdownParts.push(`<span>מגנים: ${stats.shields}</span>`);
    if (stats.roads) breakdownParts.push(`<span>דרכים: ${stats.roads}</span>`);
    if (stats.cloisters) breakdownParts.push(`<span>מנזרים: ${stats.cloisters}</span>`);
    if (stats.fields && fieldsEnabled()) breakdownParts.push(`<span>שדות: ${stats.fields}</span>`);
    if (p.tilesPlaced) breakdownParts.push(`<span>אריחים שהונחו: ${p.tilesPlaced}</span>`);
    return `<div class="end-row ${p.idx === winner.idx ? 'winner' : ''}" style="--c:${window.PLAYER_COLORS[p.idx]}">
      <span class="total">${p.score}</span>
      <div class="name">${escapeHtml(p.name)}</div>
      <div class="breakdown">${breakdownParts.join('') || '<span>-</span>'}</div>
    </div>`;
  }).join('');
  document.getElementById('endModal').classList.add('open');
}

function closeAllModals() {
  document.getElementById('endModal').classList.remove('open');
  document.getElementById('extendModal').classList.remove('open');
  document.getElementById('confirmEndModal').classList.remove('open');
}

// ---------- Turn flow ----------

function applyScoreEvent(ev) {
  const pts = ev.points;
  for (const pi of ev.winners) {
    state.players[pi].score += pts;
  }
  for (const m of ev.returned) {
    state.players[m.playerIdx].meeples++;
  }
  queueScoreFx(ev);
}

function queueScoreFx(ev) {
  if (!ev.featRoot) return;
  const meta = state.board.uf.data.get(ev.featRoot);
  if (!meta) return;
  const tiles = [...meta.tiles].map(k => k.split(',').map(Number));
  if (!tiles.length) return;
  const color = ev.winners && ev.winners.length ? window.PLAYER_COLORS[ev.winners[0]] : '#d7c28e';
  const now = performance.now();
  state.flashFx.push({ tiles, color, start: now, dur: 1000 });
  // Popup at the centroid of the feature's tiles
  let sx = 0, sy = 0;
  for (const [tx, ty] of tiles) { sx += tx; sy += ty; }
  const cx = sx / tiles.length, cy = sy / tiles.length;
  if (ev.points > 0) {
    state.scoreFx.push({ cx, cy, pts: ev.points, color, start: now, dur: 1800 });
  }
  scheduleFxTick();
}

function afterTilePlacement(x, y) {
  state.lastPlacement = { x, y };
  state.lastPlacedAt = performance.now();
  state.players[state.current].tilesPlaced++;
  scheduleFxTick();
  state.phase = 'placeMeeple';
  updateHud();
  render();
}

function endTurn() {
  // Score completed features now (after optional meeple placement)
  if (state.lastPlacement) {
    const events = state.board.scoreCompleted(state.lastPlacement.x, state.lastPlacement.y);
    for (const ev of events) applyScoreEvent(ev);
  }
  if (dragonEnabled() && state.currentIsDragon && state.phase !== 'dragonMove') {
    startDragonMove();
    return;
  }
  state.lastPlacement = null;
  state.current = (state.current + 1) % state.players.length;
  if (state.deck.length === 0) {
    openExtendDeckModal();
    return;
  }
  drawNextTile();
  if (state.currentTileId) {
    state.phase = 'placeTile';
    state.currentRotation = 0;
  }
  updateHud();
  render();
}

function skipMeeple() {
  endTurn();
}

// ---------- Dragon ----------

function startDragonMove() {
  state.phase = 'dragonMove';
  state.dragonMovesLeft = 3;
  state.dragonVisited = new Set();
  state.dragonPos = { x: state.lastPlacement.x, y: state.lastPlacement.y };
  state.dragonVisited.add(`${state.dragonPos.x},${state.dragonPos.y}`);
  state.dragonEatenCount = 0;
  updateHud();
  render();
}

function handleDragonMoveClick(sx, sy) {
  const w = screenToWorld(sx, sy);
  const { cx, cy } = worldToCell(w.x, w.y);
  // Must be an adjacent placed tile not already visited this chain
  const dx = cx - state.dragonPos.x, dy = cy - state.dragonPos.y;
  if (Math.abs(dx) + Math.abs(dy) !== 1) return;
  if (!state.board.tileAt(cx, cy)) return;
  const key = `${cx},${cy}`;
  if (state.dragonVisited.has(key)) return;
  // Move dragon, eat meeples
  state.dragonPos = { x: cx, y: cy };
  state.dragonVisited.add(key);
  eatMeeplesOnTile(cx, cy);
  state.dragonMovesLeft--;
  updateHud();
  render();
  if (state.dragonMovesLeft === 0 || !hasUnvisitedNeighbor(cx, cy)) {
    // Finish dragon phase, proceed turn
    finishDragonMove();
  }
}

function eatMeeplesOnTile(x, y) {
  const tile = state.board.tileAt(x, y);
  if (!tile) return;
  const now = performance.now();
  tile.features.forEach((f, i) => {
    const root = state.board.uf.find(window.fkey(x, y, i));
    const meta = state.board.uf.data.get(root);
    const kept = [];
    for (const m of meta.meeples) {
      if (m.fkey === window.fkey(x, y, i)) {
        state.players[m.playerIdx].meeples++;
        const [ax, ay] = window.featureAnchor(f);
        state.eatenFx.push({ x, y, ax, ay, playerIdx: m.playerIdx, start: now, dur: 1600 });
        state.dragonEatenCount++;
      } else {
        kept.push(m);
      }
    }
    meta.meeples = kept;
  });
  if (state.eatenFx.length) scheduleFxTick();
}

function scheduleFxTick() {
  if (state._fxRaf) return;
  const tick = () => {
    const now = performance.now();
    state.eatenFx = state.eatenFx.filter(fx => now - fx.start < fx.dur);
    state.scoreFx = state.scoreFx.filter(fx => now - fx.start < fx.dur);
    state.flashFx = state.flashFx.filter(fx => now - fx.start < fx.dur);
    const placedActive = state.lastPlacedAt && (now - state.lastPlacedAt) < 2500;
    render();
    const active = state.eatenFx.length || state.scoreFx.length || state.flashFx.length || placedActive;
    if (active) {
      state._fxRaf = requestAnimationFrame(tick);
    } else {
      state._fxRaf = 0;
    }
  };
  state._fxRaf = requestAnimationFrame(tick);
}

function hasUnvisitedNeighbor(x, y) {
  for (const [dx, dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
    const nx = x + dx, ny = y + dy;
    if (state.board.tileAt(nx, ny) && !state.dragonVisited.has(`${nx},${ny}`)) return true;
  }
  return false;
}

function finishDragonMove() {
  state.dragonPos = null;
  state.dragonMovesLeft = 0;
  state.dragonVisited = null;
  state.currentIsDragon = false;
  state.lastPlacement = null;
  state.current = (state.current + 1) % state.players.length;
  if (state.deck.length === 0) { openExtendDeckModal(); return; }
  drawNextTile();
  if (state.currentTileId) {
    state.phase = 'placeTile';
    state.currentRotation = 0;
  }
  updateHud();
  render();
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
  if (state.phase === 'placeTile') handleTilePlaceClick(sx, sy);
  else if (state.phase === 'placeMeeple') handleMeeplePlaceClick(sx, sy);
  else if (state.phase === 'dragonMove') handleDragonMoveClick(sx, sy);
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
  let best = -1, bestDist = Infinity;
  tile.features.forEach((f, i) => {
    if (state.mode === 'classic' && f.type === 'field') return;
    const [ax, ay] = window.featureAnchor(f);
    const worldX = tileX + ax * S, worldY = tileY + ay * S;
    const d = Math.hypot(worldX - w.x, worldY - w.y);
    if (d < bestDist && d < S * 0.35) { bestDist = d; best = i; }
  });
  if (best < 0) return;
  if (!state.board.canPlaceMeeple(x, y, best)) return;
  state.board.placeMeeple(x, y, best, state.current);
  state.players[state.current].meeples--;
  endTurn();
}

function rotateTile(dir) {
  if (state.phase !== 'placeTile') return;
  const d = dir === -1 ? -1 : 1;
  state.currentRotation = (state.currentRotation + d + 4) % 4;
  render();
}

function openRenameModal() {
  if (state.phase === 'menu') return;
  const box = document.getElementById('renameInputs');
  box.innerHTML = state.players.map((p, i) =>
    `<input type="text" data-idx="${i}" maxlength="14" value="${escapeHtml(p.name)}" style="border-right-color:${window.PLAYER_COLORS[i]}">`
  ).join('');
  document.getElementById('renameModal').classList.add('open');
}

function confirmRename() {
  document.querySelectorAll('#renameInputs input').forEach(inp => {
    const i = parseInt(inp.dataset.idx, 10);
    const v = inp.value.trim();
    if (v) state.players[i].name = v;
  });
  document.getElementById('renameModal').classList.remove('open');
  updateHud();
}

function zoomBy(factor) {
  const c = state.canvas;
  const sx = c.width / 2, sy = c.height / 2;
  const w = screenToWorld(sx, sy);
  state.camera.zoom *= factor;
  state.camera.zoom = Math.max(0.3, Math.min(3, state.camera.zoom));
  state.camera.x = sx - w.x * state.camera.zoom;
  state.camera.y = sy - w.y * state.camera.zoom;
  render();
}

function zoomReset() {
  state.camera.zoom = 1;
  render();
}

function fitToBoard() {
  if (!state.board || !state.board.tiles.size) return;
  const S = window.TILE_SIZE;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const k of state.board.tiles.keys()) {
    const [x, y] = k.split(',').map(Number);
    if (x < minX) minX = x; if (y < minY) minY = y;
    if (x > maxX) maxX = x; if (y > maxY) maxY = y;
  }
  const w = (maxX - minX + 1) * S;
  const h = (maxY - minY + 1) * S;
  const c = state.canvas;
  const pad = 40;
  const zx = (c.width - pad) / w;
  const zy = (c.height - pad) / h;
  state.camera.zoom = Math.max(0.3, Math.min(3, Math.min(zx, zy)));
  const worldCx = (minX + maxX + 1) / 2 * S;
  const worldCy = (minY + maxY + 1) / 2 * S;
  state.camera.x = c.width / 2 - worldCx * state.camera.zoom;
  state.camera.y = c.height / 2 - worldCy * state.camera.zoom;
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

  if (state.phase === 'placeTile' && state.currentTileId) {
    const spots = state.board.candidateSpots();
    const currentTile = window.makeTile(state.currentTileId, state.currentRotation);
    ctx.globalAlpha = 0.25;
    for (const [x, y] of spots) {
      ctx.fillStyle = state.board.canPlace(x, y, currentTile) ? '#a0e0a0' : '#f0a0a0';
      ctx.fillRect(x * S, y * S, S, S);
    }
    ctx.globalAlpha = 1;
  }

  for (const [k, tile] of state.board.tiles) {
    const [x, y] = k.split(',').map(Number);
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

  // Completed-feature flash overlay
  if (state.flashFx && state.flashFx.length) {
    const now = performance.now();
    for (const fx of state.flashFx) {
      const t = (now - fx.start) / fx.dur;
      if (t >= 1) continue;
      const alpha = 0.55 * (1 - t);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = fx.color;
      for (const [tx, ty] of fx.tiles) ctx.fillRect(tx * S, ty * S, S, S);
      ctx.restore();
    }
  }

  // Last-placed tile gold-fade highlight
  if (state.lastPlacedAt && state.lastPlacement) {
    const now = performance.now();
    const t = (now - state.lastPlacedAt) / 2500;
    if (t < 1) {
      const alpha = 1 - t;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#d7c28e';
      ctx.lineWidth = 4;
      const { x, y } = state.lastPlacement;
      ctx.strokeRect(x * S + 2, y * S + 2, S - 4, S - 4);
      ctx.restore();
    }
  }

  // Hover preview
  if (state.phase === 'placeTile' && state.hover && state.currentTileId) {
    const { x, y } = state.hover;
    const tile = window.makeTile(state.currentTileId, state.currentRotation);
    const canPlace = state.board.canPlace(x, y, tile);
    ctx.globalAlpha = canPlace ? 0.8 : 0.4;
    window.drawTile(ctx, tile, x * S, y * S, S, { x, y });
    ctx.globalAlpha = 1;
    if (!canPlace) { ctx.strokeStyle = 'red'; ctx.lineWidth = 3; ctx.strokeRect(x * S, y * S, S, S); }
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
      ctx.beginPath(); ctx.arc(px, py, S * 0.09, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    });
    ctx.strokeStyle = 'yellow'; ctx.lineWidth = 3; ctx.strokeRect(x * S, y * S, S, S);
  }

  // Dragon move UI
  if (state.phase === 'dragonMove' && state.dragonPos) {
    // Highlight valid next steps
    const { x, y } = state.dragonPos;
    for (const [dx, dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
      const nx = x + dx, ny = y + dy;
      if (state.board.tileAt(nx, ny) && !state.dragonVisited.has(`${nx},${ny}`)) {
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#ff4444';
        ctx.fillRect(nx * S, ny * S, S, S);
        ctx.globalAlpha = 1;
      }
    }
    // Draw dragon icon
    drawDragonIcon(ctx, x * S + S / 2, y * S + S / 2, S * 0.35);
  }

  // Floating score popups
  if (state.scoreFx && state.scoreFx.length) {
    const now = performance.now();
    ctx.save();
    for (const fx of state.scoreFx) {
      const t = (now - fx.start) / fx.dur;
      if (t >= 1) continue;
      const alpha = 1 - t;
      const rise = t * S * 0.9;
      const px = fx.cx * S + S / 2;
      const py = fx.cy * S + S / 2 - rise;
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${Math.floor(S * 0.42)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#000';
      ctx.fillStyle = fx.color;
      const label = `+${fx.pts}`;
      ctx.strokeText(label, px, py);
      ctx.fillText(label, px, py);
    }
    ctx.restore();
  }

  // Eaten-meeple effects (drawn above everything)
  if (state.eatenFx && state.eatenFx.length) {
    const now = performance.now();
    for (const fx of state.eatenFx) {
      const t = Math.min(1, (now - fx.start) / fx.dur);
      drawEatenFx(ctx, fx, t, S);
    }
  }
}

function drawEatenFx(ctx, fx, t, S) {
  const px = fx.x * S + fx.ax * S;
  const py = fx.y * S + fx.ay * S - t * S * 0.4;
  const alpha = 1 - t;
  ctx.save();
  ctx.globalAlpha = alpha;
  // fading meeple dot in player color
  ctx.fillStyle = window.PLAYER_COLORS[fx.playerIdx];
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(px, py, S * 0.10, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // red X over it
  ctx.strokeStyle = '#ff2626';
  ctx.lineWidth = 3;
  const r = S * 0.14;
  ctx.beginPath();
  ctx.moveTo(px - r, py - r); ctx.lineTo(px + r, py + r);
  ctx.moveTo(px + r, py - r); ctx.lineTo(px - r, py + r);
  ctx.stroke();
  // rising "-1"
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#b41a1a';
  ctx.lineWidth = 3;
  ctx.font = `bold ${Math.floor(S * 0.22)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = '🐲';
  ctx.strokeText(label, px + S * 0.18, py - S * 0.05);
  ctx.fillText(label, px + S * 0.18, py - S * 0.05);
  ctx.restore();
}

function drawDragonIcon(ctx, cx, cy, r) {
  // Simple dragon: big red circle with eyes + fangs
  ctx.save();
  ctx.fillStyle = '#b41a1a';
  ctx.strokeStyle = '#3a0606';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  // eyes
  ctx.fillStyle = '#ffe44a';
  ctx.beginPath(); ctx.arc(cx - r * 0.35, cy - r * 0.15, r * 0.18, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + r * 0.35, cy - r * 0.15, r * 0.18, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(cx - r * 0.35, cy - r * 0.15, r * 0.08, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + r * 0.35, cy - r * 0.15, r * 0.08, 0, Math.PI * 2); ctx.fill();
  // fangs
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.2, cy + r * 0.3);
  ctx.lineTo(cx - r * 0.1, cy + r * 0.6);
  ctx.lineTo(cx, cy + r * 0.3);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.2, cy + r * 0.3);
  ctx.lineTo(cx + r * 0.1, cy + r * 0.6);
  ctx.lineTo(cx, cy + r * 0.3);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function updateHud() {
  const hud = document.getElementById('hud');
  const modeLabel = state.mode === 'fields' ? 'עם שדות' : state.mode === 'dragon' ? 'דרקון' : 'קלאסי';
  const playerList = state.players.map((p, i) => {
    const active = i === state.current ? ' — תור' : '';
    const totalMeeples = 7;
    const pips = [];
    for (let k = 0; k < totalMeeples; k++) {
      pips.push(`<span class="meeple-pip ${k < p.meeples ? '' : 'spent'}" style="--c:${window.PLAYER_COLORS[i]}"></span>`);
    }
    return `<div class="player" style="--c:${window.PLAYER_COLORS[i]}">
      <b>${escapeHtml(p.name)}</b>${active}<br>
      ${p.score} נק׳ · ${p.meeples} חיילים
      <div class="meeple-pips">${pips.join('')}</div>
    </div>`;
  }).join('');
  const remaining = state.deck.length;
  let statusText = '';
  if (state.phase === 'placeTile') statusText = 'הנח אריח';
  else if (state.phase === 'placeMeeple') statusText = 'הנח חייל (או דלג)';
  else if (state.phase === 'dragonMove') statusText = `🐉 הזז את הדרקון ${state.dragonMovesLeft} צעדים · נאכלו ${state.dragonEatenCount} חיילים`;
  else statusText = 'סיום';
  hud.innerHTML = `
    <h2>קרקסון — ${modeLabel}</h2>
    <div class="players">${playerList}</div>
    <div class="status">${statusText}</div>
  `;
  // Deck progress bar
  const deckWrap = document.getElementById('deckBarWrap');
  if (state.phase !== 'menu' && state.initialDeckSize > 0) {
    deckWrap.style.display = 'flex';
    document.getElementById('deckBarText').textContent = `נותרו בערימה: ${remaining} / ${state.initialDeckSize}`;
    const pct = Math.max(0, Math.min(100, 100 * remaining / state.initialDeckSize));
    document.getElementById('deckBarFill').style.width = pct + '%';
  } else {
    deckWrap.style.display = 'none';
  }
  // Current tile
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
  // Peek next tile
  const peekRow = document.getElementById('peekRow');
  const peek = document.getElementById('peekTile');
  const peekId = state.phase === 'placeTile' && state.deck.length > 0
    ? state.deck[state.deck.length - 1] : null;
  if (peekId) {
    peekRow.style.display = 'block';
    const pctx = peek.getContext('2d');
    pctx.clearRect(0, 0, peek.width, peek.height);
    const pt = window.makeTile(peekId, 0);
    window.drawTile(pctx, pt, 0, 0, peek.width);
  } else {
    peekRow.style.display = 'none';
  }
  document.getElementById('dragonBadge').style.display =
    (state.currentIsDragon && state.phase === 'placeTile') ? 'block' : 'none';
  document.getElementById('rotateBtn').style.display = state.phase === 'placeTile' ? 'inline-block' : 'none';
  document.getElementById('skipBtn').style.display = state.phase === 'placeMeeple' ? 'inline-block' : 'none';
  document.getElementById('viewCtrls').style.display = state.phase !== 'menu' ? 'flex' : 'none';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Init ----------

function initApp() {
  state.canvas = document.getElementById('boardCanvas');
  state.ctx = state.canvas.getContext('2d');
  window.preloadTileImages(() => { if (state.phase !== 'menu') render(); });
  window.addEventListener('resize', () => { resizeCanvas(); render(); });
  state.canvas.addEventListener('mousemove', onMouseMove);
  state.canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  state.canvas.addEventListener('wheel', onWheel, { passive: false });
  state.canvas.addEventListener('contextmenu', e => e.preventDefault());

  document.getElementById('rotateBtn').addEventListener('click', () => rotateTile(1));
  document.getElementById('skipBtn').addEventListener('click', skipMeeple);
  document.getElementById('renameBtn').addEventListener('click', openRenameModal);
  document.getElementById('renameConfirm').addEventListener('click', confirmRename);
  document.getElementById('renameCancel').addEventListener('click', () => {
    document.getElementById('renameModal').classList.remove('open');
  });
  document.getElementById('installClose').addEventListener('click', () => {
    document.getElementById('installModal').classList.remove('open');
  });
  document.getElementById('zoomInBtn').addEventListener('click', () => zoomBy(1.2));
  document.getElementById('zoomOutBtn').addEventListener('click', () => zoomBy(1 / 1.2));
  document.getElementById('zoomResetBtn').addEventListener('click', zoomReset);
  document.getElementById('fitBtn').addEventListener('click', fitToBoard);
  document.getElementById('menuBtn').addEventListener('click', () => {
    if (confirm('לחזור לתפריט? המשחק הנוכחי יאבד.')) showMenu();
  });
  document.getElementById('endGameBtn').addEventListener('click', () => {
    if (state.phase === 'gameover') return;
    document.getElementById('confirmEndModal').classList.add('open');
  });
  document.getElementById('confirmEndYes').addEventListener('click', () => {
    document.getElementById('confirmEndModal').classList.remove('open');
    endGame();
  });
  document.getElementById('confirmEndNo').addEventListener('click', () => {
    document.getElementById('confirmEndModal').classList.remove('open');
  });
  document.getElementById('extendConfirm').addEventListener('click', confirmExtendDeck);
  document.getElementById('extendEnd').addEventListener('click', () => {
    document.getElementById('extendModal').classList.remove('open');
    endGame();
  });
  document.getElementById('endNewGame').addEventListener('click', () => { closeAllModals(); showMenu(); });
  document.getElementById('endClose').addEventListener('click', closeAllModals);

  document.querySelectorAll('.start-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = document.querySelector('input[name="mode"]:checked').value;
      const np = parseInt(document.querySelector('input[name="players"]:checked').value, 10);
      const ds = parseInt(document.querySelector('input[name="deckSize"]:checked').value, 10);
      const names = [];
      document.querySelectorAll('#nameInputs input').forEach(inp => {
        names[parseInt(inp.dataset.idx, 10)] = inp.value;
      });
      startGame(mode, np, ds, names);
    });
  });

  window.addEventListener('keydown', e => {
    if (e.key === 'r' || e.key === 'R' || e.key === ' ') rotateTile(e.shiftKey ? -1 : 1);
    if (e.key === 'Escape' && state.phase === 'placeMeeple') skipMeeple();
    if (e.key === '9' && state.phase !== 'menu' && state.phase !== 'gameover') forceEndDeck();
    if (state.phase !== 'menu') {
      const step = 60;
      if (e.key === 'ArrowUp')    { state.camera.y += step; render(); }
      if (e.key === 'ArrowDown')  { state.camera.y -= step; render(); }
      if (e.key === 'ArrowLeft')  { state.camera.x += step; render(); }
      if (e.key === 'ArrowRight') { state.camera.x -= step; render(); }
      if (e.key === 'f' || e.key === 'F') fitToBoard();
    }
  });
}

function forceEndDeck() {
  state.deck = [];
  openExtendDeckModal();
}

window.addEventListener('DOMContentLoaded', initApp);
