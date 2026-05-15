// ─── FPS Game – Canvas Renderer Component ────────────────────────────────────
// React component that draws a raycasted 3D view onto a <canvas> element.
//
// Rendering algorithm
//   1. Clear the canvas with two fillRect calls — ceiling (dark) + floor (grey).
//   2. For each screen column, use the pre-cast RayHit to determine wall-strip
//      height, pick a wall colour based on tileType, apply a brightness
//      multiplier for side (N/S = 100 %, E/W = 60 %), and draw a centred rect.
//   3. Re-draws whenever `rays` changes, keeping it in sync with the game loop.
//
// Side convention (from raycast.ts)
//   • side === 0  →  N/S face  (full brightness)
//   • side === 1  →  E/W face  (60 % brightness for depth cue)

import { useRef, useEffect, useCallback } from 'react'
import type { FpsGameState, RayHit, FpsEnemy } from './types'
import { castRays } from './raycast'

// ── Colour palette ─────────────────────────────────────────────────────────────

/**
 * Base wall colours (H, S, L) indexed by tile type.
 * tileType 0 is never a wall; types 1-N use indices 1-N.
 * Extra types wrap around.
 */
const WALL_COLORS_HSL: ReadonlyArray<readonly [number, number, number]> = [
  [0,   0,  50],   // 0 – unused (empty tile)
  [15,  70, 45],   // 1 – reddish-brown brick
  [210, 50, 40],   // 2 – slate blue stone
  [130, 45, 35],   // 3 – mossy green
  [45,  65, 45],   // 4 – sandy yellow
  [270, 40, 40],   // 5 – dusty purple
  [185, 55, 38],   // 6 – teal concrete
  [0,   0,  35],   // 7 – dark grey metal
]

/** Sky / ceiling colour */
const CEILING_COLOR = '#1a1a2e'

/** Floor colour */
const FLOOR_COLOR = '#3a3a3a'

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Convert HSL components to a CSS colour string, applying an optional
 * brightness multiplier (0-1) to the lightness.
 */
function hslToString(h: number, s: number, l: number, brightness: number): string {
  const adjL = Math.round(l * brightness)
  return `hsl(${h},${s}%,${adjL}%)`
}

/**
 * Pick the HSL tuple for a given tile type, wrapping for unknown types.
 */
function wallColorFor(tileType: number): readonly [number, number, number] {
  const idx = Math.max(1, tileType) % WALL_COLORS_HSL.length || 1
  return WALL_COLORS_HSL[idx]
}

// ── Enemy sprite renderer ─────────────────────────────────────────────────────
//
// Classic Z-sorted sprite projection:
//   1. Translate sprite to camera space.
//   2. Project onto the screen plane.
//   3. Clip each sprite column against the Z-buffer.
//   4. Draw a coloured rectangle (no texture atlas required).

/** Colours per enemy kind */
const ENEMY_COLORS: Record<FpsEnemy['kind'], string> = {
  stationary: '#dc2626',  // red
  patrol:     '#d97706',  // amber
  chase:      '#7c3aed',  // violet
}

/**
 * Render all enemies as flat-shaded sprites into the canvas context.
 */
function renderEnemySprites(
  ctx: CanvasRenderingContext2D,
  enemies: readonly FpsEnemy[],
  player: { x: number; y: number; angle: number },
  zBuffer: Float32Array,
  width: number,
  height: number,
  fov?: number,
): void {
  const defaultFov = 2 * Math.atan(0.66)
  const activeFov = fov ?? defaultFov
  const planeMag = Math.tan(activeFov / 2)

  const dirX = Math.cos(player.angle)
  const dirY = Math.sin(player.angle)
  const planeX = -dirY * planeMag
  const planeY =  dirX * planeMag

  // Sort enemies furthest-first so nearer ones are drawn on top
  const visible = enemies.filter((e) => e.alive).slice().sort((a, b) => {
    const da = (a.x - player.x) ** 2 + (a.y - player.y) ** 2
    const db = (b.x - player.x) ** 2 + (b.y - player.y) ** 2
    return db - da
  })

  for (const enemy of visible) {
    // Translate sprite relative to camera
    const sx = enemy.x - player.x
    const sy = enemy.y - player.y

    // Inverse camera matrix  [ planeX  dirX ]^-1
    const invDet = 1 / (planeX * dirY - dirX * planeY)
    const transformX = invDet * ( dirY * sx - dirX * sy)
    const transformY = invDet * (-planeY * sx + planeX * sy)

    // Sprite is behind the camera plane – skip
    if (transformY <= 0.1) continue

    const spriteScreenX = Math.round((width / 2) * (1 + transformX / transformY))

    // Sprite height on screen
    const spriteH = Math.abs(Math.round(height / transformY))
    const drawStartY = Math.max(0, Math.round((height - spriteH) / 2))
    const drawEndY   = Math.min(height, drawStartY + spriteH)

    // Sprite width (square sprite)
    const spriteW = Math.abs(Math.round(width / transformY * 0.5))
    const drawStartX = Math.max(0, spriteScreenX - Math.round(spriteW / 2))
    const drawEndX   = Math.min(width, spriteScreenX + Math.round(spriteW / 2))

    if (drawStartX >= drawEndX) continue

    const color = ENEMY_COLORS[enemy.kind] ?? '#ffffff'

    // Draw sprite column by column, respecting the Z-buffer
    for (let stripe = drawStartX; stripe < drawEndX; stripe++) {
      if (stripe < 0 || stripe >= width) continue
      if (transformY >= zBuffer[stripe]) continue  // wall is closer

      ctx.fillStyle = color
      ctx.fillRect(stripe, drawStartY, 1, drawEndY - drawStartY)
    }

    // Draw a dark outline/edge strip for visual distinction (optional)
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.fillRect(drawStartX, drawStartY, 1, drawEndY - drawStartY)
    ctx.fillRect(drawEndX - 1, drawStartY, 1, drawEndY - drawStartY)

    // Health bar above sprite
    const hpBarW = Math.max(4, spriteW)
    const hpBarX = spriteScreenX - Math.round(hpBarW / 2)
    const hpBarY = drawStartY - 7
    if (hpBarY >= 0 && hpBarX >= 0 && hpBarX + hpBarW <= width) {
      const hpFrac = Math.max(0, enemy.health / 50)
      ctx.fillStyle = '#1e293b'
      ctx.fillRect(hpBarX, hpBarY, hpBarW, 4)
      ctx.fillStyle = hpFrac > 0.5 ? '#22c55e' : hpFrac > 0.25 ? '#f59e0b' : '#ef4444'
      ctx.fillRect(hpBarX, hpBarY, Math.round(hpBarW * hpFrac), 4)
    }
  }
}

// ── Props ──────────────────────────────────────────────────────────────────────

export interface FpsRendererProps {
  /** Full game state snapshot (used for player position + map). */
  state: FpsGameState
  /**
   * Pre-cast ray hits for this frame.
   * When provided, the renderer uses them directly (no internal castRays call).
   * When omitted or when the array length does not match `width`, the renderer
   * calls `castRays` internally given `playerIndex` + state.
   */
  rays?: RayHit[]
  /** Canvas render width in pixels. */
  width: number
  /** Canvas render height in pixels. */
  height: number
  /**
   * Which player's perspective to render from (default: 0).
   * Only used when `rays` is not provided.
   */
  playerIndex?: 0 | 1
  /** Horizontal field-of-view in radians (default: ~66 degrees via camera-plane 0.66). */
  fov?: number
}

// ── Component ──────────────────────────────────────────────────────────────────

/**
 * `<FpsRenderer>` renders one frame of the FPS 3D view onto a `<canvas>`.
 *
 * It uses `useRef<HTMLCanvasElement>` and `useEffect` to redraw whenever the
 * `rays` prop (or `state`) changes, making it suitable for use at 60fps when
 * composed with `useGameLoop`.
 */
export function FpsRenderer({
  state,
  rays,
  width,
  height,
  playerIndex = 0,
  fov,
}: FpsRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // ── Obtain ray hits ────────────────────────────────────────────────────
    let hits: RayHit[]
    if (rays && rays.length === width) {
      hits = rays
    } else {
      const player = state.players[playerIndex]
      hits = castRays(player, state.map, width, fov)
    }

    const halfH = height / 2

    // ── 1. Ceiling (top half) ──────────────────────────────────────────────
    ctx.fillStyle = CEILING_COLOR
    ctx.fillRect(0, 0, width, halfH)

    // ── 2. Floor (bottom half) ─────────────────────────────────────────────
    ctx.fillStyle = FLOOR_COLOR
    ctx.fillRect(0, halfH, width, halfH)

    // ── 3. Wall strips (one fillRect per column) ───────────────────────────
    // Also build a Z-buffer (perpendicular distance per column) for sprite clipping
    const zBuffer = new Float32Array(width)
    for (let col = 0; col < width; col++) {
      const hit = hits[col]
      if (!hit) continue

      // Perpendicular distance -> wall-strip height (classic formula)
      const stripH = Math.min(height, Math.round(height / hit.distance))

      // Vertical centre of the strip
      const drawY = Math.round((height - stripH) / 2)

      // Brightness: N/S face = 100 %, E/W face = 60 %
      const brightness = hit.side === 0 ? 1.0 : 0.6

      const [h, s, l] = wallColorFor(hit.tileType)
      ctx.fillStyle = hslToString(h, s, l, brightness)

      ctx.fillRect(col, drawY, 1, stripH)
      zBuffer[col] = hit.distance
    }

    // ── 4. Enemy sprites ────────────────────────────────────────────────────
    const player = state.players[playerIndex]
    renderEnemySprites(ctx, state.enemies, player, zBuffer, width, height, fov)
  }, [state, rays, width, height, playerIndex, fov])

  // Redraw on every render / whenever deps change
  useEffect(() => {
    draw()
  }, [draw])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ display: 'block', imageRendering: 'pixelated' }}
      aria-label="FPS 3D view"
    />
  )
}

export default FpsRenderer
