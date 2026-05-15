// ─── FPS Game – Raycasting stub ───────────────────────────────────────────────
// Exports the castRay() function with the correct signature.
// Downstream tasks will implement the DDA raycasting body.

import type { FpsMap, RayHit } from './types'

/** Options for the single-ray cast helper. */
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

/**
 * Cast a single ray through the tile map using DDA and return information
 * about the first solid tile it intersects, or `null` if it travels beyond
 * `maxDistance` without hitting anything.
 *
 * @stub Body is intentionally empty. Downstream tasks will fill it in.
 */
export function castRay(_options: CastRayOptions): RayHit | null {
  // TODO: implement DDA raycasting
  return null
}
