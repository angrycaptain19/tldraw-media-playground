// ─── FPS Game – Shared TypeScript Types ───────────────────────────────────────
// These types are the public contract between all fps/* modules.
// Downstream tasks should extend / implement these without renaming them.

// ── Map ────────────────────────────────────────────────────────────────────────

/**
 * A 2-D tile array where 0 = empty/walkable and 1+ = wall type.
 * Indexed as map[row][col].
 */
export type FpsMap = number[][]

// ── Entities ──────────────────────────────────────────────────────────────────

export interface FpsPlayer {
  /** World-space X position */
  x: number
  /** World-space Y position */
  y: number
  /** Camera / movement angle in radians */
  angle: number
  /** Remaining health (0-100) */
  health: number
  /** Player kill count */
  kills: number
}

export interface FpsBullet {
  /** World-space X position */
  x: number
  /** World-space Y position */
  y: number
  /** Direction angle in radians */
  angle: number
  /** Index of the owning player (0 = player 1, 1 = player 2) */
  ownerId: 0 | 1
}

// ── Input ─────────────────────────────────────────────────────────────────────

/**
 * Normalised input snapshot consumed by the game loop.
 * Supports keyboard, gamepad, and hand-tracking sources.
 */
export interface FpsExternalInput {
  /** Move forward */
  forward: boolean
  /** Move backward */
  back: boolean
  /** Turn / strafe left */
  left: boolean
  /** Turn / strafe right */
  right: boolean
  /** Fire weapon */
  fire: boolean
}

// ── Game State ────────────────────────────────────────────────────────────────

export interface FpsGameState {
  /** Both players; index 0 = player 1, index 1 = player 2 */
  players: [FpsPlayer, FpsPlayer]
  /** All live bullets */
  bullets: FpsBullet[]
  /** The active tile map */
  map: FpsMap
  /** Single-player or local split-screen */
  mode: 'single' | 'splitscreen'
  /** Monotonic tick counter (incremented every game-loop frame) */
  tick: number
}

// ── Raycasting ────────────────────────────────────────────────────────────────

export interface RayHit {
  /** Perpendicular distance from the camera plane to the hit wall (world units) */
  distance: number
  /** 0 = ray hit an E/W (vertical) wall face, 1 = ray hit a N/S (horizontal) wall face */
  side: 0 | 1
  /** Tile type of the struck wall (matches values in FpsMap) */
  tileType: number
  /** Fractional position of the hit along the wall face (0-1), used for texture mapping */
  wallX: number
}

// ── Enemy entity – used by the game loop and renderer stubs ──────────────────

export interface FpsEnemy {
  id: string
  x: number
  y: number
  angle: number
  health: number
  alive: boolean
  kind: 'patrol' | 'chase' | 'stationary'
}
