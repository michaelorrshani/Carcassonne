// Board engine: placement validation, feature tracking via union-find, scoring.

class UnionFind {
  constructor() { this.parent = new Map(); this.data = new Map(); }
  make(key, meta) {
    if (this.parent.has(key)) return;
    this.parent.set(key, key);
    this.data.set(key, meta);
  }
  find(k) {
    while (this.parent.get(k) !== k) {
      this.parent.set(k, this.parent.get(this.parent.get(k)));
      k = this.parent.get(k);
    }
    return k;
  }
  union(a, b, merge) {
    const ra = this.find(a), rb = this.find(b);
    if (ra === rb) return ra;
    this.parent.set(ra, rb);
    const merged = merge(this.data.get(ra), this.data.get(rb));
    this.data.set(rb, merged);
    return rb;
  }
  all() {
    const groups = new Map();
    for (const k of this.parent.keys()) {
      const r = this.find(k);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(k);
    }
    return groups;
  }
}

// Feature key: `${x},${y}:${featureIndex}` (featureIndex within the tile's rotated feature list)
function fkey(x, y, idx) { return `${x},${y}:${idx}`; }

// For each side, identify which feature(s) of a placed tile touch that side.
function featureIndicesForSide(features, side) {
  const idxs = [];
  features.forEach((f, i) => { if (f.sides.includes(side)) idxs.push(i); });
  return idxs;
}

class Board {
  constructor() {
    this.tiles = new Map(); // "x,y" -> {id, rotation, edges, features}
    this.uf = new UnionFind();
    // per-feature meta tracks: type, meeples [{playerIdx, fkey}], openEdgeCount (number of dangling edges for roads/cities)
    this.placedTiles = [];
  }

  tileAt(x, y) { return this.tiles.get(`${x},${y}`); }

  placeStart() {
    // Starting tile is type D rotated so city is north (default).
    const t = makeTile('D', 0);
    this.tiles.set('0,0', t);
    this.placedTiles.push({ x: 0, y: 0 });
    this.registerFeatures(0, 0, t);
  }

  // Register features of a freshly placed tile, merge with neighbors' features.
  registerFeatures(x, y, tile) {
    // Create union-find nodes for each feature on this tile.
    tile.features.forEach((f, i) => {
      const meta = {
        type: f.type,
        shield: f.shield ? 1 : 0,
        cloister: f.type === 'cloister',
        tiles: new Set([`${x},${y}`]),
        meeples: [],
        openEdges: 0 // open edges count (city/road)
      };
      // count open edges: number of sides the feature touches, each side is open unless neighboring tile matches
      if (f.type === 'city' || f.type === 'road') {
        meta.openEdges = f.sides.length;
      }
      this.uf.make(fkey(x, y, i), meta);
    });

    // Merge with neighbors side by side
    const dirs = [[0, 0, -1], [1, 1, 0], [2, 0, 1], [3, -1, 0]]; // [side, dx, dy]
    for (const [side, dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      const neighbor = this.tileAt(nx, ny);
      if (!neighbor) continue;
      const oppSide = (side + 2) % 4;
      const edgeType = tile.edges[side];
      if (edgeType === 'F' || edgeType === 'C' || edgeType === 'R') {
        const myIdxs = featureIndicesForSide(tile.features, side);
        const theirIdxs = featureIndicesForSide(neighbor.features, oppSide);
        // Match features of same type that are on these sides.
        for (const mi of myIdxs) {
          const mf = tile.features[mi];
          for (const ti of theirIdxs) {
            const tf = neighbor.features[ti];
            if (mf.type !== tf.type) continue;
            // union them
            this.uf.union(fkey(x, y, mi), fkey(nx, ny, ti), (a, b) => ({
              type: a.type,
              shield: a.shield + b.shield,
              cloister: a.cloister || b.cloister,
              tiles: new Set([...a.tiles, ...b.tiles]),
              meeples: [...a.meeples, ...b.meeples],
              openEdges: a.openEdges + b.openEdges - 2 // two edges now closed
            }));
          }
        }
      }
    }
  }

  // Validate placement at (x,y) with given tile (already rotated).
  canPlace(x, y, tile) {
    if (this.tiles.has(`${x},${y}`)) return false;
    const dirs = [[0, 0, -1], [1, 1, 0], [2, 0, 1], [3, -1, 0]];
    let hasNeighbor = false;
    for (const [side, dx, dy] of dirs) {
      const n = this.tileAt(x + dx, y + dy);
      if (n) {
        hasNeighbor = true;
        const myEdge = tile.edges[side];
        const theirEdge = n.edges[(side + 2) % 4];
        if (myEdge !== theirEdge) return false;
      }
    }
    return hasNeighbor;
  }

  // Candidate placement positions (empty cells adjacent to any placed tile).
  candidateSpots() {
    const s = new Set();
    for (const [k] of this.tiles) {
      const [x, y] = k.split(',').map(Number);
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nk = `${x + dx},${y + dy}`;
        if (!this.tiles.has(nk)) s.add(nk);
      }
    }
    return [...s].map(k => k.split(',').map(Number));
  }

  // Is there any rotation of this tile that fits somewhere?
  canTileFitAnywhere(tileId) {
    const spots = this.candidateSpots();
    for (const [x, y] of spots) {
      for (let r = 0; r < 4; r++) {
        if (this.canPlace(x, y, makeTile(tileId, r))) return true;
      }
    }
    return false;
  }

  // Can a meeple be placed on feature at (x,y) index i?
  canPlaceMeeple(x, y, featIdx) {
    const root = this.uf.find(fkey(x, y, featIdx));
    const meta = this.uf.data.get(root);
    return meta.meeples.length === 0;
  }

  placeMeeple(x, y, featIdx, playerIdx) {
    const root = this.uf.find(fkey(x, y, featIdx));
    const meta = this.uf.data.get(root);
    meta.meeples.push({ playerIdx, fkey: fkey(x, y, featIdx) });
  }

  // After a tile placement at (x,y) + optional meeple, score any completed features.
  // Returns [{type, playerIdxs: [idx...], points, featRoot, tileKeys}] events.
  // Cloisters: a cloister at tile T is complete if T + all 8 neighbors exist.
  scoreCompleted(x, y) {
    const events = [];
    const scored = new Set();
    // Collect roots to examine: features on the just-placed tile + cloister tiles within 2 distance
    const tile = this.tileAt(x, y);
    tile.features.forEach((f, i) => {
      const root = this.uf.find(fkey(x, y, i));
      if (scored.has(root)) return;
      const meta = this.uf.data.get(root);
      if ((meta.type === 'road' || meta.type === 'city') && meta.openEdges === 0) {
        scored.add(root);
        const ev = this.scoreFeature(root, false);
        if (ev) events.push(ev);
      }
    });
    // Cloister checks: any cloister tile within 1 square
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cx = x + dx, cy = y + dy;
        const t = this.tileAt(cx, cy);
        if (!t) continue;
        t.features.forEach((f, i) => {
          if (f.type !== 'cloister') return;
          const root = this.uf.find(fkey(cx, cy, i));
          if (scored.has(root)) return;
          if (this.cloisterComplete(cx, cy)) {
            scored.add(root);
            const ev = this.scoreFeature(root, false);
            if (ev) events.push(ev);
          }
        });
      }
    }
    return events;
  }

  cloisterComplete(x, y) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (!this.tileAt(x + dx, y + dy)) return false;
      }
    }
    return true;
  }

  scoreFeature(root, endGame) {
    const meta = this.uf.data.get(root);
    let points = 0;
    if (meta.type === 'road') {
      points = meta.tiles.size;
    } else if (meta.type === 'city') {
      const base = meta.tiles.size + meta.shield;
      points = endGame ? base : base * 2;
    } else if (meta.type === 'cloister') {
      // Cloister tile itself + surrounding tiles with a tile present
      // Find the cloister tile
      const [cx, cy] = [...meta.tiles][0].split(',').map(Number);
      let n = 0;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (this.tileAt(cx + dx, cy + dy)) n++;
      points = n;
    }
    if (meta.meeples.length === 0) {
      // No one scores, but still return meeples. Actually no meeples to return.
      return null;
    }
    // Majority rule among meeples
    const counts = {};
    for (const m of meta.meeples) counts[m.playerIdx] = (counts[m.playerIdx] || 0) + 1;
    const maxCount = Math.max(...Object.values(counts));
    const winners = Object.keys(counts).filter(k => counts[k] === maxCount).map(Number);
    // Remove meeples from feature (return to players) - only if not endGame
    const returnedMeeples = [...meta.meeples];
    if (!endGame) {
      meta.meeples = [];
    }
    return {
      type: meta.type,
      winners,
      points,
      returned: returnedMeeples,
      featRoot: root
    };
  }

  // End-game scoring: score all remaining incomplete road/city/cloister features + farms (if enabled).
  endGameScore(farmMode) {
    const events = [];
    const groups = this.uf.all();
    const scoredRoots = new Set();
    for (const [root, keys] of groups) {
      if (scoredRoots.has(root)) continue;
      scoredRoots.add(root);
      const meta = this.uf.data.get(root);
      if (meta.type === 'field') continue; // farms handled separately
      if (meta.meeples.length === 0) continue;
      const ev = this.scoreFeature(root, true);
      if (ev) events.push(ev);
    }
    if (farmMode) {
      // Farm scoring: each field feature with a farmer scores 3 points per completed adjacent city.
      for (const [root, keys] of groups) {
        const meta = this.uf.data.get(root);
        if (meta.type !== 'field') continue;
        if (meta.meeples.length === 0) continue;
        // Find completed cities adjacent to this field
        const adjCityRoots = new Set();
        for (const key of keys) {
          const [coord, idxStr] = key.split(':');
          const idx = parseInt(idxStr, 10);
          const [tx, ty] = coord.split(',').map(Number);
          const tile = this.tileAt(tx, ty);
          // For this field feature, find cities on the same tile that border it.
          // Simplification: any city feature on the same tile is considered adjacent.
          tile.features.forEach((f, i) => {
            if (f.type === 'city') {
              const r = this.uf.find(fkey(tx, ty, i));
              adjCityRoots.add(r);
            }
          });
        }
        let completed = 0;
        for (const cr of adjCityRoots) {
          const cmeta = this.uf.data.get(cr);
          if (cmeta.openEdges === 0) completed++;
        }
        const points = completed * 3;
        if (points === 0) continue;
        const counts = {};
        for (const m of meta.meeples) counts[m.playerIdx] = (counts[m.playerIdx] || 0) + 1;
        const maxCount = Math.max(...Object.values(counts));
        const winners = Object.keys(counts).filter(k => counts[k] === maxCount).map(Number);
        events.push({ type: 'farm', winners, points, returned: [...meta.meeples], featRoot: root });
      }
    }
    return events;
  }
}

function makeTile(id, rotation) {
  return {
    id,
    rotation,
    edges: window.rotatedEdges(id, rotation),
    features: window.rotatedFeatures(id, rotation)
  };
}

window.Board = Board;
window.makeTile = makeTile;
window.fkey = fkey;
