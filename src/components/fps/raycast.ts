// ─── FPS Game – Raycasting ────────────────────────────────────────────────────
// Stub implementation of a DDA (Digital Differential Analysis) ray-caster.
// Downstream tasks will replace the function body with real geometry code.

import type { FpsMap, RayHit } from './types'

// Re-export RayHit so downstream tasks can import it from either module.
export type { RayHit } from './types'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CastRayOptions {
  /** World-space origin X */
  originX: number
  /** World-space origin Y */
  originY: number
  /** Ray direction angle in radians */
  angle: number
  /** Maximum ray travel distance in world units */
  maxDistance: number
  /** The map to test against */
  map: FpsMap
  /** Screen column this ray represents */
  column: number
}

// ── Exported stub ──────────────────────────────────────────────────────────────

/**
 * Cast a single ray through the tile map and return information about the
 * first solid tile it intersects.
 *
 * @returns A {@link RayHit} if the ray struck a wall, or `null` if it
 *          travelled `maxDistance` without hitting anything.
 *
 * @stub This function currently returns `null` unconditionally.
 *       Downstream tasks should replace the body with a real DDA loop.
 */
export function castRay(_options: CastRayOptions): RayHit | null {
  // TODO: implement DDA raycasting
  return null
}
