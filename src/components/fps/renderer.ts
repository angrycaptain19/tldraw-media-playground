// ─── FPS Game – Canvas Renderer stub ─────────────────────────────────────────
// Exports renderFrame() — paints the raycasted view onto a 2-D canvas context.
// Downstream tasks will implement wall slices, sprites, and the HUD.

import type { FpsGameState } from './types'

export interface RenderFrameOptions {
  /** Target 2-D rendering context */
  ctx: CanvasRenderingContext2D
  /** Canvas width in CSS pixels */
  width: number
  /** Canvas height in CSS pixels */
  height: number
  /** Current game state snapshot */
  state: FpsGameState
  /** Which player's perspective to render from */
  playerIndex: 0 | 1
  /** Horizontal field-of-view in degrees */
  fovDeg?: number
}

/**
 * Paint one frame of the FPS view to the given canvas context.
 *
 * @stub Fills the canvas with a dark placeholder.
 *       Downstream tasks will implement raycasted walls, sprites, and HUD.
 */
export function renderFrame(options: RenderFrameOptions): void {
  const { ctx, width, height } = options

  // Placeholder: dark background
  ctx.fillStyle = '#0d1117'
  ctx.fillRect(0, 0, width, height)

  // TODO: draw sky and floor gradients
  // TODO: cast one ray per screen column and draw wall slices
  // TODO: sort and draw sprites (enemies, bullets, items)
  // TODO: draw HUD (crosshair, ammo, health)
}
