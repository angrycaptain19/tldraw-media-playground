// ─── FPS Game – Canvas Renderer Component ────────────────────────────────────
// React component that draws a raycasted 3D view onto a <canvas> element.
//
// Rendering algorithm
//   1. Clear the canvas with two fillRect calls — ceiling (dark) + floor (grey).
//   2. For each screen column, use the pre-cast RayHit to determine wall-strip
//      height, pick a wall colour based on tileType, apply a brightness
//      multiplier for side (N/S = 100 %, E/W = 60 %), and draw a centred rect.
//   3. Render enemy sprites (Z-sorted, clipped against the wall Z-buffer).
//   4. Draw the player's gun sprite at the bottom of the screen with bob
//      animation (walking) and recoil animation (firing).
//   5. Re-draws whenever `rays` changes, keeping it in sync with the game loop.
//
// Side convention (from raycast.ts)
//   . side === 0  ->  N/S face  (full brightness)
//   . side === 1  ->  E/W face  (60 % brightness for depth cue)
//
// Gun rendering
//   A pixel-art style pistol is drawn procedurally using canvas 2D shapes.
//   . Bobbing: position oscillates vertically as the player walks, derived
//     from player position changes between frames.
//   . Recoil: when a bullet is fired (bullets array gains a new entry from
//     this player), the gun slides up then snaps back over ~14 frames.
//   . Muzzle flash: a bright radial gradient is shown for ~8 frames after
//     firing.

import { useRef, useEffect, useCallback } from 'react'
import type { FpsGameState, RayHit, FpsEnemy } from './types'
import { castRays } from './raycast'

// -- Colour palette -------------------------------------------------------------

const WALL_COLORS_HSL: ReadonlyArray<readonly [number, number, number]> = [
  [0,   0,  50],
  [15,  70, 45],
  [210, 50, 40],
  [130, 45, 35],
  [45,  65, 45],
  [270, 40, 40],
  [185, 55, 38],
  [0,   0,  35],
]

const CEILING_COLOR = '#1a1a2e'
const FLOOR_COLOR = '#3a3a3a'

// -- Gun animation constants ----------------------------------------------------

const RECOIL_FRAMES = 14
const RECOIL_LIFT_RATIO = 0.08
const RECOIL_TILT_DEG = 12
const BOB_PERIOD = 30
const BOB_AMP_RATIO = 0.025
const WALK_THRESHOLD = 0.001

// -- Helpers --------------------------------------------------------------------

function hslToString(h: number, s: number, l: number, brightness: number): string {
  const adjL = Math.round(l * brightness)
  return `hsl(${h},${s}%,${adjL}%)`
}

function wallColorFor(tileType: number): readonly [number, number, number] {
  const idx = Math.max(1, tileType) % WALL_COLORS_HSL.length || 1
  return WALL_COLORS_HSL[idx]
}

// -- Enemy sprite renderer ------------------------------------------------------

const ENEMY_COLORS: Record<FpsEnemy['kind'], string> = {
  stationary: '#dc2626',
  patrol:     '#d97706',
  chase:      '#7c3aed',
}

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

  const visible = enemies.filter((e) => e.alive).slice().sort((a, b) => {
    const da = (a.x - player.x) ** 2 + (a.y - player.y) ** 2
    const db = (b.x - player.x) ** 2 + (b.y - player.y) ** 2
    return db - da
  })

  for (const enemy of visible) {
    const sx = enemy.x - player.x
    const sy = enemy.y - player.y

    const invDet = 1 / (planeX * dirY - dirX * planeY)
    const transformX = invDet * ( dirY * sx - dirX * sy)
    const transformY = invDet * (-planeY * sx + planeX * sy)

    if (transformY <= 0.1) continue

    const spriteScreenX = Math.round((width / 2) * (1 + transformX / transformY))

    const spriteH = Math.abs(Math.round(height / transformY))
    const drawStartY = Math.max(0, Math.round((height - spriteH) / 2))
    const drawEndY   = Math.min(height, drawStartY + spriteH)

    const spriteW = Math.abs(Math.round(width / transformY * 0.5))
    const drawStartX = Math.max(0, spriteScreenX - Math.round(spriteW / 2))
    const drawEndX   = Math.min(width, spriteScreenX + Math.round(spriteW / 2))

    if (drawStartX >= drawEndX) continue

    const color = ENEMY_COLORS[enemy.kind] ?? '#ffffff'

    for (let stripe = drawStartX; stripe < drawEndX; stripe++) {
      if (stripe < 0 || stripe >= width) continue
      if (transformY >= zBuffer[stripe]) continue

      ctx.fillStyle = color
      ctx.fillRect(stripe, drawStartY, 1, drawEndY - drawStartY)
    }

    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.fillRect(drawStartX, drawStartY, 1, drawEndY - drawStartY)
    ctx.fillRect(drawEndX - 1, drawStartY, 1, drawEndY - drawStartY)

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

// -- Gun drawing ----------------------------------------------------------------

function drawGun(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  bobY: number,
  recoilY: number,
  recoilAngle: number,
  showFlash: boolean,
): void {
  const scale = height / 480

  const anchorX = width  * 0.68
  const anchorY = height * 0.90 + bobY - recoilY

  const slideW  = 80  * scale
  const slideH  = 32  * scale
  const gripW   = 38  * scale
  const gripH   = 54  * scale
  const barrelW = 70  * scale
  const barrelH = 14  * scale
  const guardW  = 28  * scale
  const guardH  = 18  * scale
  const trigW   = 6   * scale
  const trigH   = 14  * scale

  ctx.save()

  ctx.translate(anchorX + gripW * 0.5, anchorY)
  ctx.rotate(recoilAngle)
  ctx.translate(-(anchorX + gripW * 0.5), -anchorY)

  ctx.shadowColor    = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur     = 8 * scale
  ctx.shadowOffsetX  = 3 * scale
  ctx.shadowOffsetY  = 4 * scale

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

  ctx.strokeStyle = 'rgba(255,255,255,0.07)'
  ctx.lineWidth = 1.5 * scale
  for (let i = 0; i < 3; i++) {
    const lx = gripX + 8 * scale + i * 10 * scale
    ctx.beginPath()
    ctx.moveTo(lx,              gripY + 10 * scale)
    ctx.lineTo(lx - 3 * scale, gripY + gripH - 8 * scale)
    ctx.stroke()
  }

  const slideX = anchorX - 4 * scale
  const slideY = anchorY - gripH * 0.6 - slideH

  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.fillStyle   = '#4a4a4a'
  ctx.beginPath()
  if (ctx.roundRect) {
    ctx.roundRect(slideX, slideY, slideW, slideH, 3 * scale)
  } else {
    ctx.rect(slideX, slideY, slideW, slideH)
  }
  ctx.fill()

  ctx.shadowBlur   = 0
  ctx.strokeStyle  = 'rgba(255,255,255,0.16)'
  ctx.lineWidth    = 2 * scale
  ctx.beginPath()
  ctx.moveTo(slideX + 4 * scale, slideY + 2 * scale)
  ctx.lineTo(slideX + slideW - 4 * scale, slideY + 2 * scale)
  ctx.stroke()

  const ejX = slideX + slideW * 0.38
  const ejY = slideY + slideH * 0.25
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(ejX, ejY, 22 * scale, 13 * scale)

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

  ctx.fillStyle = '#555'
  ctx.fillRect(tgX + guardW * 0.38, tgY + 2 * scale, trigW, trigH)

  ctx.fillStyle = '#aaa'
  ctx.fillRect(barrelX + barrelW * 0.82, barrelY - 5 * scale, 4 * scale, 6 * scale)

  ctx.fillStyle = '#777'
  ctx.fillRect(slideX + 3 * scale, slideY - 4 * scale, 14 * scale, 5 * scale)
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(slideX + 7 * scale, slideY - 4 * scale, 4 * scale, 5 * scale)

  ctx.restore()
  ctx.save()

  if (showFlash) {
    const fx = muzzleX
    const fy = muzzleY - recoilY

    const outer = ctx.createRadialGradient(fx, fy, 0, fx, fy, 42 * scale)
    outer.addColorStop(0,   'rgba(255,210,60,0.95)')
    outer.addColorStop(0.3, 'rgba(255,120,20,0.75)')
    outer.addColorStop(0.7, 'rgba(255,60,0,0.3)')
    outer.addColorStop(1,   'rgba(255,60,0,0)')
    ctx.fillStyle = outer
    ctx.beginPath()
    ctx.arc(fx, fy, 42 * scale, 0, Math.PI * 2)
    ctx.fill()

    const core = ctx.createRadialGradient(fx, fy, 0, fx, fy, 16 * scale)
    core.addColorStop(0, 'rgba(255,255,220,1)')
    core.addColorStop(1, 'rgba(255,180,40,0)')
    ctx.fillStyle = core
    ctx.beginPath()
    ctx.arc(fx, fy, 16 * scale, 0, Math.PI * 2)
    ctx.fill()

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

// -- Props ----------------------------------------------------------------------

export interface FpsRendererProps {
  state: FpsGameState
  rays?: RayHit[]
  width: number
  height: number
  playerIndex?: 0 | 1
  fov?: number
}

// -- Component ------------------------------------------------------------------

export function FpsRenderer({
  state,
  rays,
  width,
  height,
  playerIndex = 0,
  fov,
}: FpsRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const prevPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const bobPhaseRef = useRef<number>(0)
  const recoilFrameRef = useRef<number>(0)
  const lastFireTickRef = useRef<number>(-1)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let hits: RayHit[]
    if (rays && rays.length === width) {
      hits = rays
    } else {
      const player = state.players[playerIndex]
      hits = castRays(player, state.map, width, fov)
    }

    const halfH = height / 2

    ctx.fillStyle = CEILING_COLOR
    ctx.fillRect(0, 0, width, halfH)

    ctx.fillStyle = FLOOR_COLOR
    ctx.fillRect(0, halfH, width, halfH)

    const zBuffer = new Float32Array(width)
    for (let col = 0; col < width; col++) {
      const hit = hits[col]
      if (!hit) continue

      const stripH = Math.min(height, Math.round(height / hit.distance))
      const drawY = Math.round((height - stripH) / 2)
      const brightness = hit.side === 0 ? 1.0 : 0.6

      const [h, s, l] = wallColorFor(hit.tileType)
      ctx.fillStyle = hslToString(h, s, l, brightness)
      ctx.fillRect(col, drawY, 1, stripH)
      zBuffer[col] = hit.distance
    }

    const player = state.players[playerIndex]
    renderEnemySprites(ctx, state.enemies, player, zBuffer, width, height, fov)

    // -- Gun bob animation -------------------------------------------------------
    const prev  = prevPosRef.current
    const dx    = player.x - prev.x
    const dy    = player.y - prev.y
    const speed = Math.sqrt(dx * dx + dy * dy)
    const isWalking = speed > WALK_THRESHOLD

    prevPosRef.current = { x: player.x, y: player.y }

    if (isWalking) {
      bobPhaseRef.current += (2 * Math.PI) / BOB_PERIOD
    } else {
      const phase = bobPhaseRef.current % (Math.PI * 2)
      if (phase > 0.08) {
        bobPhaseRef.current += 0.12
      }
    }

    const bobAmp = height * BOB_AMP_RATIO
    const bobY   = Math.sin(bobPhaseRef.current) * bobAmp

    // -- Recoil detection -------------------------------------------------------
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

    const decayT    = recoilFrameRef.current / RECOIL_FRAMES
    const recoilY   = height * RECOIL_LIFT_RATIO * decayT
    const recoilAng = -(RECOIL_TILT_DEG * decayT) * (Math.PI / 180)
    const showFlash = recoilFrameRef.current > RECOIL_FRAMES * 0.45

    if (recoilFrameRef.current > 0) recoilFrameRef.current -= 1

    drawGun(ctx, width, height, bobY, recoilY, recoilAng, showFlash)

    // -- Crosshair --------------------------------------------------------------
    const cx = width / 2
    const cy = height / 2
    const cSize = Math.max(4, height * 0.018)
    const cGap  = Math.max(2, height * 0.008)
    ctx.save()
    ctx.strokeStyle = showFlash ? 'rgba(255,200,60,0.95)' : 'rgba(255,255,255,0.85)'
    ctx.lineWidth = Math.max(1.5, height * 0.004)
    ctx.shadowColor = 'rgba(0,0,0,0.8)'
    ctx.shadowBlur  = 3
    ctx.beginPath()
    ctx.moveTo(cx - cSize - cGap, cy)
    ctx.lineTo(cx - cGap, cy)
    ctx.moveTo(cx + cGap, cy)
    ctx.lineTo(cx + cSize + cGap, cy)
    ctx.moveTo(cx, cy - cSize - cGap)
    ctx.lineTo(cx, cy - cGap)
    ctx.moveTo(cx, cy + cGap)
    ctx.lineTo(cx, cy + cSize + cGap)
    ctx.stroke()
    ctx.fillStyle = showFlash ? 'rgba(255,200,60,0.95)' : 'rgba(255,255,255,0.9)'
    ctx.beginPath()
    ctx.arc(cx, cy, Math.max(1.5, height * 0.003), 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }, [state, rays, width, height, playerIndex, fov])

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
