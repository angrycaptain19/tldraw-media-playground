// ─── FPS Game – Enemy Logic ───────────────────────────────────────────────────
// Defines enemy spawn positions, AI behaviour (patrol / chase / stationary),
// and the per-frame enemy update function consumed by useGameLoop.
//
// Enemy kinds
//   'stationary' – stands still; always faces the nearest player
//   'patrol'     – moves back-and-forth along a fixed axis; turns to face
//                  the player when within detection range
//   'chase'      – moves directly toward the nearest player when in range;
//                  wanders randomly when no player is visible
//
// All enemies fire a bullet toward the player they are "aiming at" every
// ENEMY_FIRE_INTERVAL ticks while the player is within ENEMY_SIGHT_RANGE tiles
// and line-of-sight is clear.

import type { FpsEnemy, FpsMap, FpsPlayer, FpsBullet } from './types'

// ── Tunable constants ─────────────────────────────────────────────────────────

/** Max tiles an enemy can "see" the player */
const ENEMY_SIGHT_RANGE = 8

/** Enemy detection radius for switching from patrol/wander to chase (tiles) */
const ENEMY_DETECT_RANGE = 6

/** Tiles per frame a chase enemy moves */
const ENEMY_MOVE_SPEED = 0.025

/** Tiles per frame a patrol enemy moves */
const ENEMY_PATROL_SPEED = 0.018

/** Ticks between enemy shots */
const ENEMY_FIRE_INTERVAL = 90   // ~1.5 s at 60fps

/** Enemy bullet travel speed (tiles per frame) */
export const ENEMY_BULLET_SPEED = 0.12

/** Damage a single enemy bullet deals to the player */
export const ENEMY_BULLET_DAMAGE = 10

/** Enemy hit radius (world units) */
const ENEMY_HIT_RADIUS = 0.35

/** Starting health for every enemy */
const ENEMY_START_HEALTH = 50

/** Extra data we track per enemy that is NOT part of the public FpsEnemy type */
interface EnemyExtra {
  /** Ticks since last shot */
  fireCooldown: number
  /** Patrol waypoints (start and end X or Y) */
  patrolMin: number
  patrolMax: number
  /** Which axis to patrol along: 'x' | 'y' */
  patrolAxis: 'x' | 'y'
  /** +1 or -1 direction along the patrol axis */
  patrolDir: 1 | -1
  /** Wander angle (used when no player is visible in chase mode) */
  wanderAngle: number
  /** Ticks until wander direction changes */
  wanderTimer: number
}

/** Full internal enemy record */
export interface EnemyState extends FpsEnemy {
  _extra: EnemyExtra
}

// ── Spawn data ────────────────────────────────────────────────────────────────

/** Spawn descriptor for one enemy */
interface SpawnDescriptor {
  x: number
  y: number
  kind: FpsEnemy['kind']
  /** Initial angle in radians */
  angle?: number
  /** Override patrol range (defaults to ±2 tiles from spawn on X axis) */
  patrolAxis?: 'x' | 'y'
  patrolMin?: number
  patrolMax?: number
}

/** Default enemy spawns for MAP_01 (The Arena, 20×20) */
const MAP_01_ENEMY_SPAWNS: SpawnDescriptor[] = [
  // NE quadrant – stationary guard
  { x: 15.5, y:  2.5, kind: 'stationary' },
  // SW quadrant – stationary guard
  { x:  2.5, y: 17.5, kind: 'stationary' },
  // Centre – two chase enemies around the pillar ring
  { x: 9.5,  y:  9.5, kind: 'chase' },
  { x: 10.5, y: 10.5, kind: 'chase' },
  // East corridor – patrol (left-right)
  { x: 15.5, y:  6.5, kind: 'patrol', patrolAxis: 'x', patrolMin: 12, patrolMax: 18 },
  // West corridor – patrol (up-down)
  { x:  4.5, y: 12.5, kind: 'patrol', patrolAxis: 'y', patrolMin: 10, patrolMax: 15 },
  // North centre hallway – patrol
  { x:  9.5, y:  6.5, kind: 'patrol', patrolAxis: 'y', patrolMin: 2, patrolMax: 6 },
  // South centre hallway – patrol
  { x: 10.5, y: 13.5, kind: 'patrol', patrolAxis: 'y', patrolMin: 14, patrolMax: 18 },
]

// ── Factory ───────────────────────────────────────────────────────────────────

let _enemyIdCounter = 0

function makeEnemy(desc: SpawnDescriptor): EnemyState {
  const id = `enemy_${++_enemyIdCounter}`
  const patrolAxis = desc.patrolAxis ?? 'x'
  const patrolMin = desc.patrolMin ?? (patrolAxis === 'x' ? desc.x - 2 : desc.y - 2)
  const patrolMax = desc.patrolMax ?? (patrolAxis === 'x' ? desc.x + 2 : desc.y + 2)

  return {
    id,
    x: desc.x,
    y: desc.y,
    angle: desc.angle ?? 0,
    health: ENEMY_START_HEALTH,
    alive: true,
    kind: desc.kind,
    _extra: {
      fireCooldown: Math.floor(Math.random() * ENEMY_FIRE_INTERVAL),
      patrolMin,
      patrolMax,
      patrolAxis,
      patrolDir: 1,
      wanderAngle: Math.random() * Math.PI * 2,
      wanderTimer: 60 + Math.floor(Math.random() * 60),
    },
  }
}

/** Create the default enemy set for MAP_01 */
export function spawnEnemiesForMap01(): EnemyState[] {
  _enemyIdCounter = 0
  return MAP_01_ENEMY_SPAWNS.map(makeEnemy)
}

// ── Line-of-sight check (DDA walk) ───────────────────────────────────────────

/**
 * Returns true if the line segment from (x0,y0) to (x1,y1) is unobstructed
 * by walls in `map`.  Uses a simple DDA step.
 */
function hasLineOfSight(
  x0: number, y0: number,
  x1: number, y1: number,
  map: FpsMap,
): boolean {
  const dx = x1 - x0
  const dy = y1 - y0
  const d = Math.sqrt(dx * dx + dy * dy)
  if (d === 0) return true

  const steps = Math.ceil(d / 0.25)
  const stepX = dx / steps
  const stepY = dy / steps

  for (let i = 1; i < steps; i++) {
    const cx = x0 + stepX * i
    const cy = y0 + stepY * i
    const col = Math.floor(cx)
    const row = Math.floor(cy)
    if (
      row < 0 || row >= map.length ||
      col < 0 || col >= (map[0]?.length ?? 0)
    ) return false
    if ((map[row][col] ?? 1) > 0) return false
  }
  return true
}

/** Euclidean distance */
function enemyDist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2)
}

/** Is the tile at (x,y) a wall or out of bounds? */
function isWall(map: FpsMap, x: number, y: number): boolean {
  const col = Math.floor(x)
  const row = Math.floor(y)
  if (row < 0 || row >= map.length) return true
  if (col < 0 || col >= (map[0]?.length ?? 0)) return true
  return (map[row][col] ?? 1) > 0
}

// ── Enemy bullet type ─────────────────────────────────────────────────────────

/** An enemy-fired bullet */
export interface EnemyBullet {
  x: number
  y: number
  angle: number
}

// ── Per-frame update ──────────────────────────────────────────────────────────

export interface EnemyUpdateResult {
  /** Updated enemy list */
  enemies: EnemyState[]
  /** New bullets fired this frame by enemies */
  newBullets: EnemyBullet[]
}

/**
 * Advance all enemies by one game tick.
 * Handles movement, orientation, firing, and bullet-enemy hit detection.
 *
 * @param enemies       Current enemy states (mutated in place)
 * @param players       Both players (for targeting)
 * @param map           Tile map (for wall collision & LOS checks)
 * @param playerBullets All active player-fired bullets this frame
 * @param _tick         Current tick counter (unused; available for future use)
 * @returns             Updated enemies + any bullets the enemies fired
 */
export function updateEnemies(
  enemies: EnemyState[],
  players: readonly FpsPlayer[],
  map: FpsMap,
  playerBullets: FpsBullet[],
  _tick: number,
): EnemyUpdateResult {
  const newBullets: EnemyBullet[] = []

  // ── 1. Bullet → enemy collision ───────────────────────────────────────────
  const hitRadiusSq = ENEMY_HIT_RADIUS ** 2

  for (const bullet of playerBullets) {
    for (const enemy of enemies) {
      if (!enemy.alive) continue
      const dx = bullet.x - enemy.x
      const dy = bullet.y - enemy.y
      if (dx * dx + dy * dy < hitRadiusSq) {
        enemy.health -= 25  // player bullet damage
        if (enemy.health <= 0) {
          enemy.health = 0
          enemy.alive = false
        }
      }
    }
  }

  // ── 2. Enemy AI ───────────────────────────────────────────────────────────
  for (const enemy of enemies) {
    if (!enemy.alive) continue

    const ex = enemy._extra

    // Find nearest player
    let nearestPlayer = players[0]
    let nearestDist = enemyDist(enemy.x, enemy.y, players[0].x, players[0].y)
    for (let i = 1; i < players.length; i++) {
      const d = enemyDist(enemy.x, enemy.y, players[i].x, players[i].y)
      if (d < nearestDist) {
        nearestDist = d
        nearestPlayer = players[i]
      }
    }

    const canSeePlayer =
      nearestDist <= ENEMY_SIGHT_RANGE &&
      hasLineOfSight(enemy.x, enemy.y, nearestPlayer.x, nearestPlayer.y, map)

    // ── Aim angle toward player when visible ─────────────────────────────
    if (canSeePlayer) {
      enemy.angle = Math.atan2(
        nearestPlayer.y - enemy.y,
        nearestPlayer.x - enemy.x,
      )
    }

    // ── Kind-specific movement ────────────────────────────────────────────
    switch (enemy.kind) {
      case 'stationary': {
        // Just faces the player – no movement
        break
      }

      case 'patrol': {
        if (canSeePlayer && nearestDist <= ENEMY_DETECT_RANGE) {
          // Switch to chase behaviour when player is close
          const angle = Math.atan2(
            nearestPlayer.y - enemy.y,
            nearestPlayer.x - enemy.x,
          )
          const nx = enemy.x + Math.cos(angle) * ENEMY_MOVE_SPEED
          const ny = enemy.y + Math.sin(angle) * ENEMY_MOVE_SPEED
          if (!isWall(map, nx, enemy.y)) enemy.x = nx
          if (!isWall(map, enemy.x, ny)) enemy.y = ny
        } else {
          // Patrol back and forth
          const axis = ex.patrolAxis
          const coord = axis === 'x' ? enemy.x : enemy.y
          const newCoord = coord + ex.patrolDir * ENEMY_PATROL_SPEED

          if (newCoord >= ex.patrolMax) {
            ex.patrolDir = -1
          } else if (newCoord <= ex.patrolMin) {
            ex.patrolDir = 1
          }

          const step = ex.patrolDir * ENEMY_PATROL_SPEED
          if (axis === 'x') {
            const nx = enemy.x + step
            if (!isWall(map, nx, enemy.y)) enemy.x = nx
          } else {
            const ny = enemy.y + step
            if (!isWall(map, enemy.x, ny)) enemy.y = ny
          }

          // Face patrol direction
          if (!canSeePlayer) {
            enemy.angle = axis === 'x'
              ? (ex.patrolDir > 0 ? 0 : Math.PI)
              : (ex.patrolDir > 0 ? Math.PI / 2 : -Math.PI / 2)
          }
        }
        break
      }

      case 'chase': {
        if (canSeePlayer && nearestDist > ENEMY_HIT_RADIUS * 2) {
          // Move toward the player
          const angle = Math.atan2(
            nearestPlayer.y - enemy.y,
            nearestPlayer.x - enemy.x,
          )
          const nx = enemy.x + Math.cos(angle) * ENEMY_MOVE_SPEED
          const ny = enemy.y + Math.sin(angle) * ENEMY_MOVE_SPEED
          if (!isWall(map, nx, enemy.y)) enemy.x = nx
          if (!isWall(map, enemy.x, ny)) enemy.y = ny
        } else {
          // Wander randomly
          ex.wanderTimer--
          if (ex.wanderTimer <= 0) {
            ex.wanderAngle = Math.random() * Math.PI * 2
            ex.wanderTimer = 60 + Math.floor(Math.random() * 60)
          }
          enemy.angle = ex.wanderAngle
          const nx = enemy.x + Math.cos(ex.wanderAngle) * ENEMY_MOVE_SPEED
          const ny = enemy.y + Math.sin(ex.wanderAngle) * ENEMY_MOVE_SPEED
          if (isWall(map, nx, ny)) {
            // Bounce: pick a new wander direction next frame
            ex.wanderTimer = 0
          } else {
            if (!isWall(map, nx, enemy.y)) enemy.x = nx
            if (!isWall(map, enemy.x, ny)) enemy.y = ny
          }
        }
        break
      }
    }

    // ── Shooting ──────────────────────────────────────────────────────────
    ex.fireCooldown--
    if (ex.fireCooldown <= 0 && canSeePlayer) {
      // Add slight aim spread (±5°) for fairness
      const spread = (Math.random() - 0.5) * 0.17  // ~±5°
      newBullets.push({
        x: enemy.x,
        y: enemy.y,
        angle: enemy.angle + spread,
      })
      ex.fireCooldown = ENEMY_FIRE_INTERVAL
    } else if (ex.fireCooldown <= 0) {
      ex.fireCooldown = ENEMY_FIRE_INTERVAL
    }
  }

  return { enemies, newBullets }
}
