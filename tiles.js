// Carcassonne tile definitions
// Edge types: C = city, R = road, F = field
// Sides: 0 = North, 1 = East, 2 = South, 3 = West
//
// Each tile has `features`: internal connected components.
// Each feature: {type, sides, shield?, cloister?}
// "sides" lists external edges this feature touches (fields split by roads become multiple features).

const EDGE = { C: 'C', R: 'R', F: 'F' };

const TILE_TYPES = {
  A: { // Cloister with road south
    edges: 'FFRF',
    features: [
      { type: 'cloister', sides: [] },
      { type: 'road', sides: [2] },
      { type: 'field', sides: [0, 1, 3] }
    ],
    count: 2
  },
  B: { // Cloister alone
    edges: 'FFFF',
    features: [
      { type: 'cloister', sides: [] },
      { type: 'field', sides: [0, 1, 2, 3] }
    ],
    count: 4
  },
  C: { // Full city with shield
    edges: 'CCCC',
    features: [
      { type: 'city', sides: [0, 1, 2, 3], shield: true }
    ],
    count: 1
  },
  D: { // Road N-S straight, city on E side
    edges: 'RCRF',
    features: [
      { type: 'road', sides: [0, 2] },
      { type: 'city', sides: [1] },
      { type: 'field', sides: [3] },   // west of road (open field)
      { type: 'field', sides: [] }     // between road and city (interior strip)
    ],
    count: 4
  },
  E: { // City N, field others
    edges: 'CFFF',
    features: [
      { type: 'city', sides: [0] },
      { type: 'field', sides: [1, 2, 3] }
    ],
    count: 5
  },
  F: { // City E-W connected (bridge), shield
    edges: 'FCFC',
    features: [
      { type: 'city', sides: [1, 3], shield: true },
      { type: 'field', sides: [0] },
      { type: 'field', sides: [2] }
    ],
    count: 2
  },
  G: { // City N-S connected, no shield
    edges: 'CFCF',
    features: [
      { type: 'city', sides: [0, 2] },
      { type: 'field', sides: [1] },
      { type: 'field', sides: [3] }
    ],
    count: 1
  },
  H: { // Two separate cities E and W
    edges: 'FCFC',
    features: [
      { type: 'city', sides: [1] },
      { type: 'city', sides: [3] },
      { type: 'field', sides: [0, 2] }
    ],
    count: 3
  },
  I: { // Two separate cities E and S (corner), field N-W
    edges: 'FCCF',
    features: [
      { type: 'city', sides: [1] },
      { type: 'city', sides: [2] },
      { type: 'field', sides: [0, 3] }
    ],
    count: 2
  },
  J: { // City N, road E-S connected (curve)
    edges: 'CRRF',
    features: [
      { type: 'city', sides: [0] },
      { type: 'road', sides: [1, 2] },
      { type: 'field', sides: [3] },
      { type: 'field', sides: [] }
    ],
    count: 3
  },
  K: { // City E, road N-W connected (curve)
    edges: 'RCFR',
    features: [
      { type: 'city', sides: [1] },
      { type: 'road', sides: [0, 3] },
      { type: 'field', sides: [2] },
      { type: 'field', sides: [] }
    ],
    count: 3
  },
  L: { // City E, three separate roads N, S, W (T-junction to city)
    edges: 'RCRR',
    features: [
      { type: 'city', sides: [1] },
      { type: 'road', sides: [0] },
      { type: 'road', sides: [2] },
      { type: 'road', sides: [3] },
      { type: 'field', sides: [] },
      { type: 'field', sides: [] },
      { type: 'field', sides: [] }
    ],
    count: 3
  },
  M: { // City N-W connected with shield, field S-E
    edges: 'CFFC',
    features: [
      { type: 'city', sides: [0, 3], shield: true },
      { type: 'field', sides: [1, 2] }
    ],
    count: 2
  },
  N: { // City N-W connected, no shield
    edges: 'CFFC',
    features: [
      { type: 'city', sides: [0, 3] },
      { type: 'field', sides: [1, 2] }
    ],
    count: 3
  },
  O: { // City N-W, road E-S, shield
    edges: 'CRRC',
    features: [
      { type: 'city', sides: [0, 3], shield: true },
      { type: 'road', sides: [1, 2] },
      { type: 'field', sides: [] }
    ],
    count: 2
  },
  P: { // City N-W, road E-S, no shield
    edges: 'CRRC',
    features: [
      { type: 'city', sides: [0, 3] },
      { type: 'road', sides: [1, 2] },
      { type: 'field', sides: [] }
    ],
    count: 3
  },
  Q: { // City N-E-W, shield
    edges: 'CCFC',
    features: [
      { type: 'city', sides: [0, 1, 3], shield: true },
      { type: 'field', sides: [2] }
    ],
    count: 1
  },
  R: { // City N-E-W, no shield
    edges: 'CCFC',
    features: [
      { type: 'city', sides: [0, 1, 3] },
      { type: 'field', sides: [2] }
    ],
    count: 3
  },
  S: { // City N-E-W, road S, shield
    edges: 'CCRC',
    features: [
      { type: 'city', sides: [0, 1, 3], shield: true },
      { type: 'road', sides: [2] },
      { type: 'field', sides: [] },
      { type: 'field', sides: [] }
    ],
    count: 2
  },
  T: { // City N-E-W, road S, no shield
    edges: 'CCRC',
    features: [
      { type: 'city', sides: [0, 1, 3] },
      { type: 'road', sides: [2] },
      { type: 'field', sides: [] },
      { type: 'field', sides: [] }
    ],
    count: 1
  },
  U: { // Straight road N-S
    edges: 'RFRF',
    features: [
      { type: 'road', sides: [0, 2] },
      { type: 'field', sides: [1] },
      { type: 'field', sides: [3] }
    ],
    count: 8
  },
  V: { // Curved road S-W
    edges: 'FFRR',
    features: [
      { type: 'road', sides: [2, 3] },
      { type: 'field', sides: [0, 1] }, // outer field (larger side)
      { type: 'field', sides: [] }      // inner corner
    ],
    count: 9
  },
  W: { // Three-way road: E, S, W (T crossroad)
    edges: 'FRRR',
    features: [
      { type: 'road', sides: [1] },
      { type: 'road', sides: [2] },
      { type: 'road', sides: [3] },
      { type: 'field', sides: [0, 1] }, // between N and E+S junction... simplified
      { type: 'field', sides: [0, 3] }, // simplified split
      { type: 'field', sides: [] }
    ],
    count: 4
  },
  X: { // Four-way road crossroads
    edges: 'RRRR',
    features: [
      { type: 'road', sides: [0] },
      { type: 'road', sides: [1] },
      { type: 'road', sides: [2] },
      { type: 'road', sides: [3] },
      { type: 'field', sides: [] },
      { type: 'field', sides: [] },
      { type: 'field', sides: [] },
      { type: 'field', sides: [] }
    ],
    count: 1
  }
};

// Build the shuffled deck (72 tiles). Starting tile is a D placed on the table.
function buildDeck() {
  const deck = [];
  for (const [id, tile] of Object.entries(TILE_TYPES)) {
    for (let i = 0; i < tile.count; i++) {
      deck.push(id);
    }
  }
  // Remove one D for the starting tile
  const dIdx = deck.indexOf('D');
  deck.splice(dIdx, 1);
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Rotate tile: cw 90deg. Sides shift: new[i] = old[(i-rot+4)%4] (rot=1 means rotating cw once)
function rotatedEdges(tileId, rotation) {
  const edges = TILE_TYPES[tileId].edges;
  // rotation in [0,1,2,3]; rot=1 -> old North becomes new East
  // new side i corresponds to old side (i - rotation + 4) % 4
  const out = [];
  for (let i = 0; i < 4; i++) {
    out.push(edges[(i - rotation + 4) % 4]);
  }
  return out.join('');
}

function rotatedFeatures(tileId, rotation) {
  const feats = TILE_TYPES[tileId].features;
  return feats.map(f => ({
    ...f,
    sides: f.sides.map(s => (s + rotation) % 4)
  }));
}

// Export globals
window.TILE_TYPES = TILE_TYPES;
window.buildDeck = buildDeck;
window.rotatedEdges = rotatedEdges;
window.rotatedFeatures = rotatedFeatures;
