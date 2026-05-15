// ─── FPS Game – Shared TypeScript Types ───────────────────────────────────────
// These types are the public contract between all fps/* modules.
// Downstream tasks should extend / implement these without renaming them.

// ── Map ────────────────────────────────────────────────────────────────────────

export interface FpsMapTile {
  /** Solid (wall) = true, walkable = false */
  solid: boolean
  /** Optional texture / color identifier */
  textureId?: string
}

export interface FpsMap {
  /** 2-D grid of tiles; map[row][col] */
  tiles: FpsMapTile[][]
  /** Width in tiles */
  width: number
  /** Height in tiles */
  height: number
  /** World-space units per tile */
  tileSize: number
  /** Player spawn position */
  spawnX: number
  spawnY: number
  /** Compass angle the player faces on spawn (degrees, 0 = east) */
  spawnAngle: number
}

// ── Entities ──────────────────────────────────────────────────────────────────

export interface FpsPlayer {
  /** Unique player id (peerId for multiplayer) */
  id: string
  /** World-space X position */
  x: number
  /** World-space Y position */
  y: number
  /** Camera / movement angle in degrees */
  angle: number
  /** Remaining health (0-100) */
  health: number
  /** Ammo in current magazine */
  ammo: number
  /** Player kill count */
  score: number
  /** True while the player is alive */
  alive: boolean
}

export interface FpsBullet {
  /** Unique bullet id */
  id: string
  /** Owner player id */
  ownerId: string
  /** World-space X origin */
  x: number
  /** World-space Y origin */
  y: number
  /** Direction angle in degrees */
  angle: number
  /** Remaining travel distance before the bullet despawns */
  range: number
}

export interface FpsEnemy {
  /** Unique enemy id */
  id: string
  /** World-space X position */
  x: number
  /** World-space Y position */
  y: number
  /** Facing angle in degrees */
  angle: number
  /** Remaining health */
  health: number
  /** True while the enemy is alive */
  alive: boolean
  /** Behaviour type; downstream tasks define the full union */
  kind: 'patrol' | 'chase' | 'stationary'
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
  backward: boolean
  /** Strafe left */
  strafeLeft: boolean
  /** Strafe right */
  strafeRight: boolean
  /** Turn left */
  turnLeft: boolean
  /** Turn right */
  turnRight: boolean
  /** Fire weapon */
  shoot: boolean
  /** Reload weapon */
  reload: boolean
  /** Mouse / pointer delta X (pixels) */
  mouseDeltaX: number
}

// ── Game State ─────────────────────────────────────────────────────────────────

export type FpsGamePhase = 'loading' | 'lobby' | 'playing' | 'paused' | 'roundOver'

export interface FpsGameState {
  /** Current phase of the game */
  phase: FpsGamePhase
  /** All connected players keyed by id */
  players: Record<string, FpsPlayer>
  /** All live bullets keyed by id */
  bullets: Record<string, FpsBullet>
  /** All enemies keyed by id */
  enemies: Record<string, FpsEnemy>
  /** The active map */
  map: FpsMap
  /** Monotonic tick counter (incremented every game-loop frame) */
  tick: number
  /** Elapsed ms since the round started */
  elapsedMs: number
}
