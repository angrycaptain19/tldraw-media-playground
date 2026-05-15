// ─── FPS Game – Canvas Renderer Component ────────────────────────────────────
// React component that draws a raycasted 3D view onto a <canvas> element.
//
// Rendering algorithm
//   1. Clear the canvas with two fillRect calls — ceiling (dark) + floor (grey).
//   2. For each screen column, use the pre-cast RayHit to determine wall-strip
//      height, pick a wall colour based on tileType, apply a brightness
//      multiplier for side (N/S = 100 %, E/W = 60 %), and draw a centred rect.
//   3. Draw the player's gun sprite at the bottom of the screen with bob
//      animation (walking) and recoil animation (firing).
//   4. Re-draws whenever `rays` changes, keeping it in sync with the game loop.
//
// Side convention (from raycast.ts)
//   • side === 0  →  N/S face  (full brightness)
//   • side === 1  →  E/W face  (60 % brightness for depth cue)
//
// Gun rendering
//   A pixel-art style pistol is drawn procedurally using canvas 2D shapes.
//   • Bobbing: position oscillates vertically as the player walks, derived
//     from player position changes between frames.
//   • Recoil: when a bullet is fired (bullets array gains a new entry from
//     this player), the gun slides up then snaps back over ~14 frames.
//   • Muzzle flash: a bright radial gradient is shown for ~8 frames after
//     firing.

import { useRef, useEffect, useCallback } from 'react'
import type { FpsGameState, RayHit } from './types'
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

// ── Gun animation constants ────────────────────────────────────────────────────

/** Total recoil animation duration in frames */
const RECOIL_FRAMES = 14

/** Peak upward recoil offset as a fraction of canvas height */
const RECOIL_LIFT_RATIO = 0.08

/** How many degrees the gun tilts back during recoil */
const RECOIL_TILT_DEG = 12

/** Bob cycle: full period in game ticks when walking */
const BOB_PERIOD = 30

/** Maximum vertical bob amplitude as a fraction of canvas height */
const BOB_AMP_RATIO = 0.025

/** Minimum distance moved per frame to count as "walking" */
const WALK_THRESHOLD = 0.001

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

// ── Gun drawing ────────────────────────────────────────────────────────────────

/**
 * Draw a procedural pixel-art style gun sprite onto the canvas context.
 *
 * The gun is positioned in the lower-right quadrant of the screen, matching
 * the classic FPS hand-held weapon aesthetic.
 *
 * @param ctx         Canvas 2D context
 * @param width       Canvas width in pixels
 * @param height      Canvas height in pixels
 * @param bobY        Vertical bob offset in pixels (positive = gun moves down)
 * @param recoilY     Vertical recoil offset (positive = gun moves up)
 * @param recoilAngle Rotation angle in radians (tilt back during recoil)
 * @param showFlash   Whether to render a muzzle flash
 */
function drawGun(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  bobY: number,
  recoilY: number,
  recoilAngle: number,
  showFlash: boolean,
): void {
  // Scale all dimensions relative to canvas height so the gun looks right
  // on any viewport size.
  const scale = height / 480

  // ── Anchor point: gun rests in lower-right, partially clipped off-screen ─
  // recoilY is positive when gun kicks UP, so we subtract it from anchorY
  const anchorX = width  * 0.68
  const anchorY = height * 0.90 + bobY - recoilY

  // Gun part sizes (all measured at scale=1, i.e. 480px canvas height)
  const slideW  = 80  * scale   // slide (top of pistol) width
  const slideH  = 32  * scale   // slide height
  const gripW   = 38  * scale   // grip width
  const gripH   = 54  * scale   // grip height
  const barrelW = 70  * scale   // barrel length
  const barrelH = 14  * scale   // barrel outer height
  const guardW  = 28  * scale   // trigger guard width
  const guardH  = 18  * scale   // trigger guard height
  const trigW   = 6   * scale   // trigger width
  const trigH   = 14  * scale   // trigger height

  ctx.save()

  // ── Apply recoil tilt around grip centre ─────────────────────────────────
  ctx.translate(anchorX + gripW * 0.5, anchorY)
  ctx.rotate(recoilAngle)
  ctx.translate(-(anchorX + gripW * 0.5), -anchorY)

  // ── Drop shadow ──────────────────────────────────────────────────────────
  ctx.shadowColor    = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur     = 8 * scale
  ctx.shadowOffsetX  = 3 * scale
  ctx.shadowOffsetY  = 4 * scale

  // ── Grip (trapezoid, slightly wider at bottom) ───────────────────────────
  const gripX = anchorX
  const gripY = anchorY - gripH

  ctx.beginPath()
  ctx.moveTo(gripX + 4 * scale,           gripY)
  ctx.lineTo(gripX + gripW - 2 * scale,   gripY - 3 * scale)
  ctx.lineTo(gripX + gripW + 5 * scale,   gripY + gripH)
  ctx.lineTo(gripX - 2 * scale,           gripY + gripH)
  ctx.closePath()
  ctx.fillStyle = '#252525'
  ctx.fill()

  // Grip texture – thin highlight lines
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'
  ctx.lineWidth = 1.5 * scale
  for (let i = 0; i < 3; i++) {
    const lx = gripX + 8 * scale + i * 10 * scale
    ctx.beginPath()
    ctx.moveTo(lx,              gripY + 10 * scale)
    ctx.lineTo(lx - 3 * scale, gripY + gripH - 8 * scale)
    ctx.stroke()
  }

  // ── Slide (main rectangular body sitting on top of grip) ─────────────────
  const slideX = anchorX - 4 * scale
  const slideY = anchorY - gripH * 0.6 - slideH

  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.fillStyle   = '#4a4a4a'
  ctx.beginPath()
  // roundRect may not exist in all environments – fall back to fillRect
  if (ctx.roundRect) {
    ctx.roundRect(slideX, slideY, slideW, slideH, 3 * scale)
  } else {
    ctx.rect(slideX, slideY, slideW, slideH)
  }
  ctx.fill()

  // Slide top highlight
  ctx.shadowBlur   = 0
  ctx.strokeStyle  = 'rgba(255,255,255,0.16)'
  ctx.lineWidth    = 2 * scale
  ctx.beginPath()
  ctx.moveTo(slideX + 4 * scale, slideY + 2 * scale)
  ctx.lineTo(slideX + slideW - 4 * scale, slideY + 2 * scale)
  ctx.stroke()

  // Ejection port
  const ejX = slideX + slideW * 0.38
  const ejY = slideY + slideH * 0.25
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(ejX, ejY, 22 * scale, 13 * scale)

  // ── Barrel (extends forward from slide) ──────────────────────────────────
  const barrelX = slideX + slideW - 8 * scale
  const barrelY = slideY + slideH * 0.5 - barrelH * 0.5

  ctx.fillStyle = '#383838'
  ctx.shadowBlur = 4 * scale
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.beginPath()
  if (ctx.roundRect) {
    ctx.roundRect(barrelX, barrelY, barrelW, barrelH, 2 * scale)
  } else {
    ctx.rect(barrelX, barrelY, barrelW, barrelH)
  }
  ctx.fill()

  // Muzzle ring
  const muzzleX = barrelX + barrelW
  const muzzleY = barrelY + barrelH / 2
  ctx.shadowBlur = 0
  ctx.strokeStyle = '#777'
  ctx.lineWidth   = 2.5 * scale
  ctx.beginPath()
  ctx.arc(muzzleX - 2 * scale, muzzleY, barrelH * 0.62, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = '#111'
  ctx.fill()

  // ── Trigger guard (curved arc below grip junction) ───────────────────────
  const tgX = anchorX + 2 * scale
  const tgY = gripY + gripH * 0.08

  ctx.strokeStyle = '#3a3a3a'
  ctx.lineWidth   = 4.5 * scale
  ctx.beginPath()
  ctx.moveTo(tgX, tgY)
  ctx.quadraticCurveTo(
    tgX + guardW * 0.5, tgY + guardH * 1.5,
    tgX + guardW,       tgY,
  )
  ctx.stroke()

  // Trigger
  ctx.fillStyle = '#555'
  ctx.fillRect(tgX + guardW * 0.38, tgY + 2 * scale, trigW, trigH)

  // ── Front sight ───────────────────────────────────────────────────────────
  ctx.fillStyle = '#aaa'
  ctx.fillRect(barrelX + barrelW * 0.82, barrelY - 5 * scale, 4 * scale, 6 * scale)

  // ── Rear sight ────────────────────────────────────────────────────────────
  ctx.fillStyle = '#777'
  ctx.fillRect(slideX + 3 * scale, slideY - 4 * scale, 14 * scale, 5 * scale)
  // Notch in rear sight
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(slideX + 7 * scale, slideY - 4 * scale, 4 * scale, 5 * scale)

  ctx.restore()
  ctx.save()

  // ── Muzzle flash (drawn without the recoil transform so it anchors to
  //    screen coords, giving a more dynamic look) ─────────────────────────
  if (showFlash) {
    // Approximate muzzle screen position (ignores tilt; close enough for effect)
    const fx = muzzleX
    const fy = muzzleY - recoilY

    // Outer glow
    const outer = ctx.createRadialGradient(fx, fy, 0, fx, fy, 42 * scale)
    outer.addColorStop(0,   'rgba(255,210,60,0.95)')
    outer.addColorStop(0.3, 'rgba(255,120,20,0.75)')
    outer.addColorStop(0.7, 'rgba(255,60,0,0.3)')
    outer.addColorStop(1,   'rgba(255,60,0,0)')
    ctx.fillStyle = outer
    ctx.beginPath()
    ctx.arc(fx, fy, 42 * scale, 0, Math.PI * 2)
    ctx.fill()

    // Bright core
    const core = ctx.createRadialGradient(fx, fy, 0, fx, fy, 16 * scale)
    core.addColorStop(0, 'rgba(255,255,220,1)')
    core.addColorStop(1, 'rgba(255,180,40,0)')
    ctx.fillStyle = core
    ctx.beginPath()
    ctx.arc(fx, fy, 16 * scale, 0, Math.PI * 2)
    ctx.fill()

    // Star-burst spokes
    ctx.strokeStyle = 'rgba(255,230,90,0.85)'
    ctx.lineWidth   = 2 * scale
    const spokeCount = 6
    for (let i = 0; i < spokeCount; i++) {
      const a = (i / spokeCount) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(fx + Math.cos(a) * 7  * scale, fy + Math.sin(a) * 7  * scale)
      ctx.lineTo(fx + Math.cos(a) * 32 * scale, fy + Math.sin(a) * 32 * scale)
      ctx.stroke()
    }
  }

  ctx.restore()
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
 *
 * A procedural gun sprite is rendered at the bottom-right of the screen with:
 *  - Walking bob: vertical oscillation derived from player position delta.
 *  - Firing recoil: upward kick + backward tilt when a fresh bullet is detected.
 *  - Muzzle flash: bright radial glow for the first portion of the recoil cycle.
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

  // ── Gun animation state (mutable refs – no re-renders needed) ─────────────

  /** Previous player position for walk-speed detection */
  const prevPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  /** Accumulated walk-bob phase (radians) */
  const bobPhaseRef = useRef<number>(0)

  /** Remaining recoil frames (counts down from RECOIL_FRAMES → 0) */
  const recoilFrameRef = useRef<number>(0)

  /**
   * The game tick on which we last triggered a recoil, used to avoid
   * re-triggering while the same bullet is still in flight.
   */
  const lastFireTickRef = useRef<number>(-1)

  // ── Draw ───────────────────────────────────────────────────────────────────

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
    }

    // ── 4. Gun sprite ──────────────────────────────────────────────────────

    const player = state.players[playerIndex]

    // ── Bob: detect walking from player position delta ─────────────────────
    const prev  = prevPosRef.current
    const dx    = player.x - prev.x
    const dy    = player.y - prev.y
    const speed = Math.sqrt(dx * dx + dy * dy)
    const isWalking = speed > WALK_THRESHOLD

    prevPosRef.current = { x: player.x, y: player.y }

    if (isWalking) {
      bobPhaseRef.current += (2 * Math.PI) / BOB_PERIOD
    } else {
      // Smoothly coast toward the nearest zero crossing so the gun doesn't
      // snap when the player stops.
      const phase = bobPhaseRef.current % (Math.PI * 2)
      if (phase > 0.08) {
        bobPhaseRef.current += 0.12
      }
    }

    const bobAmp = height * BOB_AMP_RATIO
    const bobY   = Math.sin(bobPhaseRef.current) * bobAmp

    // ── Recoil: detect a freshly-spawned bullet from this player ──────────
    // A bullet is "fresh" if it's within 0.6 world-units of the player
    // (the game loop moves bullets by BULLET_SPEED=0.15 per tick before
    // storing them in state, so a newly-fired bullet is ~0.15 ahead).
    const currentTick = state.tick
    const hasFreshBullet = state.bullets.some((b) => {
      if (b.ownerId !== playerIndex) return false
      const bx = b.x - player.x
      const by = b.y - player.y
      return bx * bx + by * by < 0.6 * 0.6
    })

    if (hasFreshBullet && lastFireTickRef.current !== currentTick) {
      recoilFrameRef.current = RECOIL_FRAMES
      lastFireTickRef.current = currentTick
    }

    // Recoil envelope: decays linearly from 1 → 0 over RECOIL_FRAMES ticks
    const decayT    = recoilFrameRef.current / RECOIL_FRAMES
    const recoilY   = height * RECOIL_LIFT_RATIO * decayT
    const recoilAng = -(RECOIL_TILT_DEG * decayT) * (Math.PI / 180)
    // Show muzzle flash for the first ~55 % of the recoil animation
    const showFlash = recoilFrameRef.current > RECOIL_FRAMES * 0.45

    if (recoilFrameRef.current > 0) recoilFrameRef.current -= 1

    drawGun(ctx, width, height, bobY, recoilY, recoilAng, showFlash)

    // ── 5. Crosshair (centre dot + gap lines) ─────────────────────────────
    const cx = width / 2
    const cy = height / 2
    const cSize = Math.max(4, height * 0.018)
    const cGap  = Math.max(2, height * 0.008)
    ctx.save()
    ctx.strokeStyle = showFlash ? 'rgba(255,200,60,0.95)' : 'rgba(255,255,255,0.85)'
    ctx.lineWidth = Math.max(1.5, height * 0.004)
    ctx.shadowColor = 'rgba(0,0,0,0.8)'
    ctx.shadowBlur  = 3
    // horizontal lines
    ctx.beginPath()
    ctx.moveTo(cx - cSize - cGap, cy)
    ctx.lineTo(cx - cGap, cy)
    ctx.moveTo(cx + cGap, cy)
    ctx.lineTo(cx + cSize + cGap, cy)
    // vertical lines
    ctx.moveTo(cx, cy - cSize - cGap)
    ctx.lineTo(cx, cy - cGap)
    ctx.moveTo(cx, cy + cGap)
    ctx.lineTo(cx, cy + cSize + cGap)
    ctx.stroke()
    // centre dot
    ctx.fillStyle = showFlash ? 'rgba(255,200,60,0.95)' : 'rgba(255,255,255,0.9)'
    ctx.beginPath()
    ctx.arc(cx, cy, Math.max(1.5, height * 0.003), 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
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
