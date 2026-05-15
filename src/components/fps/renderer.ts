// ─── FPS Game – Canvas Renderer ──────────────────────────────────────────────
// Stub renderer that will paint raycasted walls, floor, ceiling, sprites,
// and the HUD onto a 2-D canvas.
// Downstream tasks will flesh out the drawing routines.

import type { FpsGameState } from './types'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface RenderFrameOptions {
  /** Target 2-D rendering context */
  ctx: CanvasRenderingContext2D
  /** Canvas width in CSS pixels */
  width: number
  /** Canvas height in CSS pixels */
  height: number
  /** Current game state snapshot */
  state: FpsGameState
  /** Id of the local player (used for first-person camera) */
  localPlayerId: string
  /** Horizontal field-of-view in degrees */
  fovDeg?: number
}

// ── Exported stub ──────────────────────────────────────────────────────────────

/**
 * Paint one frame of the FPS view to the given canvas context.
 *
 * Render order (to be implemented by downstream tasks):
 * 1. Clear / draw sky and floor gradients.
 * 2. For each screen column, cast a ray and draw the wall slice.
 * 3. Sort and draw sprites (enemies, bullets, items).
 * 4. Draw the HUD (crosshair, ammo, health).
 *
 * @stub Currently fills the canvas with a dark placeholder and returns early.
 */
export function renderFrame(options: RenderFrameOptions): void {
  const { ctx, width, height } = options

  // Placeholder: dark background
  ctx.fillStyle = '#0d1117'
  ctx.fillRect(0, 0, width, height)

  // TODO: implement raycasted wall rendering
  // TODO: implement sprite rendering
  // TODO: implement HUD rendering
}
