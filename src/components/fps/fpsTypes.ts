// ─── fpsTypes.ts ─────────────────────────────────────────────────────────────
// Single source of truth for all shared TypeScript types and the initial game
// state used by every FPS module. Zero React / DOM imports — pure game logic.
// ─────────────────────────────────────────────────────────────────────────────

// ── Enums / Unions ────────────────────────────────────────────────────────────

/** The high-level lifecycle phase of the FPS game. */
export type GamePhase = 'menu' | 'playing' | 'paused' | 'dead' | 'won'

// ── Map ───────────────────────────────────────────────────────────────────────

/**
 * Tile values used in the map grid.
 *  0 = open floor
 *  1 = grey stone wall
 *  2 = brick wall
 *  3 = metal wall
 */
export type TileType = 0 | 1 | 2 | 3

// ── Player ────────────────────────────────────────────────────────────────────

export interface PlayerState {
  /** World position in fractional tile units */
  x: number
  y: number
  /** Normalised direction vector (what the player is looking at) */
  dirX: number
  dirY: number
  /** Camera plane — perpendicular to the direction vector, controls FOV */
  planeX: number
  planeY: number
  /** Hit-points, 0–100 */
  health: number
  /** Rounds remaining */
  ammo: number
  /** Accumulated score */
  score: number
  /** Tiles per frame (forward/backward movement) */
  moveSpeed: number
  /** Radians per frame (mouse/keyboard turning) */
  rotSpeed: number
}

// ── Enemies ───────────────────────────────────────────────────────────────────

export interface Enemy {
  /** Stable unique identifier */
  id: number
  /** World position in fractional tile units */
  x: number
  y: number
  /** Hit-points */
  health: number
  /** False once the enemy has been killed */
  alive: boolean
  /** Current animation frame index (cycles through sprite sheet) */
  spriteFrame: number
  /** Was this enemy visible to the player last frame? (used for sprite sorting) */
  lastSeen: boolean
  /** Euclidean distance to the player — recalculated every frame for z-sorting */
  distance: number
}

// ── Projectiles ───────────────────────────────────────────────────────────────

export interface Bullet {
  /** Stable unique identifier */
  id: number
  /** World position in fractional tile units */
  x: number
  y: number
  /** Velocity components in tile units per frame */
  vx: number
  vy: number
  /** False once the bullet has hit a wall or enemy */
  alive: boolean
}

// ── Top-level game state ──────────────────────────────────────────────────────

export interface FpsGameState {
  phase: GamePhase
  player: PlayerState
  enemies: Enemy[]
  bullets: Bullet[]
  /**
   * 16x16 tile map.  Access as map[row][col] where row 0 is the top edge.
   * All border tiles are walls to prevent the player from escaping.
   */
  map: TileType[][]
  /** Incremented once per render call — useful for animation timing */
  frameCount: number
}

// ── Map layout ────────────────────────────────────────────────────────────────

/**
 * 16x16 tile maze.
 *
 * Legend:
 *   0 - open floor
 *   1 - grey stone wall
 *   2 - brick wall
 *   3 - metal wall
 *
 * The entire perimeter is walled (no tile on the outer ring is 0).
 * The map contains:
 *   - a starting room in the upper-left quadrant (cols 1-4, rows 1-4)
 *   - a central plaza (cols 6-9, rows 6-9)
 *   - corridors connecting rooms
 *   - a dead-end room in the lower-right quadrant
 *   - metal-wall pillars scattered for cover
 */
const MAP: TileType[][] = [
  // col: 0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
  /* 0 */ [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  /* 1 */ [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  /* 2 */ [1, 0, 3, 0, 0, 1, 0, 2, 2, 2, 0, 0, 0, 3, 0, 1],
  /* 3 */ [1, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 0, 0, 0, 0, 1],
  /* 4 */ [1, 0, 0, 0, 0, 1, 0, 2, 0, 2, 0, 0, 0, 0, 0, 1],
  /* 5 */ [1, 1, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1],
  /* 6 */ [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  /* 7 */ [1, 0, 2, 0, 1, 0, 0, 3, 0, 3, 0, 0, 1, 0, 2, 1],
  /* 8 */ [1, 0, 2, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 2, 1],
  /* 9 */ [1, 0, 0, 0, 0, 0, 0, 3, 0, 3, 0, 0, 0, 0, 0, 1],
  /*10 */ [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  /*11 */ [1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 1],
  /*12 */ [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
  /*13 */ [1, 0, 3, 0, 1, 0, 2, 2, 0, 2, 2, 1, 0, 3, 0, 1],
  /*14 */ [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  /*15 */ [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
]

// ── Enemy spawn points ────────────────────────────────────────────────────────

/**
 * Enemy starting positions (tile-centre coordinates = tile index + 0.5).
 * All are on floor tiles and spread across different map regions.
 */
const ENEMY_SPAWNS: { x: number; y: number }[] = [
  { x: 8.5, y: 3.5 }, // brick room, upper section
  { x: 13.5, y: 2.5 }, // upper-right corridor
  { x: 7.5, y: 7.5 }, // central plaza
  { x: 2.5, y: 12.5 }, // lower-left room
  { x: 12.5, y: 13.5 }, // lower-right dead-end room
]

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Returns a fresh FpsGameState with:
 * - Player placed at tile (2, 2) facing east (positive X direction)
 * - Full health (100) and ammo (30)
 * - 5 enemies distributed around the map
 * - Zero bullets, frame count at 0
 * - Phase set to 'menu' so the game loop starts on the title screen
 */
export function createInitialState(): FpsGameState {
  const player: PlayerState = {
    // Start in the upper-left starting room, tile (2,2) centred
    x: 2.5,
    y: 2.5,
    // Facing east (positive X)
    dirX: 1,
    dirY: 0,
    // Camera plane gives a ~66 degree FOV (standard raycaster value)
    planeX: 0,
    planeY: 0.66,
    health: 100,
    ammo: 30,
    score: 0,
    moveSpeed: 0.05,
    rotSpeed: 0.03,
  }

  const enemies: Enemy[] = ENEMY_SPAWNS.map((spawn, index) => ({
    id: index,
    x: spawn.x,
    y: spawn.y,
    health: 100,
    alive: true,
    spriteFrame: 0,
    lastSeen: false,
    distance: 0,
  }))

  return {
    phase: 'menu',
    player,
    enemies,
    bullets: [],
    map: MAP,
    frameCount: 0,
  }
}
