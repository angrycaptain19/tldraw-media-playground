// ─── DuckHuntGame Component ──────────────────────────────────────────────────
// Basic static screen for the Duck Hunt game.
// Gameplay comes later – this implements the layout described in the wireframe:
//   • Sky / game canvas (no tldraw UI)
//   • Ducks (SVG circles) at random-ish positions in the sky
//   • A crosshair at the cursor position
//   • Ground / grass strip with bushes
//   • HUD bar: Score, Hi-Score, Round, Shots Left (ammo icons), Ducks Hit, Pause

import { useCallback, useEffect, useRef, useState } from 'react'
import './DuckHuntGame.css'

// ── Types ────────────────────────────────────────────────────────────────────

interface Duck {
  id: number
  x: number   // percentage of sky width
  y: number   // percentage of sky height
  hit: boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_SHOTS = 3
const INITIAL_ROUND = 1

const INITIAL_DUCKS: Duck[] = [
  { id: 1, x: 28, y: 30, hit: false },
  { id: 2, x: 52, y: 18, hit: false },
  { id: 3, x: 68, y: 28, hit: false },
]

const BUSHES = [
  { left: '1%'  },
  { left: '12%' },
  { left: '74%' },
  { left: '87%' },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function DuckHuntGame() {
  const [ducks, setDucks]         = useState<Duck[]>(INITIAL_DUCKS)
  const [shotsLeft, setShotsLeft] = useState(MAX_SHOTS)
  const [score, setScore]         = useState(0)
  const [hiScore, setHiScore]     = useState(9900)
  const [round, setRound]         = useState(INITIAL_ROUND)
  const [ducksHit, setDucksHit]   = useState(0)
  const [paused, setPaused]       = useState(false)
  const [crosshair, setCrosshair] = useState<{ x: number; y: number } | null>(null)
  const skyRef = useRef<HTMLDivElement>(null)

  const handleSkyMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!skyRef.current) return
    const rect = skyRef.current.getBoundingClientRect()
    setCrosshair({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }, [])

  const handleSkyMouseLeave = useCallback(() => setCrosshair(null), [])

  const handleDuckClick = useCallback(
    (e: React.MouseEvent, duck: Duck) => {
      e.stopPropagation()
      if (paused || shotsLeft <= 0 || duck.hit) return
      setDucks((prev) => prev.map((d) => (d.id === duck.id ? { ...d, hit: true } : d)))
      setScore((s) => {
        const next = s + 100
        setHiScore((h) => Math.max(h, next))
        return next
      })
      setDucksHit((h) => h + 1)
      setShotsLeft((s) => Math.max(0, s - 1))
    },
    [paused, shotsLeft],
  )

  const handleSkyClick = useCallback(() => {
    if (paused || shotsLeft <= 0) return
    setShotsLeft((s) => Math.max(0, s - 1))
  }, [paused, shotsLeft])

  const handleNewRound = useCallback(() => {
    setRound((r) => r + 1)
    setDucks(
      INITIAL_DUCKS.map((d) => ({
        ...d,
        hit: false,
        x: Math.random() * 80 + 5,
        y: Math.random() * 50 + 10,
      })),
    )
    setShotsLeft(MAX_SHOTS)
  }, [])

  const allDucksHit = ducks.every((d) => d.hit)

  // suppress unused warning
  useEffect(() => { /* future: duck animation */ }, [ducks])

  return (
    <div className="dh-container">
      {/* ── Sky / Game Canvas ──────────────────────────────────────────── */}
      <div
        ref={skyRef}
        className={`dh-sky${paused ? ' dh-sky--paused' : ''}`}
        onMouseMove={handleSkyMouseMove}
        onMouseLeave={handleSkyMouseLeave}
        onClick={handleSkyClick}
      >
        {paused && (
          <div className="dh-pause-overlay">
            <span>PAUSED</span>
          </div>
        )}

        {ducks.map((duck) => (
          <button
            key={duck.id}
            className={`dh-duck${duck.hit ? ' dh-duck--hit' : ''}`}
            style={{ left: `${duck.x}%`, top: `${duck.y}%` }}
            onClick={(e) => handleDuckClick(e, duck)}
            aria-label={duck.hit ? `Duck ${duck.id} (hit)` : `Duck ${duck.id}`}
            disabled={duck.hit || paused}
          >
            <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden={true}>
              <circle
                cx="20" cy="20" r="16"
                fill="transparent"
                stroke={duck.hit ? '#ef4444' : '#22c55e'}
                strokeWidth="3"
              />
              {duck.hit && (
                <>
                  <line x1="10" y1="10" x2="30" y2="30" stroke="#ef4444" strokeWidth="2.5" />
                  <line x1="30" y1="10" x2="10" y2="30" stroke="#ef4444" strokeWidth="2.5" />
                </>
              )}
            </svg>
            <span className="dh-duck-label">Duck {duck.id}</span>
          </button>
        ))}

        {crosshair && !paused && (
          <div
            className="dh-crosshair"
            style={{ left: crosshair.x, top: crosshair.y }}
            aria-hidden={true}
          >
            <svg viewBox="0 0 28 28" width="28" height="28">
              <circle cx="14" cy="14" r="10" fill="none" stroke="#ef4444" strokeWidth="2" />
              <line x1="14" y1="0"  x2="14" y2="8"  stroke="#ef4444" strokeWidth="2" />
              <line x1="14" y1="20" x2="14" y2="28" stroke="#ef4444" strokeWidth="2" />
              <line x1="0"  y1="14" x2="8"  y2="14" stroke="#ef4444" strokeWidth="2" />
              <line x1="20" y1="14" x2="28" y2="14" stroke="#ef4444" strokeWidth="2" />
            </svg>
          </div>
        )}

        <span className="dh-sky-label">Sky / Game Canvas (no tldraw UI)</span>

        {allDucksHit && !paused && (
          <div className="dh-round-clear">
            <p>🎉 Round clear!</p>
            <button className="dh-btn dh-btn--next-round" onClick={handleNewRound}>
              Next Round ▶
            </button>
          </div>
        )}
      </div>

      {/* ── Ground / Grass strip with Bushes ──────────────────────────── */}
      <div className="dh-ground">
        {BUSHES.map((bush, idx) => (
          <div key={idx} className="dh-bush" style={{ left: bush.left }}>
            Bush
          </div>
        ))}
        <span className="dh-ground-label">Ground / Grass Strip</span>
      </div>

      {/* ── HUD bar ──────────────────────────────────────────────────── */}
      <div className="dh-hud">
        <div className="dh-hud-cell">
          <span className="dh-hud-cell__label">SCORE:</span>
          <span className="dh-hud-cell__value">{score}</span>
        </div>

        <div className="dh-hud-cell">
          <span className="dh-hud-cell__label">HI-SCORE:</span>
          <span className="dh-hud-cell__value">{hiScore}</span>
        </div>

        <div className="dh-hud-cell">
          <span className="dh-hud-cell__label">ROUND:</span>
          <span className="dh-hud-cell__value">{round}</span>
        </div>

        <div className="dh-hud-cell">
          <span className="dh-hud-cell__label">SHOTS LEFT:</span>
          <span className="dh-hud-cell__ammo" aria-label={`${shotsLeft} shots left`}>
            {Array.from({ length: MAX_SHOTS }).map((_, i) => (
              <span
                key={i}
                className={`dh-ammo-bullet${i < shotsLeft ? ' dh-ammo-bullet--live' : ' dh-ammo-bullet--spent'}`}
                aria-hidden={true}
              />
            ))}
          </span>
        </div>

        <div className="dh-hud-cell">
          <span className="dh-hud-cell__label">DUCKS HIT:</span>
          <span className="dh-hud-cell__value">{ducksHit}</span>
        </div>

        <button
          className={`dh-pause-btn${paused ? ' dh-pause-btn--active' : ''}`}
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
        >
          {paused ? '▶ RESUME' : '[ PAUSE ]'}
        </button>
      </div>
    </div>
  )
}
