// ─── PlatformerGame Component ─────────────────────────────────────────────────
// Mario-style side-scrolling platformer with:
//   • Physics: gravity, velocity, platform collision
//   • WASD / Arrow key controls (always active)
//   • Hand-tracking (improved two-hand gesture controls):
//       Right-hand Closed_Fist  → move right
//       Left-hand  Closed_Fist  → move left
//       Both hands close together (clap / hands-near) → jump
//       Clap + right fist held  → jump right
//       Clap + left  fist held  → jump left
//       Open_Palm (either hand) → pause / resume
//   • Single playable level with a goal flag to win
//   • HUD: score, coins collected, lives, progress bar

import { useCallback, useEffect, useRef, useState } from 'react'
import HandRecognitionPanel from './HandRecognitionPanel'
import type { HandData } from '../hooks/useHandRecognition'
import { GESTURE_FIST, GESTURE_OPEN_PALM } from '../hooks/useHandRecognition'
import './PlatformerGame.css'

// ── Constants ──────────────────────────────────────────────────────────────────

const GRAVITY        = 0.55
const PLAYER_SPEED   = 4
const JUMP_FORCE     = 11
const PLAYER_W       = 36
const PLAYER_H       = 44
const LEVEL_W        = 3200
const LEVEL_H        = 520
const GROUND_Y       = LEVEL_H - 64

// Normalised horizontal distance (0-1 scale) below which both index tips are
// considered "close together" = a clap/hands-together gesture.
const CLAP_THRESHOLD = 0.20

// Minimum gesture confidence to act on a recognised gesture.
const MIN_GESTURE_CONF = 0.65

// ── Types ──────────────────────────────────────────────────────────────────────

interface Player {
  x: number; y: number; vx: number; vy: number
  onGround: boolean; facingRight: boolean
  animFrame: number; animTick: number
}

interface Platform {
  x: number; y: number; w: number; h: number
  kind: 'ground' | 'brick' | 'cloud' | 'pipe'
}

interface Coin {
  id: number; x: number; y: number; collected: boolean
}

interface Enemy {
  id: number; x: number; y: number; vx: number
  alive: boolean; squished: boolean; squishTimer: number
}

type GamePhase = 'playing' | 'paused' | 'won' | 'dead' | 'gameOver'

// ── Level ─────────────────────────────────────────────────────────────────────

const PLATFORMS: Platform[] = [
  { x: 0,    y: GROUND_Y,       w: LEVEL_W, h: 64,  kind: 'ground' },
  { x: 300,  y: GROUND_Y - 100, w: 120,     h: 18,  kind: 'brick' },
  { x: 500,  y: GROUND_Y - 160, w: 100,     h: 18,  kind: 'brick' },
  { x: 680,  y: GROUND_Y - 100, w: 100,     h: 18,  kind: 'brick' },
  { x: 870,  y: GROUND_Y - 150, w: 140,     h: 18,  kind: 'cloud' },
  { x: 1060, y: GROUND_Y - 200, w: 110,     h: 18,  kind: 'cloud' },
  { x: 1230, y: GROUND_Y - 130, w: 130,     h: 18,  kind: 'brick' },
  { x: 1450, y: GROUND_Y - 80,  w: 90,      h: 18,  kind: 'brick' },
  { x: 1560, y: GROUND_Y - 160, w: 90,      h: 18,  kind: 'brick' },
  { x: 1670, y: GROUND_Y - 240, w: 90,      h: 18,  kind: 'brick' },
  { x: 1850, y: GROUND_Y - 180, w: 200,     h: 18,  kind: 'brick' },
  { x: 2100, y: GROUND_Y - 72,  w: 56,      h: 72,  kind: 'pipe' },
  { x: 2250, y: GROUND_Y - 96,  w: 56,      h: 96,  kind: 'pipe' },
  { x: 2400, y: GROUND_Y - 160, w: 120,     h: 18,  kind: 'cloud' },
  { x: 2560, y: GROUND_Y - 200, w: 100,     h: 18,  kind: 'cloud' },
  { x: 2700, y: GROUND_Y - 140, w: 140,     h: 18,  kind: 'brick' },
  { x: 2900, y: GROUND_Y - 100, w: 120,     h: 18,  kind: 'brick' },
  { x: 3050, y: GROUND_Y - 180, w: 100,     h: 18,  kind: 'brick' },
]

const INITIAL_COINS: Coin[] = [
  { id:  1, x:  330, y: GROUND_Y - 150, collected: false },
  { id:  2, x:  360, y: GROUND_Y - 150, collected: false },
  { id:  3, x:  390, y: GROUND_Y - 150, collected: false },
  { id:  4, x:  530, y: GROUND_Y - 210, collected: false },
  { id:  5, x:  560, y: GROUND_Y - 210, collected: false },
  { id:  6, x:  890, y: GROUND_Y - 200, collected: false },
  { id:  7, x:  930, y: GROUND_Y - 200, collected: false },
  { id:  8, x: 1080, y: GROUND_Y - 250, collected: false },
  { id:  9, x: 1110, y: GROUND_Y - 250, collected: false },
  { id: 10, x: 1860, y: GROUND_Y - 230, collected: false },
  { id: 11, x: 1900, y: GROUND_Y - 230, collected: false },
  { id: 12, x: 1940, y: GROUND_Y - 230, collected: false },
  { id: 13, x: 1980, y: GROUND_Y - 230, collected: false },
  { id: 14, x: 2420, y: GROUND_Y - 210, collected: false },
  { id: 15, x: 2460, y: GROUND_Y - 210, collected: false },
  { id: 16, x: 2720, y: GROUND_Y - 190, collected: false },
  { id: 17, x: 2760, y: GROUND_Y - 190, collected: false },
  { id: 18, x: 2920, y: GROUND_Y - 150, collected: false },
  { id: 19, x: 3060, y: GROUND_Y - 230, collected: false },
  { id: 20, x: 3100, y: GROUND_Y - 230, collected: false },
]

const INITIAL_ENEMIES: Enemy[] = [
  { id: 1, x:  600, y: GROUND_Y - PLAYER_H, vx: -1.2, alive: true, squished: false, squishTimer: 0 },
  { id: 2, x:  900, y: GROUND_Y - PLAYER_H, vx:  1.0, alive: true, squished: false, squishTimer: 0 },
  { id: 3, x: 1300, y: GROUND_Y - PLAYER_H, vx: -1.4, alive: true, squished: false, squishTimer: 0 },
  { id: 4, x: 1900, y: GROUND_Y - PLAYER_H, vx: -1.2, alive: true, squished: false, squishTimer: 0 },
  { id: 5, x: 2350, y: GROUND_Y - PLAYER_H, vx:  1.0, alive: true, squished: false, squishTimer: 0 },
  { id: 6, x: 2700, y: GROUND_Y - PLAYER_H, vx: -1.3, alive: true, squished: false, squishTimer: 0 },
  { id: 7, x: 3000, y: GROUND_Y - PLAYER_H, vx: -1.5, alive: true, squished: false, squishTimer: 0 },
]

const GOAL_X = LEVEL_W - 140

// ── Helpers ───────────────────────────────────────────────────────────────────

function rectOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}

function makePlayer(): Player {
  return { x: 80, y: GROUND_Y - PLAYER_H, vx: 0, vy: 0,
           onGround: false, facingRight: true, animFrame: 0, animTick: 0 }
}

// ── Hand input smoothing ───────────────────────────────────────────────────────
// A tiny ring-buffer majority-vote smoother so flaky frames don't flip controls.
// We keep the last N gesture readings and require a majority to commit a change.

const GESTURE_HISTORY = 4  // frames to smooth over

function createGestureBuffer() {
  return { buf: Array(GESTURE_HISTORY).fill('None') as string[], idx: 0 }
}

function pushGesture(gb: { buf: string[]; idx: number }, gesture: string) {
  gb.buf[gb.idx] = gesture
  gb.idx = (gb.idx + 1) % GESTURE_HISTORY
}

function dominantGesture(gb: { buf: string[]; idx: number }): string {
  const counts: Record<string, number> = {}
  for (const g of gb.buf) counts[g] = (counts[g] ?? 0) + 1
  let best = 'None', bestN = 0
  for (const [g, n] of Object.entries(counts)) {
    if (n > bestN) { best = g; bestN = n }
  }
  return best
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function PlatformerGame() {
  const [phase,    setPhase]    = useState<GamePhase>('playing')
  const [coins,    setCoins]    = useState<Coin[]>(() => INITIAL_COINS.map(c => ({ ...c })))
  const [enemies,  setEnemies]  = useState<Enemy[]>(() => INITIAL_ENEMIES.map(e => ({ ...e })))
  const [player,   setPlayer]   = useState<Player>(makePlayer)
  const [lives,    setLives]    = useState(3)
  const [score,    setScore]    = useState(0)
  const [camera,   setCamera]   = useState(0)
  const [handMode, setHandMode] = useState(false)

  // Live debug display for hand gesture panel
  const [handDebug, setHandDebug] = useState<{
    leftGesture: string; rightGesture: string; isClap: boolean
  }>({ leftGesture: 'None', rightGesture: 'None', isClap: false })

  const phaseRef    = useRef<GamePhase>('playing')
  const playerRef   = useRef<Player>(makePlayer())
  const coinsRef    = useRef<Coin[]>(INITIAL_COINS.map(c => ({ ...c })))
  const enemiesRef  = useRef<Enemy[]>(INITIAL_ENEMIES.map(e => ({ ...e })))
  const livesRef    = useRef(3)
  const scoreRef    = useRef(0)
  const cameraRef   = useRef(0)
  const rafRef      = useRef<number | null>(null)
  const handModeRef = useRef(false)
  const keysRef     = useRef<Set<string>>(new Set())

  // Smoothed hand input fed into the game loop each tick
  const handInputRef = useRef({ left: false, right: false, jump: false })

  // Per-hand gesture smoothing buffers (reset when hand mode toggled)
  const leftBufRef  = useRef(createGestureBuffer())
  const rightBufRef = useRef(createGestureBuffer())

  // Clap latch: once a clap-jump fires, don't re-fire until hands move apart
  const clapLatchRef = useRef(false)

  // Open-palm pause latch (debounce so one open-palm doesn't toggle twice)
  const palmPauseLatchRef = useRef(false)

  const canvasRef   = useRef<HTMLDivElement>(null)

  useEffect(() => { phaseRef.current    = phase    }, [phase])
  useEffect(() => { livesRef.current    = lives    }, [lives])
  useEffect(() => { scoreRef.current    = score    }, [score])
  useEffect(() => {
    handModeRef.current = handMode
    if (!handMode) {
      // Clear hand state when mode is disabled
      handInputRef.current = { left: false, right: false, jump: false }
      leftBufRef.current  = createGestureBuffer()
      rightBufRef.current = createGestureBuffer()
      clapLatchRef.current     = false
      palmPauseLatchRef.current = false
    }
  }, [handMode])

  // ── Reset ──────────────────────────────────────────────────────────────────

  const resetGame = useCallback(() => {
    const p = makePlayer()
    const c = INITIAL_COINS.map(x => ({ ...x }))
    const e = INITIAL_ENEMIES.map(x => ({ ...x }))
    playerRef.current  = p
    coinsRef.current   = c
    enemiesRef.current = e
    livesRef.current   = 3
    scoreRef.current   = 0
    cameraRef.current  = 0
    setPlayer(p); setCoins(c); setEnemies(e)
    setLives(3); setScore(0); setCamera(0)
    setPhase('playing'); phaseRef.current = 'playing'
  }, [])

  // ── Kill player ────────────────────────────────────────────────────────────

  const killPlayer = useCallback(() => {
    const newLives = livesRef.current - 1
    livesRef.current = newLives
    setLives(newLives)
    if (newLives <= 0) {
      setPhase('gameOver'); phaseRef.current = 'gameOver'
    } else {
      const p = makePlayer()
      playerRef.current = p; cameraRef.current = 0
      setPlayer(p); setCamera(0)
      setPhase('playing'); phaseRef.current = 'playing'
    }
  }, [])

  // ── Game loop ──────────────────────────────────────────────────────────────

  const tick = useCallback(() => {
    if (phaseRef.current !== 'playing') {
      rafRef.current = requestAnimationFrame(tick)
      return
    }

    const p = { ...playerRef.current }
    const hand = handInputRef.current
    const goLeft  = keysRef.current.has('a') || keysRef.current.has('arrowleft')  || hand.left
    const goRight = keysRef.current.has('d') || keysRef.current.has('arrowright') || hand.right
    const doJump  = keysRef.current.has('w') || keysRef.current.has('arrowup') ||
                    keysRef.current.has(' ')  || hand.jump

    if (goLeft && !goRight) { p.vx = -PLAYER_SPEED; p.facingRight = false }
    else if (goRight && !goLeft) { p.vx = PLAYER_SPEED; p.facingRight = true }
    else { p.vx = 0 }

    if (doJump && p.onGround) { p.vy = -JUMP_FORCE; p.onGround = false }

    // Jump is a single-frame impulse; clear it after consuming
    if (hand.jump) handInputRef.current = { ...hand, jump: false }

    p.vy += GRAVITY
    p.x  += p.vx
    p.y  += p.vy
    p.x   = Math.max(0, Math.min(LEVEL_W - PLAYER_W, p.x))

    // Animation
    if (p.vx !== 0 && p.onGround) {
      p.animTick += 1
      if (p.animTick >= 8) { p.animTick = 0; p.animFrame = p.animFrame === 0 ? 1 : 0 }
    } else { p.animTick = 0 }

    // Platform collision
    p.onGround = false
    for (const plat of PLATFORMS) {
      if (!rectOverlap(p.x, p.y, PLAYER_W, PLAYER_H, plat.x, plat.y, plat.w, plat.h)) continue
      const prevBottom = playerRef.current.y + PLAYER_H
      if (p.vy >= 0 && prevBottom <= plat.y + 4) {
        p.y = plat.y - PLAYER_H; p.vy = 0; p.onGround = true
      } else if (p.vy < 0 && playerRef.current.y >= plat.y + plat.h - 4) {
        p.y = plat.y + plat.h; p.vy = 0
      } else {
        const prevRight = playerRef.current.x + PLAYER_W
        if (prevRight <= plat.x + 4) p.x = plat.x - PLAYER_W
        else if (playerRef.current.x >= plat.x + plat.w - 4) p.x = plat.x + plat.w
      }
    }

    // Fell off bottom
    if (p.y > LEVEL_H + 60) {
      playerRef.current = p; killPlayer()
      rafRef.current = requestAnimationFrame(tick); return
    }

    // Enemies
    let died = false
    const updatedEnemies = enemiesRef.current.map(e => {
      if (!e.alive) return e
      if (e.squished) {
        const t = e.squishTimer - 1
        return t <= 0 ? { ...e, alive: false } : { ...e, squishTimer: t }
      }
      let { x, vx } = e
      const prevX = x
      x += vx
      if (x <= 0 || x >= LEVEL_W - PLAYER_W) vx = -vx
      const ey = e.y
      // Reverse and undo move if the enemy walks into a solid (non-cloud) platform from the side
      const hitWall = PLATFORMS.some(pl => {
        if (pl.kind === 'cloud') return false
        if (!rectOverlap(x, ey, PLAYER_W, PLAYER_H, pl.x, pl.y, pl.w, pl.h)) return false
        // Already overlapping before the move? skip (edge-case safety)
        if (rectOverlap(prevX, ey, PLAYER_W, PLAYER_H, pl.x, pl.y, pl.w, pl.h)) return false
        // Sitting on top of this platform is not a side collision
        if (ey + PLAYER_H <= pl.y + 4) return false
        return true
      })
      if (hitWall) { vx = -vx; x = prevX }
      const over = PLATFORMS.some(pl =>
        x + PLAYER_W > pl.x && x < pl.x + pl.w &&
        ey + PLAYER_H >= pl.y && ey + PLAYER_H <= pl.y + 10
      )
      if (!over) vx = -vx
      if (rectOverlap(p.x, p.y, PLAYER_W, PLAYER_H, x, ey, PLAYER_W, PLAYER_H)) {
        const prevBottom2 = playerRef.current.y + PLAYER_H
        if (prevBottom2 <= ey + 12 && p.vy >= 0) {
          p.vy = -7
          const pts = scoreRef.current + 200; scoreRef.current = pts; setScore(pts)
          return { ...e, x, vx, squished: true, squishTimer: 20 }
        } else { died = true }
      }
      return { ...e, x, vx }
    })
    enemiesRef.current = updatedEnemies
    setEnemies([...updatedEnemies])

    if (died) {
      playerRef.current = p; killPlayer()
      rafRef.current = requestAnimationFrame(tick); return
    }

    // Coins
    const COIN_R = 12
    const updatedCoins = coinsRef.current.map(c => {
      if (c.collected) return c
      if (p.x < c.x + COIN_R && p.x + PLAYER_W > c.x - COIN_R &&
          p.y < c.y + COIN_R && p.y + PLAYER_H > c.y - COIN_R) {
        const pts = scoreRef.current + 100; scoreRef.current = pts; setScore(pts)
        return { ...c, collected: true }
      }
      return c
    })
    coinsRef.current = updatedCoins
    setCoins([...updatedCoins])

    // Win
    if (p.x + PLAYER_W >= GOAL_X) {
      playerRef.current = p; setPlayer({ ...p })
      setPhase('won'); phaseRef.current = 'won'
      rafRef.current = requestAnimationFrame(tick); return
    }

    // Camera
    const viewW = canvasRef.current?.clientWidth ?? 800
    let cam = p.x - viewW * 0.35
    cam = Math.max(0, Math.min(LEVEL_W - viewW, cam))
    cameraRef.current = cam; setCamera(cam)
    playerRef.current = p; setPlayer({ ...p })
    rafRef.current = requestAnimationFrame(tick)
  }, [killPlayer])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
  }, [tick])

  // ── Keyboard ───────────────────────────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      keysRef.current.add(e.key.toLowerCase())
      if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && phaseRef.current === 'playing') {
        setPhase('paused'); phaseRef.current = 'paused'
      } else if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && phaseRef.current === 'paused') {
        setPhase('playing'); phaseRef.current = 'playing'
      }
      if ((e.key === 'Enter' || e.key === ' ') &&
          (phaseRef.current === 'gameOver' || phaseRef.current === 'won')) resetGame()
      if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key.toLowerCase())) e.preventDefault()
    }
    function onKeyUp(e: KeyboardEvent) { keysRef.current.delete(e.key.toLowerCase()) }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup',   onKeyUp)
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp) }
  }, [resetGame])

  // ── Hand tracking ──────────────────────────────────────────────────────────
  //
  // Gesture mapping (two-hand scheme):
  //   Right-hand Closed_Fist  → move right   (continuous while held)
  //   Left-hand  Closed_Fist  → move left    (continuous while held)
  //   Both hands close together (index tips within CLAP_THRESHOLD of each other)
  //                           → jump (one shot per clap; latch until hands separate)
  //   Clap while right fist   → jump right
  //   Clap while left  fist   → jump left
  //   Either hand Open_Palm   → pause / resume (debounced)
  //
  // Robustness tricks:
  //   • Per-hand gesture is majority-voted over the last GESTURE_HISTORY frames
  //     so a single misclassified frame does NOT change the action.
  //   • We require gestureScore >= MIN_GESTURE_CONF to accept a classification.
  //   • "No hand" detected → its gesture is treated as 'None' (slot preserved).

  const handleHandData = useCallback((data: HandData) => {
    if (!handModeRef.current) return

    // ── 1. Sort hands into Left / Right by MediaPipe handedness ───────────
    //  MediaPipe reports "Left"/"Right" from the *person's* perspective
    //  (mirror-aware), so "Right" = player's right hand.
    let leftX:  number | null = null
    let rightX: number | null = null
    let rawLeftGesture  = 'None'
    let rawRightGesture = 'None'
    let hasPalmPause    = false

    for (const hand of data.hands) {
      const g = hand.gestureScore >= MIN_GESTURE_CONF ? hand.gesture : 'None'

      // MediaPipe uses mirrored video by default → "Left" hand appears on
      // the right side of the frame.  We flip indexTip.x accordingly.
      const tipX = 1 - hand.indexTip.x  // un-mirror so 0=left, 1=right in world space

      if (hand.handedness === 'Left') {
        rawLeftGesture = g
        leftX = tipX
      } else {
        rawRightGesture = g
        rightX = tipX
      }

      if (g === GESTURE_OPEN_PALM) hasPalmPause = true
    }

    // ── 2. Push into smoothing buffers ────────────────────────────────────
    pushGesture(leftBufRef.current,  rawLeftGesture)
    pushGesture(rightBufRef.current, rawRightGesture)

    const leftGesture  = dominantGesture(leftBufRef.current)
    const rightGesture = dominantGesture(rightBufRef.current)

    // ── 3. Directional movement ───────────────────────────────────────────
    const goLeft  = leftGesture  === GESTURE_FIST
    const goRight = rightGesture === GESTURE_FIST

    // ── 4. Clap / jump detection ──────────────────────────────────────────
    // Both hands visible AND close together → clap = jump
    const bothVisible = leftX !== null && rightX !== null
    const isClap = bothVisible && Math.abs(rightX! - leftX!) < CLAP_THRESHOLD

    let doJump = false
    if (isClap && !clapLatchRef.current) {
      doJump = true
      clapLatchRef.current = true
    } else if (!isClap) {
      clapLatchRef.current = false
    }

    // ── 5. Pause toggle (open palm, debounced) ────────────────────────────
    if (hasPalmPause && !palmPauseLatchRef.current) {
      palmPauseLatchRef.current = true
      if (phaseRef.current === 'playing') {
        setPhase('paused'); phaseRef.current = 'paused'
      } else if (phaseRef.current === 'paused') {
        setPhase('playing'); phaseRef.current = 'playing'
      }
    } else if (!hasPalmPause) {
      palmPauseLatchRef.current = false
    }

    // ── 6. Directional jump override ──────────────────────────────────────
    // If clapping AND a fist is held, apply horizontal direction to the jump
    // by setting left/right on the same tick as the jump impulse.
    const jumpLeft  = doJump && goLeft
    const jumpRight = doJump && goRight

    // ── 7. Commit to handInputRef ─────────────────────────────────────────
    handInputRef.current = {
      left:  goLeft  || jumpLeft,
      right: goRight || jumpRight,
      jump:  doJump,
    }

    // ── 8. Update debug display ───────────────────────────────────────────
    setHandDebug({ leftGesture, rightGesture, isClap })
  }, [])

  // ── Derived ────────────────────────────────────────────────────────────────

  const collectedCoins = coins.filter(c => c.collected).length
  const totalCoins     = INITIAL_COINS.length

  // ── Render ─────────────────────────────────────────────────────────────────

  const { x: px, y: py, facingRight, onGround, vx: pvx, animFrame } = player
  const sx = px - camera

  return (
    <div className="pl-container">

      {/* ── Control bar ──────────────────────────────────────────────────── */}
      <div className="pl-control-bar">
        <span className="pl-control-bar__label">Controls:</span>
        <button className={`pl-mode-btn${!handMode ? ' pl-mode-btn--active' : ''}`}
          onClick={() => setHandMode(false)}>⌨️ WASD / Arrows</button>
        <button className={`pl-mode-btn${handMode ? ' pl-mode-btn--active' : ''}`}
          onClick={() => setHandMode(true)}>✋ Hand Tracking</button>

        {phase === 'playing' && (
          <button className="pl-pause-btn" onClick={() => { setPhase('paused'); phaseRef.current = 'paused' }}>
            ⏸ Pause
          </button>
        )}
        {phase === 'paused' && (
          <button className="pl-pause-btn pl-pause-btn--active"
            onClick={() => { setPhase('playing'); phaseRef.current = 'playing' }}>
            ▶ Resume
          </button>
        )}
        {(phase === 'gameOver' || phase === 'won') && (
          <button className="pl-start-btn" onClick={resetGame}>🔄 Play Again</button>
        )}
        {handMode && (
          <span className="pl-control-bar__hint">
            ✊ Right fist = move right · ✊ Left fist = move left · 👏 Clap = jump · 👏+✊ = jump that direction · 🖐️ = pause
          </span>
        )}
      </div>

      {/* ── Game canvas ──────────────────────────────────────────────────── */}
      <div ref={canvasRef} className="pl-canvas">

        {/* Parallax clouds */}
        <div className="pl-cloud pl-cloud--1" style={{ left: Math.max(0, 200  - camera * 0.3) }} />
        <div className="pl-cloud pl-cloud--2" style={{ left: Math.max(0, 600  - camera * 0.3) }} />
        <div className="pl-cloud pl-cloud--3" style={{ left: Math.max(0, 1100 - camera * 0.3) }} />
        <div className="pl-cloud pl-cloud--4" style={{ left: Math.max(0, 1700 - camera * 0.3) }} />
        <div className="pl-cloud pl-cloud--5" style={{ left: Math.max(0, 2400 - camera * 0.3) }} />

        {/* Platforms */}
        {PLATFORMS.map((plat, i) => {
          const screenX = plat.x - camera
          const viewW = canvasRef.current?.clientWidth ?? 900
          if (screenX + plat.w < -20 || screenX > viewW + 20) return null
          return (
            <div key={i}
              className={`pl-platform pl-platform--${plat.kind}`}
              style={{ left: screenX, top: plat.y, width: plat.w, height: plat.h }} />
          )
        })}

        {/* Coins */}
        {coins.map(c => {
          if (c.collected) return null
          return (
            <div key={c.id} className="pl-coin" style={{ left: c.x - camera - 10, top: c.y - 10 }} aria-hidden>
              <div className="pl-coin__inner" />
            </div>
          )
        })}

        {/* Enemies */}
        {enemies.map(e => {
          if (!e.alive) return null
          const ex = e.x - camera
          const viewW = canvasRef.current?.clientWidth ?? 900
          if (ex + PLAYER_W < -40 || ex > viewW + 40) return null
          return (
            <div key={e.id}
              className={`pl-enemy${e.squished ? ' pl-enemy--squished' : ''}`}
              style={{ left: ex, top: e.y + (e.squished ? PLAYER_H - 12 : 0) }}
              aria-hidden>
              {!e.squished && (<>
                <div className="pl-enemy__eye pl-enemy__eye--l" />
                <div className="pl-enemy__eye pl-enemy__eye--r" />
                <div className="pl-enemy__mouth" />
              </>)}
            </div>
          )
        })}

        {/* Goal flag */}
        {(() => {
          const fx = GOAL_X - camera
          const viewW = canvasRef.current?.clientWidth ?? 900
          if (fx < viewW + 60) {
            return (
              <div className="pl-flag" style={{ left: fx, top: GROUND_Y - 200 }}>
                <div className="pl-flag__pole" />
                <div className="pl-flag__banner">🏁</div>
              </div>
            )
          }
          return null
        })()}

        {/* Player */}
        {(phase === 'playing' || phase === 'paused') && (
          <div className={[
            'pl-player',
            !facingRight ? 'pl-player--left' : '',
            !onGround ? 'pl-player--jump' : (pvx !== 0 ? `pl-player--walk${animFrame}` : ''),
          ].filter(Boolean).join(' ')}
          style={{ left: sx, top: py }} aria-label="Player">
            <div className="pl-hat" />
            <div className="pl-head">
              <div className="pl-eye" />
              <div className="pl-nose" />
            </div>
            <div className="pl-body"><div className="pl-overalls" /></div>
            <div className="pl-feet">
              <div className="pl-foot pl-foot--l" />
              <div className="pl-foot pl-foot--r" />
            </div>
          </div>
        )}

        {/* Pause overlay */}
        {phase === 'paused' && (
          <div className="pl-overlay">
            <div className="pl-overlay__box">
              <div className="pl-overlay__title">⏸ PAUSED</div>
              <div className="pl-overlay__sub">Press P / Esc · or click Resume</div>
              {handMode && <div className="pl-overlay__sub">🖐️ Open palm to resume</div>}
            </div>
          </div>
        )}

        {/* Win */}
        {phase === 'won' && (
          <div className="pl-overlay">
            <div className="pl-overlay__box pl-overlay__box--win">
              <div className="pl-overlay__emoji">🎉</div>
              <div className="pl-overlay__title pl-overlay__title--win">YOU WIN!</div>
              <div className="pl-overlay__sub">Score: {score.toLocaleString()}</div>
              <div className="pl-overlay__sub">Coins: {collectedCoins}/{totalCoins}</div>
              <button className="pl-btn" onClick={resetGame}>Play Again</button>
            </div>
          </div>
        )}

        {/* Game over */}
        {phase === 'gameOver' && (
          <div className="pl-overlay">
            <div className="pl-overlay__box pl-overlay__box--over">
              <div className="pl-overlay__emoji">💀</div>
              <div className="pl-overlay__title pl-overlay__title--over">GAME OVER</div>
              <div className="pl-overlay__sub">Score: {score.toLocaleString()}</div>
              <button className="pl-btn" onClick={resetGame}>Try Again</button>
            </div>
          </div>
        )}

        {/* Hand panel overlay */}
        {handMode && (
          <div className="pl-hand-overlay"
            onMouseMove={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
            <HandRecognitionPanel onHandData={handleHandData} autoStart defaultCollapsed={false} />
            <div className="pl-hand-hint">
              <div className="pl-hand-hint__row">
                <span className={`pl-hand-hint__badge${handDebug.leftGesture === GESTURE_FIST ? ' pl-hand-hint__badge--active' : ''}`}>
                  ✊ Left fist
                </span>
                <span className="pl-hand-hint__action">← move left</span>
              </div>
              <div className="pl-hand-hint__row">
                <span className={`pl-hand-hint__badge${handDebug.rightGesture === GESTURE_FIST ? ' pl-hand-hint__badge--active' : ''}`}>
                  ✊ Right fist
                </span>
                <span className="pl-hand-hint__action">→ move right</span>
              </div>
              <div className="pl-hand-hint__row">
                <span className={`pl-hand-hint__badge${handDebug.isClap ? ' pl-hand-hint__badge--active' : ''}`}>
                  👏 Clap
                </span>
                <span className="pl-hand-hint__action">↑ jump (+ fist = directional)</span>
              </div>
              <div className="pl-hand-hint__row">
                <span className="pl-hand-hint__badge">🖐️ Open palm</span>
                <span className="pl-hand-hint__action">⏸ pause / resume</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── HUD ──────────────────────────────────────────────────────────── */}
      <div className="pl-hud">
        <div className="pl-hud-cell">
          <span className="pl-hud-cell__label">SCORE</span>
          <span className="pl-hud-cell__value">{score.toString().padStart(6, '0')}</span>
        </div>
        <div className="pl-hud-cell">
          <span className="pl-hud-cell__label">COINS</span>
          <span className="pl-hud-cell__value">🪙 {collectedCoins}/{totalCoins}</span>
        </div>
        <div className="pl-hud-cell">
          <span className="pl-hud-cell__label">LIVES</span>
          <span className="pl-hud-cell__value">
            {Array.from({ length: Math.max(0, lives) }).map((_, i) => (
              <span key={i} className="pl-life-icon" aria-hidden>🍄</span>
            ))}
          </span>
        </div>
        <div className="pl-hud-cell">
          <span className="pl-hud-cell__label">PROGRESS</span>
          <div className="pl-progress-bar">
            <div className="pl-progress-bar__fill"
              style={{ width: `${Math.min(100, (player.x / GOAL_X) * 100).toFixed(1)}%` }} />
            <span className="pl-progress-bar__flag">🏁</span>
          </div>
        </div>
      </div>
    </div>
  )
}
