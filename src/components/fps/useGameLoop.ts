// ─── FPS Game – Game Loop Hook ────────────────────────────────────────────────
// React hook that drives the FPS simulation at ~60fps via requestAnimationFrame.
//
// Keyboard bindings
//   Player 1: W/A/S/D to move, Space to fire
//   Player 2: I/J/K/L to move, Enter to fire
//
// The `externalInputs` tuple lets hand-tracking or other sources override
// the keyboard for either player.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { FpsExternalInput, FpsGameState, FpsBullet } from './types'

// ── Tunable constants ──────────────────────────────────────────────────────────

/** Tiles per frame the player moves forward / backward */
const MOVE_SPEED = 0.05

/** Radians per frame the player turns */
const TURN_SPEED = 0.03

/** Tiles per frame a bullet travels */
const BULLET_SPEED = 0.15

/** Damage a bullet deals to the target player */
const BULLET_DAMAGE = 25

/** Player hit-sphere radius used for bullet collision (world units) */
const PLAYER_HIT_RADIUS = 0.3

// ── Key state ─────────────────────────────────────────────────────────────────

/** Internal key-state bag; mirrors FpsExternalInput but is mutable by ref */
interface KeyState {
  forward: boolean
  back: boolean
  left: boolean
  right: boolean
  fire: boolean
}

function blankKeys(): KeyState {
  return { forward: false, back: false, left: false, right: false, fire: false }
}

/** Map from KeyboardEvent.code → KeyState field, for player 1 */
const P1_KEY_MAP: Partial<Record<string, keyof KeyState>> = {
  KeyW: 'forward',
  KeyS: 'back',
  KeyA: 'left',
  KeyD: 'right',
  Space: 'fire',
}

/** Map from KeyboardEvent.code → KeyState field, for player 2 */
const P2_KEY_MAP: Partial<Record<string, keyof KeyState>> = {
  KeyI: 'forward',
  KeyK: 'back',
  KeyJ: 'left',
  KeyL: 'right',
  Enter: 'fire',
}

// ── Map helpers ────────────────────────────────────────────────────────────────

/** Returns true when the tile at (x, y) is a wall or out-of-bounds */
function isWall(map: FpsGameState['map'], x: number, y: number): boolean {
  const col = Math.floor(x)
  const row = Math.floor(y)
  if (row < 0 || row >= map.length) return true
  if (col < 0 || col >= (map[0]?.length ?? 0)) return true
  return (map[row][col] ?? 1) > 0
}

/** Squared Euclidean distance */
function distSq(ax: number, ay: number, bx: number, by: number): number {
  return (ax - bx) ** 2 + (ay - by) ** 2
}

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Runs the FPS game loop at ~60fps via `requestAnimationFrame`.
 *
 * @param initialState   Seed state for the simulation.
 * @param externalInputs Optional tuple [p1Input, p2Input] that overrides the
 *   keyboard for the corresponding player when provided.  Either slot may be
 *   `undefined` to fall back to keyboard.
 * @returns The current `FpsGameState`, updated every frame.
 */
export function useGameLoop(
  initialState: FpsGameState,
  externalInputs?: [FpsExternalInput?, FpsExternalInput?],
): FpsGameState {
  // ── Returned state ────────────────────────────────────────────────────────
  const [gameState, setGameState] = useState<FpsGameState>(initialState)

  // ── Refs (mutations here do NOT trigger re-renders) ───────────────────────
  const stateRef = useRef<FpsGameState>(initialState)

  /** Raw keyboard state for each player */
  const p1Keys = useRef<KeyState>(blankKeys())
  const p2Keys = useRef<KeyState>(blankKeys())

  /**
   * Whether the fire key is still held from the last press.
   * Bullets fire once per key-down event, not continuously.
   */
  const p1FireConsumed = useRef(false)
  const p2FireConsumed = useRef(false)

  const rafRef = useRef<number | null>(null)

  /** Keep a stable ref to the caller-supplied external inputs. */
  const externalInputsRef = useRef(externalInputs)
  useEffect(() => {
    externalInputsRef.current = externalInputs
  })

  // ── Keyboard event listeners ──────────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      // Suppress browser defaults for game keys (e.g. Space scrolls the page)
      const isGameKey =
        e.code in P1_KEY_MAP || e.code in P2_KEY_MAP
      if (isGameKey) e.preventDefault()

      const p1Field = P1_KEY_MAP[e.code]
      if (p1Field !== undefined) p1Keys.current[p1Field] = true

      const p2Field = P2_KEY_MAP[e.code]
      if (p2Field !== undefined) p2Keys.current[p2Field] = true
    }

    function handleKeyUp(e: KeyboardEvent): void {
      const p1Field = P1_KEY_MAP[e.code]
      if (p1Field !== undefined) {
        p1Keys.current[p1Field] = false
        if (p1Field === 'fire') p1FireConsumed.current = false
      }

      const p2Field = P2_KEY_MAP[e.code]
      if (p2Field !== undefined) {
        p2Keys.current[p2Field] = false
        if (p2Field === 'fire') p2FireConsumed.current = false
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  // ── Input resolver: external overrides keyboard when provided ─────────────
  const resolveInput = useCallback((playerIndex: 0 | 1): FpsExternalInput => {
    const ext = externalInputsRef.current?.[playerIndex]
    if (ext !== undefined) return ext
    const k = playerIndex === 0 ? p1Keys.current : p2Keys.current
    return { forward: k.forward, back: k.back, left: k.left, right: k.right, fire: k.fire }
  }, [])

  // ── Per-frame simulation tick ─────────────────────────────────────────────
  const tick = useCallback(() => {
    const s = stateRef.current
    const { map } = s

    // Always produce fresh player objects so downstream consumers see new refs
    const players: FpsGameState['players'] = [
      { ...s.players[0] },
      { ...s.players[1] },
    ]

    // Start with the bullets that were already in flight from the previous frame
    const bulletsInFlight: FpsBullet[] = []

    // ── 1. Player movement & firing ─────────────────────────────────────────
    for (let i = 0; i < 2; i++) {
      const pIdx = i as 0 | 1
      const input = resolveInput(pIdx)
      const p = players[pIdx]

      // Rotation
      if (input.left)  p.angle -= TURN_SPEED
      if (input.right) p.angle += TURN_SPEED

      // Movement with wall-slide collision
      if (input.forward || input.back) {
        const dir = input.forward ? 1 : -1
        const dx  = Math.cos(p.angle) * MOVE_SPEED * dir
        const dy  = Math.sin(p.angle) * MOVE_SPEED * dir
        // Test each axis independently so the player slides along walls
        if (!isWall(map, p.x + dx, p.y))      p.x += dx
        if (!isWall(map, p.x,      p.y + dy)) p.y += dy
      }

      // Fire – one bullet per key-press (auto-fire is disabled)
      const fireConsumedRef = pIdx === 0 ? p1FireConsumed : p2FireConsumed
      if (input.fire && !fireConsumedRef.current) {
        fireConsumedRef.current = true
        bulletsInFlight.push({ x: p.x, y: p.y, angle: p.angle, ownerId: pIdx })
      }
    }

    // ── 2. Bullet physics ───────────────────────────────────────────────────
    // Carry over existing bullets, then append newly fired ones
    const allBullets = [...s.bullets, ...bulletsInFlight]
    // Reset the new-bullets accumulator; we rebuild below
    bulletsInFlight.length = 0

    const hitRadiusSq = PLAYER_HIT_RADIUS ** 2

    for (const bullet of allBullets) {
      const bx = bullet.x + Math.cos(bullet.angle) * BULLET_SPEED
      const by = bullet.y + Math.sin(bullet.angle) * BULLET_SPEED

      // Discard on wall collision
      if (isWall(map, bx, by)) continue

      // Check hit on the opposing player
      const targetIdx: 0 | 1 = bullet.ownerId === 0 ? 1 : 0
      const target = players[targetIdx]

      if (distSq(bx, by, target.x, target.y) < hitRadiusSq) {
        // Deal damage; credit a kill when the target's health reaches zero
        target.health = Math.max(0, target.health - BULLET_DAMAGE)
        if (target.health === 0) {
          players[bullet.ownerId].kills += 1
        }
        // Bullet consumed — do not keep it
        continue
      }

      // Bullet survives this frame; advance its position
      bulletsInFlight.push({ ...bullet, x: bx, y: by })
    }

    // ── 3. Publish new state ────────────────────────────────────────────────
    const next: FpsGameState = {
      ...s,
      tick: s.tick + 1,
      players,
      bullets: bulletsInFlight,
    }

    stateRef.current = next
    setGameState(next)
  }, [resolveInput])

  // ── RAF scheduling ────────────────────────────────────────────────────────
  useEffect(() => {
    function loop(): void {
      tick()
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [tick])

  return gameState
}
