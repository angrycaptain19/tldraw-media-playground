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
//   • 50 levels across 5 worlds (Sunny Meadow → Gloom King's Tower)
//   • Story cards shown between levels
//   • HUD: score, coins, lives, level indicator, progress bar

import { useCallback, useEffect, useRef, useState } from 'react'
import HandRecognitionPanel from './HandRecognitionPanel'
import type { HandData } from '../hooks/useHandRecognition'
import { GESTURE_FIST, GESTURE_OPEN_PALM } from '../hooks/useHandRecognition'
import {
  ALL_LEVELS, LEVEL_W, LEVEL_H, GROUND_Y, TOTAL_LEVELS,
  WORLD_NAMES, WORLD_COLORS,
  type LevelDef, type LevelCoin, type LevelEnemy,
} from './platformerLevels'
import './PlatformerGame.css'

// ── Constants ──────────────────────────────────────────────────────────────────

const GRAVITY        = 0.55
const PLAYER_SPEED   = 4
const JUMP_FORCE     = 11
const PLAYER_W       = 36
const PLAYER_H       = 44
const CLAP_THRESHOLD = 0.20
const MIN_GESTURE_CONF = 0.65

// ── Types ──────────────────────────────────────────────────────────────────────

interface Player {
  x: number; y: number; vx: number; vy: number
  onGround: boolean; facingRight: boolean
  animFrame: number; animTick: number
}

interface ActiveCoin extends LevelCoin { collected: boolean; id: number }
interface ActiveEnemy extends LevelEnemy { alive: boolean; squished: boolean; squishTimer: number; vx: number; id: number }

type GamePhase = 'story' | 'playing' | 'paused' | 'levelClear' | 'won' | 'dead' | 'gameOver'

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

function coinsFromLevel(lvl: LevelDef): ActiveCoin[] {
  return lvl.coins.map((c, i) => ({ ...c, collected: false, id: i }))
}

function enemiesFromLevel(lvl: LevelDef): ActiveEnemy[] {
  return lvl.enemies.map((e, i) => ({ ...e, alive: true, squished: false, squishTimer: 0, vx: e.speed, id: i }))
}

// ── Hand input smoothing ───────────────────────────────────────────────────────
const GESTURE_HISTORY = 4

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
  const [levelIndex, setLevelIndex] = useState(0)
  const [phase,      setPhase]      = useState<GamePhase>('story')
  const [coins,      setCoins]      = useState<ActiveCoin[]>(() => coinsFromLevel(ALL_LEVELS[0]))
  const [enemies,    setEnemies]    = useState<ActiveEnemy[]>(() => enemiesFromLevel(ALL_LEVELS[0]))
  const [player,     setPlayer]     = useState<Player>(makePlayer)
  const [lives,      setLives]      = useState(3)
  const [score,      setScore]      = useState(0)
  const [camera,     setCamera]     = useState(0)
  const [handMode,   setHandMode]   = useState(false)

  const [handDebug, setHandDebug] = useState<{
    leftGesture: string; rightGesture: string; isClap: boolean
  }>({ leftGesture: 'None', rightGesture: 'None', isClap: false })

  const levelIndexRef = useRef(0)
  const phaseRef      = useRef<GamePhase>('story')
  const playerRef     = useRef<Player>(makePlayer())
  const coinsRef      = useRef<ActiveCoin[]>(coinsFromLevel(ALL_LEVELS[0]))
  const enemiesRef    = useRef<ActiveEnemy[]>(enemiesFromLevel(ALL_LEVELS[0]))
  const livesRef      = useRef(3)
  const scoreRef      = useRef(0)
  const cameraRef     = useRef(0)
  const rafRef        = useRef<number | null>(null)
  const handModeRef   = useRef(false)
  const keysRef       = useRef<Set<string>>(new Set())

  const handInputRef = useRef({ left: false, right: false, jump: false })
  const leftBufRef   = useRef(createGestureBuffer())
  const rightBufRef  = useRef(createGestureBuffer())
  const clapLatchRef       = useRef(false)
  const palmPauseLatchRef  = useRef(false)

  const canvasRef = useRef<HTMLDivElement>(null)

  // keep refs in sync
  useEffect(() => { phaseRef.current      = phase      }, [phase])
  useEffect(() => { livesRef.current      = lives      }, [lives])
  useEffect(() => { scoreRef.current      = score      }, [score])
  useEffect(() => { levelIndexRef.current = levelIndex }, [levelIndex])
  useEffect(() => {
    handModeRef.current = handMode
    if (!handMode) {
      handInputRef.current = { left: false, right: false, jump: false }
      leftBufRef.current   = createGestureBuffer()
      rightBufRef.current  = createGestureBuffer()
      clapLatchRef.current      = false
      palmPauseLatchRef.current = false
    }
  }, [handMode])

  // ── Load a level ──────────────────────────────────────────────────────────

  const loadLevel = useCallback((idx: number) => {
    const lvl = ALL_LEVELS[idx]
    const p   = makePlayer()
    const c   = coinsFromLevel(lvl)
    const e   = enemiesFromLevel(lvl)
    levelIndexRef.current = idx
    playerRef.current  = p
    coinsRef.current   = c
    enemiesRef.current = e
    cameraRef.current  = 0
    setLevelIndex(idx)
    setPlayer(p); setCoins(c); setEnemies(e); setCamera(0)
    setPhase('story'); phaseRef.current = 'story'
  }, [])

  // ── Full reset ────────────────────────────────────────────────────────────

  const resetGame = useCallback(() => {
    livesRef.current = 3
    scoreRef.current = 0
    setLives(3)
    setScore(0)
    loadLevel(0)
  }, [loadLevel])

  // ── Kill player ───────────────────────────────────────────────────────────

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
    const currentPhase = phaseRef.current
    if (currentPhase !== 'playing') {
      rafRef.current = requestAnimationFrame(tick)
      return
    }

    const lvl = ALL_LEVELS[levelIndexRef.current]
    const p   = { ...playerRef.current }
    const hand  = handInputRef.current
    const goLeft  = keysRef.current.has('a') || keysRef.current.has('arrowleft')  || hand.left
    const goRight = keysRef.current.has('d') || keysRef.current.has('arrowright') || hand.right
    const doJump  = keysRef.current.has('w') || keysRef.current.has('arrowup') ||
                    keysRef.current.has(' ')  || hand.jump

    if (goLeft && !goRight) { p.vx = -PLAYER_SPEED; p.facingRight = false }
    else if (goRight && !goLeft) { p.vx = PLAYER_SPEED; p.facingRight = true }
    else { p.vx = 0 }

    if (doJump && p.onGround) { p.vy = -JUMP_FORCE; p.onGround = false }
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
    for (const plat of lvl.platforms) {
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
      const hitWall = lvl.platforms.some(pl => {
        if (pl.kind === 'cloud') return false
        if (!rectOverlap(x, ey, PLAYER_W, PLAYER_H, pl.x, pl.y, pl.w, pl.h)) return false
        if (rectOverlap(prevX, ey, PLAYER_W, PLAYER_H, pl.x, pl.y, pl.w, pl.h)) return false
        if (ey + PLAYER_H <= pl.y + 4) return false
        return true
      })
      if (hitWall) { vx = -vx; x = prevX }
      const over = lvl.platforms.some(pl =>
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

    // Win / level clear
    if (p.x + PLAYER_W >= lvl.goalX) {
      playerRef.current = p; setPlayer({ ...p })
      const pts = scoreRef.current + 500; scoreRef.current = pts; setScore(pts)
      const nextIdx = levelIndexRef.current + 1
      if (nextIdx >= TOTAL_LEVELS) {
        setPhase('won'); phaseRef.current = 'won'
      } else {
        setPhase('levelClear'); phaseRef.current = 'levelClear'
      }
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
      const ph = phaseRef.current
      if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && ph === 'playing') {
        setPhase('paused'); phaseRef.current = 'paused'
      } else if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && ph === 'paused') {
        setPhase('playing'); phaseRef.current = 'playing'
      }
      if ((e.key === 'Enter' || e.key === ' ') && (ph === 'story' || ph === 'levelClear')) {
        setPhase('playing'); phaseRef.current = 'playing'
      }
      if ((e.key === 'Enter' || e.key === ' ') && (ph === 'gameOver' || ph === 'won')) {
        resetGame()
      }
      if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key.toLowerCase())) {
        e.preventDefault()
      }
    }
    function onKeyUp(e: KeyboardEvent) { keysRef.current.delete(e.key.toLowerCase()) }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup',   onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup',   onKeyUp)
    }
  }, [resetGame])

  // ── Hand tracking ──────────────────────────────────────────────────────────

  const handleHandData = useCallback((data: HandData) => {
    if (!handModeRef.current) return

    let leftX:  number | null = null
    let rightX: number | null = null
    let rawLeftGesture  = 'None'
    let rawRightGesture = 'None'
    let hasPalmPause    = false

    for (const hand of data.hands) {
      const g = hand.gestureScore >= MIN_GESTURE_CONF ? hand.gesture : 'None'
      const tipX = 1 - hand.indexTip.x

      if (hand.handedness === 'Left') {
        rawLeftGesture = g; leftX = tipX
      } else {
        rawRightGesture = g; rightX = tipX
      }
      if (g === GESTURE_OPEN_PALM) hasPalmPause = true
    }

    pushGesture(leftBufRef.current,  rawLeftGesture)
    pushGesture(rightBufRef.current, rawRightGesture)

    const leftGesture  = dominantGesture(leftBufRef.current)
    const rightGesture = dominantGesture(rightBufRef.current)

    const goLeft  = leftGesture  === GESTURE_FIST
    const goRight = rightGesture === GESTURE_FIST

    const bothVisible = leftX !== null && rightX !== null
    const isClap = bothVisible && Math.abs(rightX! - leftX!) < CLAP_THRESHOLD

    let doJump = false
    if (isClap && !clapLatchRef.current) {
      doJump = true; clapLatchRef.current = true
    } else if (!isClap) {
      clapLatchRef.current = false
    }

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

    const jumpLeft  = doJump && goLeft
    const jumpRight = doJump && goRight

    handInputRef.current = {
      left:  goLeft  || jumpLeft,
      right: goRight || jumpRight,
      jump:  doJump,
    }

    setHandDebug({ leftGesture, rightGesture, isClap })
  }, [])

  // ── Derived ────────────────────────────────────────────────────────────────

  const lvl            = ALL_LEVELS[levelIndex]
  const collectedCoins = coins.filter(c => c.collected).length
  const totalCoins     = lvl.coins.length
  const worldTheme = WORLD_COLORS[lvl.world]; const worldColor = worldTheme.sky

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

        <span className="pl-level-badge" style={{ background: worldColor }}>
          {WORLD_NAMES[lvl.world]} · Lv {lvl.levelInWorld + 1}/10
        </span>

        {phase === 'playing' && (
          <button className="pl-pause-btn"
            onClick={() => { setPhase('paused'); phaseRef.current = 'paused' }}>
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
      <div ref={canvasRef} className={`pl-canvas pl-canvas--${lvl.world}`}>

        {/* Parallax clouds */}
        <div className="pl-cloud pl-cloud--1" style={{ left: Math.max(0, 200  - camera * 0.3) }} />
        <div className="pl-cloud pl-cloud--2" style={{ left: Math.max(0, 600  - camera * 0.3) }} />
        <div className="pl-cloud pl-cloud--3" style={{ left: Math.max(0, 1100 - camera * 0.3) }} />
        <div className="pl-cloud pl-cloud--4" style={{ left: Math.max(0, 1700 - camera * 0.3) }} />
        <div className="pl-cloud pl-cloud--5" style={{ left: Math.max(0, 2400 - camera * 0.3) }} />

        {/* Platforms */}
        {lvl.platforms.map((plat, i) => {
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
            <div key={c.id} className="pl-coin"
              style={{ left: c.x - camera - 10, top: c.y - 10 }} aria-hidden>
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
              className={[
                'pl-enemy',
                e.squished       ? 'pl-enemy--squished' : '',
                e.kind === 'fast'    ? 'pl-enemy--fast'    : '',
                e.kind === 'flyer'   ? 'pl-enemy--flyer'   : '',
                e.kind === 'bouncer' ? 'pl-enemy--bouncer' : '',
                e.kind === 'boss'    ? 'pl-enemy--boss'    : '',
              ].filter(Boolean).join(' ')}
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

        {/* Goal flag / Golden Seed */}
        {(() => {
          const fx    = lvl.goalX - camera
          const viewW = canvasRef.current?.clientWidth ?? 900
          if (fx < viewW + 60) {
            const isFinalLevel = levelIndex === TOTAL_LEVELS - 1
            return (
              <div className="pl-flag" style={{ left: fx, top: GROUND_Y - 200 }}>
                <div className="pl-flag__pole" />
                <div className="pl-flag__banner">{isFinalLevel ? '🌟' : '🏁'}</div>
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
          style={{ left: sx, top: py }} aria-label="Pip">
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

        {/* ── Story / Level-start card ─────────────────────────────────── */}
        {phase === 'story' && (
          <div className="pl-overlay">
            <div className="pl-overlay__box pl-overlay__box--story"
              style={{ borderColor: worldColor }}>
              <div className="pl-overlay__world-badge" style={{ background: worldColor }}>
                {WORLD_NAMES[lvl.world]}
              </div>
              <div className="pl-overlay__level-title">{lvl.storyTitle}</div>
              <div className="pl-overlay__level-num">
                Level {levelIndex + 1} / {TOTAL_LEVELS}
              </div>
              <p className="pl-overlay__flavour">{lvl.storyText}</p>
              <button className="pl-btn pl-btn--story"
                style={{ background: worldColor }}
                onClick={() => { setPhase('playing'); phaseRef.current = 'playing' }}>
                ▶ Play
              </button>
              <div className="pl-overlay__hint">Press Enter or Space to start</div>
            </div>
          </div>
        )}

        {/* ── Level clear ───────────────────────────────────────────────── */}
        {phase === 'levelClear' && (
          <div className="pl-overlay">
            <div className="pl-overlay__box pl-overlay__box--win">
              <div className="pl-overlay__emoji">⭐</div>
              <div className="pl-overlay__title pl-overlay__title--win">
                Level Clear!
              </div>
              <div className="pl-overlay__sub">Score: {score.toLocaleString()}</div>
              <div className="pl-overlay__sub">Coins: {collectedCoins}/{totalCoins}</div>
              <button className="pl-btn"
                onClick={() => loadLevel(levelIndex + 1)}>
                Next Level →
              </button>
            </div>
          </div>
        )}

        {/* ── Pause overlay ─────────────────────────────────────────────── */}
        {phase === 'paused' && (
          <div className="pl-overlay">
            <div className="pl-overlay__box">
              <div className="pl-overlay__title">⏸ PAUSED</div>
              <div className="pl-overlay__sub">Press P / Esc · or click Resume</div>
              {handMode && <div className="pl-overlay__sub">🖐️ Open palm to resume</div>}
            </div>
          </div>
        )}

        {/* ── Win (all 50 levels) ───────────────────────────────────────── */}
        {phase === 'won' && (
          <div className="pl-overlay">
            <div className="pl-overlay__box pl-overlay__box--win">
              <div className="pl-overlay__emoji">🌟</div>
              <div className="pl-overlay__title pl-overlay__title--win">
                YOU SAVED THE MEADOW REALM!
              </div>
              <div className="pl-overlay__sub">Pip reclaims the Golden Seed!</div>
              <div className="pl-overlay__sub">Final Score: {score.toLocaleString()}</div>
              <div className="pl-overlay__sub">Coins: {collectedCoins}/{totalCoins}</div>
              <button className="pl-btn" onClick={resetGame}>Play Again</button>
            </div>
          </div>
        )}

        {/* ── Game over ─────────────────────────────────────────────────── */}
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

      </div>

      {/* ── Hand panel ───────────────────────────────────────────────────── */}
      {handMode && (
        <div className="pl-hand-panel"
          onMouseMove={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
          <div className="pl-hand-panel__camera">
            <HandRecognitionPanel onHandData={handleHandData} autoStart defaultCollapsed={false} />
          </div>
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
              <span key={i} className="pl-life-icon" aria-hidden>🌱</span>
            ))}
          </span>
        </div>
        <div className="pl-hud-cell">
          <span className="pl-hud-cell__label">LEVEL</span>
          <span className="pl-hud-cell__value">{levelIndex + 1} / {TOTAL_LEVELS}</span>
        </div>
        <div className="pl-hud-cell pl-hud-cell--wide">
          <span className="pl-hud-cell__label">PROGRESS</span>
          <div className="pl-progress-bar">
            <div className="pl-progress-bar__fill"
              style={{ width: `${Math.min(100, (player.x / lvl.goalX) * 100).toFixed(1)}%` }} />
            <span className="pl-progress-bar__flag">🏁</span>
          </div>
        </div>
      </div>
    </div>
  )
}
