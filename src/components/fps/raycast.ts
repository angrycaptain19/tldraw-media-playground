// ─── FPS Game – Raycasting ────────────────────────────────────────────────────
// Stub implementation of a DDA (Digital Differential Analysis) ray-caster.
// Downstream tasks will replace the function body with real geometry code.

import type { FpsMap } from './types'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface RayHit {
  /** How far from the origin the ray hit something (world units) */
  distance: number
  /** Column index on the screen that this ray was cast for */
  column: number
  /** Whether the ray hit the vertical (N/S) or horizontal (E/W) face of a tile */
  side: 'vertical' | 'horizontal'
  /** Grid X of the tile that was hit */
  tileX: number
  /** Grid Y of the tile that was hit */
  tileY: number
  /** Optional texture id from the hit tile */
  textureId?: string
}

export interface CastRayOptions {
  /** World-space origin X */
  originX: number
  /** World-space origin Y */
  originY: number
  /** Ray direction angle in degrees (0 = east, clockwise) */
  angleDeg: number
  /** Maximum ray travel distance in world units */
  maxDistance: number
  /** The map to test against */
  map: FpsMap
  /** Screen column this ray represents (used to populate RayHit.column) */
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
