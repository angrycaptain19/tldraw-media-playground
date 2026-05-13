// ─── DuckHuntGame Component ──────────────────────────────────────────────────
// Full Duck Hunt implementation with:
//   • Animated ducks flying across the sky (requestAnimationFrame loop)
//   • Mouse/touch aiming (crosshair) + click to shoot
//   • Hand-tracking support: index tip → crosshair, Closed_Fist (dwell) → shoot
//   • HUD: Score, Hi-Score, Round, Shots Left (ammo icons), Ducks Hit, Pause
//   • Round progression, game-over on out of shots, dog laugh on miss

import { useCallback, useEffect, useRef, useState } from 'react'
import HandRecognitionPanel from './HandRecognitionPanel'
import type { HandData } from '../hooks/useHandRecognition'
import { GESTURE_FIST, GESTURE_NONE } from '../hooks/useHandRecognition'
import './DuckHuntGame.css'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Duck {
  id: number
  x: number       // px from left of sky
  y: number       // px from top of sky
  vx: number      // velocity x px/frame
  vy: number      // velocity y px/frame
  alive: boolean
  falling: boolean // after being shot
  fallVy: number  // fall speed
  visible: boolean
}

type GamePhase = 'idle' | 'playing' | 'roundOver' | 'missed' | 'gameOver'

// ── Constants ─────────────────────────────────────────────────────────────────

const DUCKS_PER_ROUND  = 3
const SHOTS_PER_ROUND  = 3
const DUCK_SIZE        = 52   // px - rendered duck diameter
const DUCK_SPEED_BASE  = 2.5  // px per frame at 60 fps
const DUCK_SPEED_INC   = 0.4  // speed increase per round
const POINTS_PER_DUCK  = 100
const MISSED_DELAY_MS  = 1800 // how long "Missed!" shows before next duck
const ROUND_OVER_MS    = 1600 // how long round-clear shows

// Hand-tracking fire dwell
const FIRE_DWELL_FRAMES = 8  // ~130 ms at 60 fps

// ── Duck factory ─────────────────────────────────────────────────────────────

let duckIdCounter = 0

function makeDuck(skyW: number, skyH: number, round: number): Duck {
  const speed = DUCK_SPEED_BASE + (round - 1) * DUCK_SPEED_INC
  const fromLeft = Math.random() < 0.5
  const x = fromLeft ? -DUCK_SIZE : skyW + DUCK_SIZE
  const y = skyH * (0.1 + Math.random() * 0.55)
  const vx = fromLeft ? speed : -speed
  const vy = (Math.random() - 0.5) * speed * 0.6

  return {
    id: ++duckIdCounter,
    x,
    y,
    vx,
    vy,
    alive: true,
    falling: false,
    fallVy: 0,
    visible: true,
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DuckHuntGame() {
  // ── Game state ─────────────────────────────────────────────────────────────
  const [phase, setPhase]         = useState<GamePhase>('idle')
  const [round, setRound]         = useState(1)
  const [score, setScore]         = useState(0)
  const [hiScore, setHiScore]     = useState(9900)
  const [shotsLeft, setShotsLeft] = useState(SHOTS_PER_ROUND)
  const [ducksHit, setDucksHit]   = useState(0)
  const [totalHit, setTotalHit]   = useState(0)
  const [paused, setPaused]       = useState(false)
  const [ducks, setDucks]         = useState<Duck[]>([])
  const [crosshair, setCrosshair] = useState<{ x: number; y: number } | null>(null)
  const [handMode, setHandMode]   = useState(false)

  // ── Refs (for rAF loop without stale closures) ─────────────────────────────
  const skyRef       = useRef<HTMLDivElement>(null)
  const phaseRef     = useRef<GamePhase>('idle')
  const pausedRef    = useRef(false)
  const roundRef     = useRef(1)
  const scoreRef     = useRef(0)
  const hiScoreRef   = useRef(9900)
  const shotsRef     = useRef(SHOTS_PER_ROUND)
  const ducksHitRef  = useRef(0)
  const totalHitRef  = useRef(0)
  const ducksRef     = useRef<Duck[]>([])
  const rafRef       = useRef<number | null>(null)

  // Hand tracking refs
  const fireDwellRef = useRef(0)
  const lastFireRef  = useRef(0)

  // keep refs in sync with state
  useEffect(() => { phaseRef.current   = phase    }, [phase])
  useEffect(() => { pausedRef.current  = paused   }, [paused])
  useEffect(() => { roundRef.current   = round    }, [round])
  useEffect(() => { scoreRef.current   = score    }, [score])
  useEffect(() => { hiScoreRef.current = hiScore  }, [hiScore])
  useEffect(() => { shotsRef.current   = shotsLeft}, [shotsLeft])
  useEffect(() => { ducksHitRef.current = ducksHit}, [ducksHit])
  useEffect(() => { totalHitRef.current = totalHit}, [totalHit])
  useEffect(() => { ducksRef.current   = ducks    }, [ducks])

  // ── Fire (shoot) logic ─────────────────────────────────────────────────────

  const fire = useCallback((px: number, py: number) => {
    if (phaseRef.current !== 'playing') return
    if (pausedRef.current) return
    if (shotsRef.current <= 0) return

    const now = performance.now()
    // Debounce: don't fire faster than once per 350ms
    if (now - lastFireRef.current < 350) return
    lastFireRef.current = now

    const newShots = shotsRef.current - 1
    setShotsLeft(newShots)
    shotsRef.current = newShots

    // Hit detection: check if any alive duck bbox contains the click
    const hitIdx = ducksRef.current.findIndex(d => {
      if (!d.alive || d.falling) return false
      const r = DUCK_SIZE / 2 + 8  // generous hit radius
      return Math.abs(d.x - px) < r && Math.abs(d.y - py) < r
    })

    if (hitIdx >= 0) {
      // Duck hit!
      setDucks(prev => prev.map((d, i) =>
        i === hitIdx ? { ...d, alive: false, falling: true, fallVy: -2 } : d
      ))

      const newScore = scoreRef.current + POINTS_PER_DUCK
      const newHit   = ducksHitRef.current + 1
      const newTotal = totalHitRef.current + 1

      setScore(newScore)
      scoreRef.current = newScore

      setDucksHit(newHit)
      ducksHitRef.current = newHit

      setTotalHit(newTotal)
      totalHitRef.current = newTotal

      if (newScore > hiScoreRef.current) {
        setHiScore(newScore)
        hiScoreRef.current = newScore
      }

      // Check if all ducks in round are gone
      const remainingAlive = ducksRef.current.filter((d, i) =>
        i !== hitIdx && d.alive && !d.falling
      ).length

      if (remainingAlive === 0) {
        // All ducks down — round over after fall animation
        setTimeout(() => {
          if (phaseRef.current === 'playing') {
            setPhase('roundOver')
            phaseRef.current = 'roundOver'
          }
        }, 800)
      }

      return
    }

    // Missed: no duck hit — check if out of shots
    if (newShots <= 0) {
      const anyAlive = ducksRef.current.some(d => d.alive && !d.falling)
      if (anyAlive) {
        setTimeout(() => {
          if (phaseRef.current === 'playing') {
            setPhase('missed')
            phaseRef.current = 'missed'
          }
        }, 200)
      }
    }
  }, [])

  // ── rAF animation loop ─────────────────────────────────────────────────────

  const tick = useCallback(() => {
    if (!pausedRef.current && phaseRef.current === 'playing') {
      const sky = skyRef.current
      if (sky) {
        const W = sky.clientWidth
        const H = sky.clientHeight

        setDucks(prev => {
          const next = prev.map(d => {
            if (!d.visible) return d

            if (d.falling) {
              const ny  = d.y + d.fallVy + 2
              const nvy = d.fallVy + 0.4
              const visible = ny < H + DUCK_SIZE * 2
              return { ...d, y: ny, fallVy: nvy, visible }
            }

            if (!d.alive) return d

            // Normal flight
            let nx  = d.x + d.vx
            let ny  = d.y + d.vy
            const nvx = d.vx
            let nvy = d.vy

            // Bounce off top/bottom of sky
            if (ny < DUCK_SIZE / 2) {
              ny  = DUCK_SIZE / 2
              nvy = Math.abs(nvy)
            }
            if (ny > H * 0.8) {
              ny  = H * 0.8
              nvy = -Math.abs(nvy)
            }

            const visible = nx > -DUCK_SIZE * 3 && nx < W + DUCK_SIZE * 3

            return { ...d, x: nx, y: ny, vx: nvx, vy: nvy, visible }
          })

          // Check if all ducks have left (escaped or dead)
          const anyOnScreen = next.some(d => d.visible && (d.alive || d.falling))
          if (!anyOnScreen && phaseRef.current === 'playing') {
            const allDead = next.every(d => !d.alive)
            if (!allDead) {
              // Some ducks escaped
              setTimeout(() => {
                if (phaseRef.current === 'playing') {
                  setPhase('missed')
                  phaseRef.current = 'missed'
                }
              }, 100)
            }
          }

          ducksRef.current = next
          return next
        })
      }
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [])

  // Start/stop rAF
  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [tick])

  // ── Game control functions ─────────────────────────────────────────────────

  const spawnDucks = useCallback((skyW: number, skyH: number, r: number) => {
    const newDucks: Duck[] = Array.from({ length: DUCKS_PER_ROUND }, () =>
      makeDuck(skyW, skyH, r)
    )
    // Stagger start positions so ducks don't all spawn simultaneously
    newDucks.forEach((d, i) => {
      d.x += d.vx * i * 40
    })
    setDucks(newDucks)
    ducksRef.current = newDucks
  }, [])

  const startRound = useCallback((r: number) => {
    setShotsLeft(SHOTS_PER_ROUND)
    shotsRef.current = SHOTS_PER_ROUND
    setDucksHit(0)
    ducksHitRef.current = 0
    setPhase('playing')
    phaseRef.current = 'playing'
    setPaused(false)
    pausedRef.current = false

    const sky = skyRef.current
    const W = sky ? sky.clientWidth  : 800
    const H = sky ? sky.clientHeight : 500
    spawnDucks(W, H, r)
  }, [spawnDucks])

  const startGame = useCallback(() => {
    setRound(1)
    roundRef.current = 1
    setScore(0)
    scoreRef.current = 0
    setTotalHit(0)
    totalHitRef.current = 0
    startRound(1)
  }, [startRound])

  const nextRound = useCallback(() => {
    const r = roundRef.current + 1
    setRound(r)
    roundRef.current = r
    startRound(r)
  }, [startRound])

  // Advance from 'missed' phase
  const continuePlaying = useCallback(() => {
    if (shotsRef.current <= 0) {
      setPhase('gameOver')
      phaseRef.current = 'gameOver'
    } else {
      const sky = skyRef.current
      const W = sky ? sky.clientWidth  : 800
      const H = sky ? sky.clientHeight : 500
      spawnDucks(W, H, roundRef.current)
      setPhase('playing')
      phaseRef.current = 'playing'
    }
  }, [spawnDucks])

  // Auto-advance from roundOver / missed phases
  useEffect(() => {
    if (phase === 'roundOver') {
      const t = setTimeout(nextRound, ROUND_OVER_MS)
      return () => clearTimeout(t)
    }
    if (phase === 'missed') {
      const t = setTimeout(continuePlaying, MISSED_DELAY_MS)
      return () => clearTimeout(t)
    }
  }, [phase, nextRound, continuePlaying])

  // ── Mouse / touch aiming ───────────────────────────────────────────────────

  const getSkyPos = useCallback((clientX: number, clientY: number) => {
    const sky = skyRef.current
    if (!sky) return null
    const rect = sky.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }, [])

  const handleSkyMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (handMode) return
    const pos = getSkyPos(e.clientX, e.clientY)
    setCrosshair(pos)
  }, [handMode, getSkyPos])

  const handleSkyMouseLeave = useCallback(() => {
    if (handMode) return
    setCrosshair(null)
  }, [handMode])

  const handleSkyClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (handMode) return
    const pos = getSkyPos(e.clientX, e.clientY)
    if (!pos) return
    fire(pos.x, pos.y)
  }, [handMode, getSkyPos, fire])

  const handleSkyTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (handMode) return
    const t = e.touches[0]
    const pos = getSkyPos(t.clientX, t.clientY)
    if (!pos) return
    setCrosshair(pos)
    fire(pos.x, pos.y)
  }, [handMode, getSkyPos, fire])

  // ── Hand tracking ──────────────────────────────────────────────────────────

  const handleHandData = useCallback((data: HandData) => {
    const sky = skyRef.current
    if (!sky) return
    if (!handMode) return

    if (data.hands.length === 0) {
      fireDwellRef.current = 0
      return
    }

    const hand = data.hands[0]
    const { indexTip, gesture } = hand

    // Mirror x (selfie camera flip)
    const mirroredX = 1 - indexTip.x

    const rect = sky.getBoundingClientRect()
    const px = mirroredX * rect.width
    const py = indexTip.y * rect.height

    setCrosshair({ x: px, y: py })

    // Dwell-based fire: Closed_Fist gesture
    if (gesture === GESTURE_FIST) {
      fireDwellRef.current += 1
    } else if (gesture === GESTURE_NONE) {
      fireDwellRef.current = Math.max(0, fireDwellRef.current - 1)
    } else {
      fireDwellRef.current = 0
    }

    if (fireDwellRef.current >= FIRE_DWELL_FRAMES) {
      fireDwellRef.current = 0
      fire(px, py)
    }
  }, [handMode, fire])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        if (phaseRef.current === 'playing') {
          setPaused(p => {
            pausedRef.current = !p
            return !p
          })
        }
      }
      if (e.key === ' ' || e.key === 'Enter') {
        if (phaseRef.current === 'idle' || phaseRef.current === 'gameOver') {
          startGame()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [startGame])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="dh-container">

      {/* ── Control bar ──────────────────────────────────────────────── */}
      <div className="dh-control-bar">
        <span className="dh-control-bar__label">Aim:</span>
        <button
          className={`dh-mode-btn${!handMode ? ' dh-mode-btn--active' : ''}`}
          onClick={() => setHandMode(false)}
        >
          🖱️ Mouse
        </button>
        <button
          className={`dh-mode-btn${handMode ? ' dh-mode-btn--active' : ''}`}
          onClick={() => setHandMode(true)}
        >
          ✋ Hand Tracking
        </button>

        {(phase === 'idle' || phase === 'gameOver') && (
          <button className="dh-start-btn" onClick={startGame}>
            {phase === 'gameOver' ? '🔄 Play Again' : '🎮 Start Game'}
          </button>
        )}
        {phase === 'playing' && (
          <button
            className={`dh-pause-btn-sm${paused ? ' dh-pause-btn-sm--active' : ''}`}
            onClick={() => {
              setPaused(p => {
                pausedRef.current = !p
                return !p
              })
            }}
          >
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
        )}
      </div>

      {/* ── Hand panel (shown when hand mode active) ──────────────── */}
      {handMode && (
        <div className="dh-hand-panel">
          <HandRecognitionPanel onHandData={handleHandData} />
          <div className="dh-hand-hint">
            <strong>Point</strong> index finger to aim ·{' '}
            <strong>Close fist</strong> to shoot (~0.3 s dwell)
          </div>
        </div>
      )}

      {/* ── Sky / Game Canvas ─────────────────────────────────────── */}
      <div
        ref={skyRef}
        className={`dh-sky${paused ? ' dh-sky--paused' : ''}`}
        onMouseMove={handleSkyMouseMove}
        onMouseLeave={handleSkyMouseLeave}
        onClick={handleSkyClick}
        onTouchStart={handleSkyTouchStart}
      >
        {/* Decorative clouds */}
        <div className="dh-cloud dh-cloud--1" />
        <div className="dh-cloud dh-cloud--2" />
        <div className="dh-cloud dh-cloud--3" />

        {/* Pause overlay */}
        {paused && phase === 'playing' && (
          <div className="dh-overlay">
            <div className="dh-overlay__box">
              <div className="dh-overlay__title">⏸ PAUSED</div>
              <div className="dh-overlay__sub">Press P or click Resume</div>
            </div>
          </div>
        )}

        {/* Idle splash */}
        {phase === 'idle' && (
          <div className="dh-overlay">
            <div className="dh-overlay__box dh-overlay__box--splash">
              <div className="dh-splash-duck">🦆</div>
              <div className="dh-overlay__title">DUCK HUNT</div>
              <div className="dh-overlay__sub">Click Start Game or press Space</div>
              <div className="dh-overlay__hint">
                Mouse: click to shoot<br />
                Hand mode: close fist to fire
              </div>
            </div>
          </div>
        )}

        {/* Game Over */}
        {phase === 'gameOver' && (
          <div className="dh-overlay">
            <div className="dh-overlay__box dh-overlay__box--gameover">
              <div className="dh-overlay__title dh-overlay__title--gameover">GAME OVER</div>
              <div className="dh-gameover-dog">🐕</div>
              <div className="dh-overlay__sub">
                Score: {score}
                {score >= hiScore && score > 0 ? ' 🏆 NEW HI-SCORE!' : ''}
              </div>
              <div className="dh-overlay__sub">Total ducks: {totalHit}</div>
              <button className="dh-btn dh-btn--play-again" onClick={startGame}>
                Play Again
              </button>
            </div>
          </div>
        )}

        {/* Round clear */}
        {phase === 'roundOver' && (
          <div className="dh-round-clear">
            <div className="dh-round-clear__emoji">🎉</div>
            <div className="dh-round-clear__text">Round {round} Clear!</div>
          </div>
        )}

        {/* Missed overlay (dog laughing) */}
        {phase === 'missed' && (
          <div className="dh-missed-overlay">
            <div className="dh-missed-dog">🐕</div>
            <div className="dh-missed-text">HA HA HA!</div>
          </div>
        )}

        {/* Animated ducks */}
        {ducks.map(duck => {
          if (!duck.visible) return null
          return (
            <div
              key={duck.id}
              className={[
                'dh-duck-sprite',
                !duck.alive && duck.falling ? 'dh-duck-sprite--falling' : '',
                duck.vx < 0 ? 'dh-duck-sprite--left' : '',
              ].filter(Boolean).join(' ')}
              style={{ left: duck.x, top: duck.y }}
              aria-hidden
            >
              {duck.alive || duck.falling ? (
                /* Living / falling duck */
                <svg viewBox="0 0 52 52" width={DUCK_SIZE} height={DUCK_SIZE} aria-hidden>
                  <ellipse cx="26" cy="32" rx="18" ry="13" fill="#22c55e" />
                  <circle  cx="26" cy="16" r="9"           fill="#16a34a" />
                  <circle  cx={duck.vx >= 0 ? 30 : 22} cy="14" r="2" fill="#fff" />
                  <circle  cx={duck.vx >= 0 ? 31 : 21} cy="14" r="1" fill="#111" />
                  <ellipse cx={duck.vx >= 0 ? 36 : 16} cy="17" rx="5" ry="3" fill="#f97316" />
                  <ellipse cx="26" cy="30" rx="10" ry="6" fill="#15803d" />
                  <line x1="20" y1="44" x2="16" y2="50" stroke="#f97316" strokeWidth="2" strokeLinecap="round" />
                  <line x1="26" y1="44" x2="24" y2="50" stroke="#f97316" strokeWidth="2" strokeLinecap="round" />
                  <line x1="32" y1="44" x2="34" y2="50" stroke="#f97316" strokeWidth="2" strokeLinecap="round" />
                </svg>
              ) : null}
            </div>
          )
        })}

        {/* Crosshair */}
        {crosshair && phase === 'playing' && !paused && (
          <div
            className="dh-crosshair"
            style={{ left: crosshair.x, top: crosshair.y }}
            aria-hidden
          >
            <svg viewBox="0 0 36 36" width="36" height="36">
              <circle cx="18" cy="18" r="13" fill="none"    stroke="#ef4444" strokeWidth="2.5" />
              <circle cx="18" cy="18" r="2"  fill="#ef4444" />
              <line x1="18" y1="0"  x2="18" y2="9"  stroke="#ef4444" strokeWidth="2.5" />
              <line x1="18" y1="27" x2="18" y2="36" stroke="#ef4444" strokeWidth="2.5" />
              <line x1="0"  y1="18" x2="9"  y2="18" stroke="#ef4444" strokeWidth="2.5" />
              <line x1="27" y1="18" x2="36" y2="18" stroke="#ef4444" strokeWidth="2.5" />
            </svg>
          </div>
        )}

        {/* "No shots left" notice */}
        {shotsLeft <= 0 && phase === 'playing' && (
          <div className="dh-shot-counter" aria-live="polite">
            No shots left!
          </div>
        )}
      </div>

      {/* ── Ground / Grass strip ─────────────────────────────────────── */}
      <div className="dh-ground">
        <div className="dh-bush" style={{ left: '2%' }} />
        <div className="dh-bush" style={{ left: '14%' }} />
        <div className="dh-bush" style={{ left: '75%' }} />
        <div className="dh-bush" style={{ left: '88%' }} />
      </div>

      {/* ── HUD bar ──────────────────────────────────────────────────── */}
      <div className="dh-hud">
        <div className="dh-hud-cell">
          <span className="dh-hud-cell__label">SCORE</span>
          <span className="dh-hud-cell__value">{score.toString().padStart(5, '0')}</span>
        </div>

        <div className="dh-hud-cell">
          <span className="dh-hud-cell__label">HI-SCORE</span>
          <span className="dh-hud-cell__value">{hiScore.toString().padStart(5, '0')}</span>
        </div>

        <div className="dh-hud-cell">
          <span className="dh-hud-cell__label">ROUND</span>
          <span className="dh-hud-cell__value">{round}</span>
        </div>

        <div className="dh-hud-cell">
          <span className="dh-hud-cell__label">SHOTS</span>
          <span className="dh-hud-cell__ammo" aria-label={`${shotsLeft} shots left`}>
            {Array.from({ length: SHOTS_PER_ROUND }).map((_, i) => (
              <span
                key={i}
                className={`dh-ammo-bullet${i < shotsLeft ? '' : ' dh-ammo-bullet--spent'}`}
                aria-hidden
              />
            ))}
          </span>
        </div>

        <div className="dh-hud-cell">
          <span className="dh-hud-cell__label">HIT</span>
          <span className="dh-hud-cell__value">{ducksHit}/{DUCKS_PER_ROUND}</span>
        </div>

        <div className="dh-hud-cell">
          <span className="dh-hud-cell__label">TOTAL</span>
          <span className="dh-hud-cell__value">{totalHit}</span>
        </div>
      </div>
    </div>
  )
}
