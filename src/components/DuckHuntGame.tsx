// ─── DuckHuntGame Component ──────────────────────────────────────────────────
// Full Duck Hunt implementation with correct classic gameplay rules:
//   • 3 game modes: Game A (1 duck at a time), Game B (2 ducks at a time),
//     Game C (clay pigeons — 2 fast discs at a time)
//   • 10 birds per round; ducks appear one / two at a time in sequence
//   • 3 shots per individual duck (NOT a shared round pool)
//   • Miss all 3 on a duck → dog laughs, duck flies away; next duck spawns
//   • Pass condition: hit required minimum ducks per round; fail → game over
//   • Duck speed increases each round; direction changes at fixed engine ticks
//   • 3-frame wing-flap animation loop
//   • HUD: Score, Hi-Score, Round, Shots (3 bullets, reset per duck), Hit/10
//   • Visual shot feedback: muzzle-flash, hit explosion, miss ripple
//   • Hand-tracking support: index tip → crosshair, Closed_Fist (dwell) → fire

import { useCallback, useEffect, useRef, useState } from 'react'
import HandRecognitionPanel from './HandRecognitionPanel'
import type { HandData } from '../hooks/useHandRecognition'
import { GESTURE_FIST, GESTURE_NONE } from '../hooks/useHandRecognition'
import './DuckHuntGame.css'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Duck {
  id: number
  x: number        // px from left of sky
  y: number        // px from top of sky
  vx: number       // velocity x px/frame
  vy: number       // velocity y px/frame
  alive: boolean
  hit: boolean     // tumbling after being shot
  escaped: boolean // flew away without being hit
  visible: boolean
  wingFrame: number  // 0 | 1 | 2  (3-frame flap loop)
  dirTimer: number   // ticks until next direction change
}

type GameMode  = 'A' | 'B' | 'C'   // A=1 duck, B=2 ducks, C=clay pigeons
type GamePhase =
  | 'modeSelect'
  | 'playing'
  | 'birdResult'  // brief pause between birds (dog laugh or success)
  | 'roundOver'   // round passed — transition to next
  | 'roundFail'   // round failed — game over
  | 'gameOver'

// ── Shot-effect types ──────────────────────────────────────────────────────────

type ShotKind = 'hit' | 'miss'

interface ShotEffect {
  id: number
  x: number
  y: number
  kind: ShotKind
}

let shotEffectIdCounter = 0

// ── Constants ─────────────────────────────────────────────────────────────────

const BIRDS_PER_ROUND  = 10           // total birds each round
const SHOTS_PER_BIRD   = 3            // shots per individual duck / pair
const DUCK_SIZE        = 52           // px — rendered duck sprite
const DUCK_SPEED_BASE  = 2.0          // px/frame at round 1
const DUCK_SPEED_INC   = 0.35         // extra px/frame per round
const POINTS_PER_DUCK  = 1000         // base score (+ round bonus)
const BIRD_RESULT_MS   = 2000         // ms — dog laugh or hit flash
const ROUND_OVER_MS    = 2200         // ms — round-clear banner
const ROUND_FAIL_MS    = 2500         // ms — fail banner → game over
const DIR_CHANGE_TICKS = 90           // frames between direction flips
const WING_ANIM_TICKS  = 8            // frames per wing-flap frame
const MIN_DUCKS_PASS   = 6            // ducks you must hit to pass a round

// Per-mode simultaneous ducks
const DUCKS_IN_FLIGHT: Record<GameMode, number> = { A: 1, B: 2, C: 2 }

// Hand-tracking fire dwell
const FIRE_DWELL_FRAMES = 8  // ~130 ms at 60 fps

// ── Duck factory ─────────────────────────────────────────────────────────────

let duckIdCounter = 0

/** Classic zigzag duck — enters from bottom, flies upward */
function makeDuck(skyW: number, skyH: number, round: number): Duck {
  const speed    = DUCK_SPEED_BASE + (round - 1) * DUCK_SPEED_INC
  const fromLeft = Math.random() < 0.5
  const x        = fromLeft
    ? skyW * (0.1 + Math.random() * 0.3)
    : skyW * (0.6 + Math.random() * 0.3)
  const y   = skyH + DUCK_SIZE           // start just below visible area
  const vx  = (fromLeft ? 1 : -1) * speed * (0.6 + Math.random() * 0.4)
  const vy  = -(speed * (0.8 + Math.random() * 0.4))  // upward

  return {
    id: ++duckIdCounter,
    x, y, vx, vy,
    alive: true, hit: false, escaped: false, visible: true,
    wingFrame: 0,
    dirTimer: DIR_CHANGE_TICKS,
  }
}

/** Clay pigeon — disc launched from a corner, fast arc */
function makeClay(skyW: number, skyH: number, round: number, index: number): Duck {
  const speed    = (DUCK_SPEED_BASE + (round - 1) * DUCK_SPEED_INC) * 1.4
  const fromLeft = index % 2 === 0
  const x        = fromLeft ? 0 : skyW
  const y        = skyH * 0.85
  const vx       = fromLeft ? speed * 1.2 : -speed * 1.2
  const vy       = -(speed * 1.6)   // steep upward arc

  return {
    id: ++duckIdCounter,
    x, y, vx, vy,
    alive: true, hit: false, escaped: false, visible: true,
    wingFrame: 0,
    dirTimer: 9999,  // clay pigeons don't zigzag
  }
}

// ── Mode Select Screen ────────────────────────────────────────────────────────

function ModeSelectScreen({ onSelect }: { onSelect: (mode: GameMode) => void }) {
  return (
    <div className="dh-mode-select">
      <div className="dh-mode-select__box">
        <div className="dh-mode-select__duck">🦆</div>
        <div className="dh-mode-select__title">DUCK HUNT</div>
        <div className="dh-mode-select__subtitle">Select Game Mode</div>
        <div className="dh-mode-select__buttons">
          <button className="dh-mode-select__btn dh-mode-select__btn--1p" onClick={() => onSelect('A')}>
            <span className="dh-mode-select__btn-icon">🦆</span>
            <span className="dh-mode-select__btn-label">GAME A</span>
            <span className="dh-mode-select__btn-desc">1 duck · 3 shots per duck · 10 ducks/round</span>
          </button>
          <button className="dh-mode-select__btn dh-mode-select__btn--2p" onClick={() => onSelect('B')}>
            <span className="dh-mode-select__btn-icon">🦆🦆</span>
            <span className="dh-mode-select__btn-label">GAME B</span>
            <span className="dh-mode-select__btn-desc">2 ducks · 3 shots each · 10 ducks/round</span>
          </button>
          <button className="dh-mode-select__btn dh-mode-select__btn--clay" onClick={() => onSelect('C')}>
            <span className="dh-mode-select__btn-icon">🥏🥏</span>
            <span className="dh-mode-select__btn-label">GAME C</span>
            <span className="dh-mode-select__btn-desc">Clay pigeons · Fast discs · 10 pairs/round</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── SVG duck sprite (3-frame wing animation) ──────────────────────────────────

function DuckSvg({ facing, wingFrame }: { facing: 'left' | 'right'; wingFrame: number }) {
  // wing cy: 0=up(24) 1=mid(28) 2=down(32)
  const wingY = wingFrame === 0 ? 24 : wingFrame === 1 ? 28 : 32
  const eyeX  = facing === 'right' ? 30 : 22
  const billX = facing === 'right' ? 36 : 16

  return (
    <svg viewBox="0 0 52 52" width={DUCK_SIZE} height={DUCK_SIZE} aria-hidden>
      <ellipse cx="26" cy="32" rx="18" ry="13" fill="#22c55e" />
      <circle  cx="26" cy="16" r="9"           fill="#16a34a" />
      <circle  cx={eyeX} cy="14" r="2" fill="#fff" />
      <circle  cx={facing === 'right' ? eyeX + 1 : eyeX - 1} cy="14" r="1" fill="#111" />
      <ellipse cx={billX} cy="17" rx="5" ry="3" fill="#f97316" />
      <ellipse cx="26" cy={wingY} rx="10" ry="6" fill="#15803d" />
      <line x1="20" y1="44" x2="16" y2="50" stroke="#f97316" strokeWidth="2" strokeLinecap="round" />
      <line x1="26" y1="44" x2="24" y2="50" stroke="#f97316" strokeWidth="2" strokeLinecap="round" />
      <line x1="32" y1="44" x2="34" y2="50" stroke="#f97316" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/** Spinning clay pigeon disc */
function ClaySvg({ angle }: { angle: number }) {
  return (
    <svg viewBox="0 0 52 52" width={DUCK_SIZE} height={DUCK_SIZE} aria-hidden
      style={{ transform: `rotate(${angle}deg)` }}>
      <ellipse cx="26" cy="26" rx="20" ry="9" fill="#f97316" />
      <ellipse cx="26" cy="26" rx="16" ry="5" fill="#fb923c" />
      <ellipse cx="26" cy="26" rx="7"  ry="3" fill="#fdba74" />
    </svg>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DuckHuntGame() {
  // ── Settings ────────────────────────────────────────────────────────────────
  const [gameMode, setGameMode] = useState<GameMode>('A')

  // ── Game state ─────────────────────────────────────────────────────────────
  const [phase, setPhase]           = useState<GamePhase>('modeSelect')
  const [round, setRound]           = useState(1)
  const [score, setScore]           = useState(0)
  const [hiScore, setHiScore]       = useState(9900)
  const [shotsLeft, setShotsLeft]   = useState(SHOTS_PER_BIRD)
  const [birdsHit, setBirdsHit]     = useState(0)    // ducks hit this round
  const [birdsTotal, setBirdsTotal] = useState(0)    // birds released so far this round
  const [paused, setPaused]         = useState(false)
  const [ducks, setDucks]           = useState<Duck[]>([])
  const [crosshair, setCrosshair]   = useState<{ x: number; y: number } | null>(null)
  const [handMode, setHandMode]     = useState(false)
  const [shotEffects, setShotEffects] = useState<ShotEffect[]>([])
  const [firing, setFiring]           = useState(false)
  const firingTimerRef                = useRef<ReturnType<typeof setTimeout> | null>(null)

  // birdResult sub-state
  const [lastBirdHit, setLastBirdHit] = useState(false)
  const [dogVisible, setDogVisible]   = useState(false)
  const [clayAngle, setClayAngle]     = useState(0)

  // ── Refs (rAF loop) ────────────────────────────────────────────────────────
  const skyRef           = useRef<HTMLDivElement>(null)
  const phaseRef         = useRef<GamePhase>('modeSelect')
  const pausedRef        = useRef(false)
  const roundRef         = useRef(1)
  const scoreRef         = useRef(0)
  const hiScoreRef       = useRef(9900)
  const shotsRef         = useRef(SHOTS_PER_BIRD)
  const birdsHitRef      = useRef(0)
  const birdsTotalRef    = useRef(0)
  const ducksRef         = useRef<Duck[]>([])
  const rafRef           = useRef<number | null>(null)
  const gameModeRef      = useRef<GameMode>('A')
  const tickCountRef     = useRef(0)

  // Hand tracking refs
  const fireDwellRef  = useRef(0)
  const lastFireRef   = useRef(0)
  const handModeRef   = useRef(false)

  // Keep refs in sync with state
  useEffect(() => { phaseRef.current      = phase      }, [phase])
  useEffect(() => { pausedRef.current     = paused     }, [paused])
  useEffect(() => { roundRef.current      = round      }, [round])
  useEffect(() => { scoreRef.current      = score      }, [score])
  useEffect(() => { hiScoreRef.current    = hiScore    }, [hiScore])
  useEffect(() => { shotsRef.current      = shotsLeft  }, [shotsLeft])
  useEffect(() => { birdsHitRef.current   = birdsHit   }, [birdsHit])
  useEffect(() => { birdsTotalRef.current = birdsTotal }, [birdsTotal])
  useEffect(() => { ducksRef.current      = ducks      }, [ducks])
  useEffect(() => { gameModeRef.current   = gameMode   }, [gameMode])
  useEffect(() => { handModeRef.current   = handMode   }, [handMode])

  // ── Spawn a wave ────────────────────────────────────────────────────────────

  const spawnWave = useCallback((skyW: number, skyH: number, r: number, mode: GameMode) => {
    const count    = DUCKS_IN_FLIGHT[mode]
    const newDucks = Array.from({ length: count }, (_, i) =>
      mode === 'C' ? makeClay(skyW, skyH, r, i) : makeDuck(skyW, skyH, r)
    )
    setDucks(newDucks)
    ducksRef.current = newDucks
  }, [])

  const resetShotsForBird = useCallback(() => {
    setShotsLeft(SHOTS_PER_BIRD)
    shotsRef.current = SHOTS_PER_BIRD
  }, [])

  // ── Advance to next wave after birdResult ──────────────────────────────────

  const advanceToNextWave = useCallback(() => {
    const alreadyReleased = birdsTotalRef.current
    if (alreadyReleased >= BIRDS_PER_ROUND) {
      // End of round
      if (birdsHitRef.current >= MIN_DUCKS_PASS) {
        setPhase('roundOver')
        phaseRef.current = 'roundOver'
      } else {
        setPhase('roundFail')
        phaseRef.current = 'roundFail'
      }
      return
    }
    // Spawn next wave
    resetShotsForBird()
    const sky = skyRef.current
    const W   = sky ? sky.clientWidth  : 800
    const H   = sky ? sky.clientHeight : 500
    spawnWave(W, H, roundRef.current, gameModeRef.current)
    setPhase('playing')
    phaseRef.current = 'playing'
  }, [resetShotsForBird, spawnWave])

  // ── Finish a wave (either hit or missed) ───────────────────────────────────

  const handleWaveDone = useCallback((anyHit: boolean) => {
    if (phaseRef.current !== 'playing') return
    setPhase('birdResult')
    phaseRef.current = 'birdResult'
    setLastBirdHit(anyHit)
    setDogVisible(!anyHit)
  }, [])

  // ── Fire (shoot) ───────────────────────────────────────────────────────────

  const fire = useCallback((px: number, py: number) => {
    if (phaseRef.current !== 'playing') return
    if (pausedRef.current) return
    if (shotsRef.current <= 0) return

    const now = performance.now()
    if (now - lastFireRef.current < 300) return
    lastFireRef.current = now

    const newShots = shotsRef.current - 1
    setShotsLeft(newShots)
    shotsRef.current = newShots

    // Muzzle flash
    setFiring(true)
    if (firingTimerRef.current) clearTimeout(firingTimerRef.current)
    firingTimerRef.current = setTimeout(() => setFiring(false), 180)

    const hitIdx = ducksRef.current.findIndex(d => {
      if (!d.alive || d.hit) return false
      const r = DUCK_SIZE / 2 + 10
      return Math.abs(d.x - px) < r && Math.abs(d.y - py) < r
    })

    if (hitIdx >= 0) {
      // Hit!
      const updated = ducksRef.current.map((d, i) =>
        i === hitIdx ? { ...d, alive: false, hit: true, vy: -3 } : d
      )
      setDucks(updated)
      ducksRef.current = updated

      const hitEffect: ShotEffect = { id: ++shotEffectIdCounter, x: px, y: py, kind: 'hit' }
      setShotEffects(prev => [...prev, hitEffect])
      setTimeout(() => setShotEffects(prev => prev.filter(e => e.id !== hitEffect.id)), 700)

      const roundBonus = roundRef.current * 100
      const newScore   = scoreRef.current + POINTS_PER_DUCK + roundBonus
      setScore(newScore)
      scoreRef.current = newScore

      const newHit = birdsHitRef.current + 1
      setBirdsHit(newHit)
      birdsHitRef.current = newHit

      if (newScore > hiScoreRef.current) {
        setHiScore(newScore)
        hiScoreRef.current = newScore
      }

      // Check if all ducks in this wave are resolved
      const allResolved = updated.every(d => d.hit || d.escaped || !d.alive)
      if (allResolved) {
        setTimeout(() => handleWaveDone(true), 800)
      }
      return
    }

    // Miss ripple
    const missEffect: ShotEffect = { id: ++shotEffectIdCounter, x: px, y: py, kind: 'miss' }
    setShotEffects(prev => [...prev, missEffect])
    setTimeout(() => setShotEffects(prev => prev.filter(e => e.id !== missEffect.id)), 500)

    // Out of shots → mark remaining ducks as escaped and trigger birdResult
    if (newShots <= 0) {
      const anyAlive = ducksRef.current.some(d => d.alive && !d.hit)
      if (anyAlive) {
        const escaped = ducksRef.current.map(d =>
          d.alive && !d.hit ? { ...d, escaped: true } : d
        )
        setDucks(escaped)
        ducksRef.current = escaped
        setTimeout(() => handleWaveDone(false), 400)
      }
    }
  }, [handleWaveDone])

  // ── rAF animation loop ─────────────────────────────────────────────────────

  const tick = useCallback(() => {
    if (!pausedRef.current && phaseRef.current === 'playing') {
      tickCountRef.current += 1
      const sky = skyRef.current
      if (sky) {
        const W = sky.clientWidth
        const H = sky.clientHeight

        setDucks(prev => {
          const next = prev.map(d => {
            if (!d.visible) return d

            // Tumbling duck falls straight down
            if (d.hit) {
              const ny  = d.y + (d.vy + 2)
              const nvy = d.vy + 0.5   // gravity
              return { ...d, y: ny, vy: nvy, visible: ny < H + DUCK_SIZE * 2 }
            }

            // Escaped duck flies off screen quickly
            if (d.escaped) {
              const nx = d.x + d.vx * 2
              const ny = d.y - 5
              const vis = ny > -DUCK_SIZE * 4 && nx > -DUCK_SIZE * 4 && nx < W + DUCK_SIZE * 4
              return { ...d, x: nx, y: ny, visible: vis }
            }

            if (!d.alive) return d

            // 3-frame wing-flap
            const wingFrame = Math.floor(tickCountRef.current / WING_ANIM_TICKS) % 3

            // Direction change at fixed engine ticks (zigzag)
            let { vx, vy, dirTimer } = d
            dirTimer -= 1
            if (dirTimer <= 0) {
              dirTimer = DIR_CHANGE_TICKS
              vx = -vx               // horizontal flip
              if (vy > 0) vy = -Math.abs(vy) * 0.5  // keep flying up
            }

            let nx = d.x + vx
            let ny = d.y + vy

            vy += 0.05   // gentle gravity arc

            // Bounce off sky ceiling
            if (ny < DUCK_SIZE) {
              ny = DUCK_SIZE
              vy = Math.abs(vy) * 0.6
            }
            // Keep in upper 75% of sky
            if (ny > H * 0.75) {
              ny = H * 0.75
              vy = -Math.abs(vy)
            }

            const visible = nx > -DUCK_SIZE * 4 && nx < W + DUCK_SIZE * 4 && ny > -DUCK_SIZE * 4

            return { ...d, x: nx, y: ny, vx, vy, dirTimer, visible, wingFrame }
          })

          // Detect ducks that flew off screen
          const anyFlownOff = next.some(d => d.alive && !d.hit && !d.escaped && !d.visible)
          if (anyFlownOff && phaseRef.current === 'playing') {
            const withEscaped = next.map(d =>
              d.alive && !d.hit && !d.escaped && !d.visible ? { ...d, escaped: true } : d
            )
            const allResolved = withEscaped.every(d => d.hit || d.escaped || !d.alive)
            if (allResolved) {
              setTimeout(() => handleWaveDone(false), 100)
            }
            ducksRef.current = withEscaped
            return withEscaped
          }

          ducksRef.current = next
          return next
        })

        // Clay pigeon spin
        setClayAngle(a => a + 8)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [handleWaveDone])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
  }, [tick])

  // ── Game control ───────────────────────────────────────────────────────────

  const startRound = useCallback((r: number, mode: GameMode) => {
    setBirdsHit(0)
    birdsHitRef.current = 0
    const firstWave = DUCKS_IN_FLIGHT[mode]
    setBirdsTotal(firstWave)
    birdsTotalRef.current = firstWave
    resetShotsForBird()
    setDogVisible(false)
    setPhase('playing')
    phaseRef.current = 'playing'
    setPaused(false)
    pausedRef.current = false
    tickCountRef.current = 0

    const sky = skyRef.current
    const W = sky ? sky.clientWidth  : 800
    const H = sky ? sky.clientHeight : 500
    spawnWave(W, H, r, mode)
  }, [resetShotsForBird, spawnWave])

  const startGame = useCallback((mode: GameMode) => {
    setGameMode(mode)
    gameModeRef.current = mode
    setRound(1)
    roundRef.current = 1
    setScore(0)
    scoreRef.current = 0
    startRound(1, mode)
  }, [startRound])

  const goToNextRound = useCallback(() => {
    const r = roundRef.current + 1
    setRound(r)
    roundRef.current = r
    startRound(r, gameModeRef.current)
  }, [startRound])

  // Phase transition effects
  useEffect(() => {
    if (phase === 'birdResult') {
      const t = setTimeout(() => {
        setDogVisible(false)
        // Increment birds-released counter, then advance
        const count    = DUCKS_IN_FLIGHT[gameModeRef.current]
        const newTotal = birdsTotalRef.current + count
        setBirdsTotal(newTotal)
        birdsTotalRef.current = newTotal
        advanceToNextWave()
      }, BIRD_RESULT_MS)
      return () => clearTimeout(t)
    }
    if (phase === 'roundOver') {
      const t = setTimeout(goToNextRound, ROUND_OVER_MS)
      return () => clearTimeout(t)
    }
    if (phase === 'roundFail') {
      const t = setTimeout(() => {
        setPhase('gameOver')
        phaseRef.current = 'gameOver'
      }, ROUND_FAIL_MS)
      return () => clearTimeout(t)
    }
  }, [phase, advanceToNextWave, goToNextRound])

  // ── Mouse / touch aiming ───────────────────────────────────────────────────

  const getSkyPos = useCallback((clientX: number, clientY: number) => {
    const sky = skyRef.current
    if (!sky) return null
    const rect = sky.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }, [])

  const handleSkyMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (handMode) return
    setCrosshair(getSkyPos(e.clientX, e.clientY))
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
    if (!sky || !handModeRef.current) return

    if (data.hands.length === 0) {
      fireDwellRef.current = 0
      return
    }

    const hand       = data.hands[0]
    const { indexTip, gesture } = hand
    const mirroredX  = 1 - indexTip.x
    const rect       = sky.getBoundingClientRect()
    const px         = mirroredX * rect.width
    const py         = indexTip.y * rect.height

    setCrosshair({ x: px, y: py })

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fire])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && phaseRef.current === 'playing') {
        setPaused(p => { pausedRef.current = !p; return !p })
      }
      if ((e.key === ' ' || e.key === 'Enter') && phaseRef.current === 'gameOver') {
        setPhase('modeSelect')
        phaseRef.current = 'modeSelect'
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Derived display values ─────────────────────────────────────────────────

  const waveCount   = DUCKS_IN_FLIGHT[gameMode]
  const currentBird = Math.min(
    Math.ceil(birdsTotal / waveCount),
    BIRDS_PER_ROUND / waveCount,
  )

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="dh-container">

      {/* ── Mode Select ─────────────────────────────────────────── */}
      {phase === 'modeSelect' && (
        <div className="dh-mode-select-overlay">
          <ModeSelectScreen onSelect={startGame} />
        </div>
      )}

      {/* ── Control bar ──────────────────────────────────────────── */}
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
          ✋ Hand
        </button>

        {(phase === 'gameOver' || phase === 'modeSelect') && (
          <button
            className="dh-start-btn"
            onClick={() => { setPhase('modeSelect'); phaseRef.current = 'modeSelect' }}
          >
            {phase === 'gameOver' ? '🔄 Play Again' : '🎮 Start Game'}
          </button>
        )}
        {phase === 'playing' && (
          <button
            className={`dh-pause-btn-sm${paused ? ' dh-pause-btn-sm--active' : ''}`}
            onClick={() => setPaused(p => { pausedRef.current = !p; return !p })}
          >
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
        )}

        <span className="dh-control-bar__mode-label">
          GAME {gameMode}
        </span>
      </div>

      {/* ── Sky / Game Canvas ─────────────────────────────────────── */}
      <div
        ref={skyRef}
        className={`dh-sky${paused ? ' dh-sky--paused' : ''}`}
        onMouseMove={handleSkyMouseMove}
        onMouseLeave={handleSkyMouseLeave}
        onClick={handleSkyClick}
        onTouchStart={handleSkyTouchStart}
      >
        {/* ── Hand panel overlay ──────────────────────────────────── */}
        {handMode && (
          <div className="dh-hand-overlay"
            onMouseMove={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
          >
            <HandRecognitionPanel onHandData={handleHandData} autoStart defaultCollapsed={false} />
            <div className="dh-hand-hint">
              <strong>Point</strong> index finger to aim ·{' '}
              <strong>Close fist</strong> to shoot (~0.3 s dwell)
            </div>
          </div>
        )}

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
              <button
                className="dh-btn dh-btn--play-again"
                onClick={() => { setPhase('modeSelect'); phaseRef.current = 'modeSelect' }}
              >
                Play Again
              </button>
            </div>
          </div>
        )}

        {/* Round Failed */}
        {phase === 'roundFail' && (
          <div className="dh-overlay">
            <div className="dh-overlay__box dh-overlay__box--gameover">
              <div className="dh-overlay__title dh-overlay__title--gameover">ROUND FAILED</div>
              <div className="dh-gameover-dog">🐕</div>
              <div className="dh-overlay__sub">
                Hit {birdsHit}/{BIRDS_PER_ROUND} — need {MIN_DUCKS_PASS} to pass
              </div>
              <div className="dh-overlay__sub">Score: {score}</div>
            </div>
          </div>
        )}

        {/* Round clear */}
        {phase === 'roundOver' && (
          <div className="dh-round-clear">
            <div className="dh-round-clear__emoji">🎉</div>
            <div className="dh-round-clear__text">Round {round} Clear!</div>
            <div className="dh-round-clear__sub">Hit {birdsHit}/{BIRDS_PER_ROUND} ducks</div>
          </div>
        )}

        {/* Per-bird result (dog laugh or hit confirmation) */}
        {phase === 'birdResult' && (
          <div className={`dh-bird-result${!lastBirdHit ? ' dh-bird-result--miss' : ' dh-bird-result--hit'}`}>
            {!lastBirdHit ? (
              <>
                <div className="dh-missed-dog">🐕</div>
                <div className="dh-missed-text">HA HA HA!</div>
              </>
            ) : (
              <div className="dh-hit-text">🦆 HIT!</div>
            )}
          </div>
        )}

        {/* Dog rising from grass when duck escapes */}
        {dogVisible && <div className="dh-dog-rising" aria-hidden>🐕</div>}

        {/* Animated ducks / clay pigeons */}
        {ducks.map(duck => {
          if (!duck.visible) return null
          const facing: 'left' | 'right' = duck.vx >= 0 ? 'right' : 'left'
          return (
            <div
              key={duck.id}
              className={[
                'dh-duck-sprite',
                duck.hit     ? 'dh-duck-sprite--falling' : '',
                duck.escaped ? 'dh-duck-sprite--escaped'  : '',
              ].filter(Boolean).join(' ')}
              style={{ left: duck.x, top: duck.y }}
              aria-hidden
            >
              {gameMode === 'C'
                ? <ClaySvg angle={clayAngle} />
                : <DuckSvg facing={facing} wingFrame={duck.wingFrame} />
              }
            </div>
          )
        })}

        {/* Crosshair + muzzle flash */}
        {crosshair && phase === 'playing' && !paused && (
          <div
            className={`dh-crosshair${firing ? ' dh-crosshair--firing' : ''}`}
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
            {firing && <div className="dh-muzzle-flash" aria-hidden />}
          </div>
        )}

        {/* Shot effects (hit explosions + miss ripples) */}
        {shotEffects.map(effect => (
          <div
            key={effect.id}
            className={`dh-shot-effect dh-shot-effect--${effect.kind}`}
            style={{ left: effect.x, top: effect.y }}
            aria-hidden
          />
        ))}

        {/* No shots left notice */}
        {shotsLeft <= 0 && phase === 'playing' && (
          <div className="dh-shot-counter" aria-live="polite">No shots left!</div>
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
          <span className="dh-hud-cell__value">{score.toString().padStart(6, '0')}</span>
        </div>

        <div className="dh-hud-cell">
          <span className="dh-hud-cell__label">HI-SCORE</span>
          <span className="dh-hud-cell__value">{hiScore.toString().padStart(6, '0')}</span>
        </div>

        <div className="dh-hud-cell">
          <span className="dh-hud-cell__label">ROUND</span>
          <span className="dh-hud-cell__value">{round}</span>
        </div>

        {/* 3 shots per duck — resets for each new bird */}
        <div className="dh-hud-cell">
          <span className="dh-hud-cell__label">SHOTS</span>
          <span className="dh-hud-cell__ammo" aria-label={`${shotsLeft} shots left`}>
            {Array.from({ length: SHOTS_PER_BIRD }).map((_, i) => (
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
          <span className="dh-hud-cell__value">{birdsHit}/{BIRDS_PER_ROUND}</span>
        </div>

        <div className="dh-hud-cell">
          <span className="dh-hud-cell__label">BIRD</span>
          <span className="dh-hud-cell__value">
            {currentBird}/{BIRDS_PER_ROUND / waveCount}
          </span>
        </div>
      </div>
    </div>
  )
}
