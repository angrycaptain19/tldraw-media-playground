// ─── FPS Game – Split-Screen 2-Player Component ───────────────────────────────
// Renders two independent raycaster views side-by-side (P1 left, P2 right),
// each occupying 50% of the container width. Each half has its own HUD showing
// player label, kill count, and health bar. First player to 5 kills wins.
//
// Controls:
//   Player 1: W/S to move, A/D to strafe, Arrow keys to turn, Space to fire
//   Player 2: I/K to move, J/L to strafe, Enter to fire
//
// The game loop is driven by useGameLoop which handles both players keyboard
// input natively. This component only handles layout, HUD, and win detection.

import { useRef, useEffect, useState } from 'react'
import type { FpsGameState } from './types'
import { FpsRenderer } from './FpsRenderer'
import { useGameLoop } from './useGameLoop'
import { MAP_01, MAP_01_SPAWN_P1, MAP_01_SPAWN_P2 } from './maps'
import './FpsSplitScreen.css'

// ── Constants ──────────────────────────────────────────────────────────────────

const KILLS_TO_WIN = 5

// ── Initial state factory ──────────────────────────────────────────────────────

function makeInitialState(): FpsGameState {
  return {
    players: [
      {
        x: MAP_01_SPAWN_P1.col + 0.5,
        y: MAP_01_SPAWN_P1.row + 0.5,
        angle: 0,
        health: 100,
        kills: 0,
      },
      {
        x: MAP_01_SPAWN_P2.col + 0.5,
        y: MAP_01_SPAWN_P2.row + 0.5,
        angle: Math.PI,
        health: 100,
        kills: 0,
      },
    ],
    bullets: [],
    map: MAP_01,
    mode: 'splitscreen',
    tick: 0,
  }
}

// ── Props ──────────────────────────────────────────────────────────────────────

export interface FpsSplitScreenProps {
  /** Optional pre-built initial state; defaults to MAP_01 with standard spawns. */
  state?: FpsGameState
}

// ── Sub-components ─────────────────────────────────────────────────────────────

/** Visual health bar for the HUD */
function HealthBar({ health }: { health: number }) {
  const pct = Math.max(0, Math.min(100, health))
  const color =
    pct > 60 ? '#22c55e' :
    pct > 30 ? '#f59e0b' :
               '#ef4444'

  return (
    <div className="fps-health-bar" aria-label={`Health: ${pct}`}>
      <div
        className="fps-health-bar__fill"
        style={{ width: `${pct}%`, background: color }}
      />
      <span className="fps-health-bar__text">{pct} HP</span>
    </div>
  )
}

/** Full-screen overlay shown when a player wins */
function WinOverlay({
  winner,
  onRestart,
}: {
  winner: 1 | 2
  onRestart: () => void
}) {
  return (
    <div className="fps-win-overlay" role="dialog" aria-modal="true" aria-label={`Player ${winner} wins`}>
      <div className="fps-win-overlay__box">
        <div className="fps-win-overlay__trophy">{'🏆'}</div>
        <h2 className="fps-win-overlay__title">Player {winner} Wins!</h2>
        <p className="fps-win-overlay__subtitle">
          First to {KILLS_TO_WIN} kills
        </p>
        <button
          className="fps-win-overlay__restart"
          onClick={onRestart}
          autoFocus
        >
          Play Again &#9654;
        </button>
      </div>
    </div>
  )
}

// ── Component ──────────────────────────────────────────────────────────────────

export function FpsSplitScreen({ state: initialStateProp }: FpsSplitScreenProps) {
  // ── Container size measurement ─────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ w: 800, h: 480 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const obs = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      setContainerSize({
        w: Math.max(200, Math.floor(width)),
        h: Math.max(120, Math.floor(height)),
      })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // ── Game state ─────────────────────────────────────────────────────────────
  const [initialState] = useState<FpsGameState>(
    () => initialStateProp ?? makeInitialState(),
  )

  const gameState = useGameLoop(initialState)

  // ── Win detection ──────────────────────────────────────────────────────────
  const winner: 1 | 2 | null =
    gameState.players[0].kills >= KILLS_TO_WIN
      ? 1
      : gameState.players[1].kills >= KILLS_TO_WIN
      ? 2
      : null

  // ── Derived layout sizes ───────────────────────────────────────────────────
  const halfW = Math.floor(containerSize.w / 2)
  const viewH = containerSize.h

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="fps-split-screen">
      {/* ── Left half – Player 1 ──────────────────────────────────────────── */}
      <div className="fps-split-screen__half fps-split-screen__half--left">
        <FpsRenderer
          state={gameState}
          width={halfW}
          height={viewH}
          playerIndex={0}
        />

        {/* P1 HUD */}
        <div className="fps-hud fps-hud--left" aria-label="Player 1 HUD">
          <div className="fps-hud__label">P1</div>
          <HealthBar health={gameState.players[0].health} />
          <div className="fps-hud__kills">
            {'\uD83D\uDC80'} {gameState.players[0].kills} / {KILLS_TO_WIN}
          </div>
          <div className="fps-hud__controls">WASD + Space</div>
        </div>
      </div>

      {/* Vertical divider */}
      <div className="fps-split-screen__divider" aria-hidden="true" />

      {/* ── Right half – Player 2 ─────────────────────────────────────────── */}
      <div className="fps-split-screen__half fps-split-screen__half--right">
        <FpsRenderer
          state={gameState}
          width={halfW}
          height={viewH}
          playerIndex={1}
        />

        {/* P2 HUD */}
        <div className="fps-hud fps-hud--right" aria-label="Player 2 HUD">
          <div className="fps-hud__label">P2</div>
          <HealthBar health={gameState.players[1].health} />
          <div className="fps-hud__kills">
            {'\uD83D\uDC80'} {gameState.players[1].kills} / {KILLS_TO_WIN}
          </div>
          <div className="fps-hud__controls">IJKL + Enter</div>
        </div>
      </div>

      {/* ── Win overlay ───────────────────────────────────────────────────── */}
      {winner !== null && (
        <WinOverlay winner={winner} onRestart={() => { window.location.reload() }} />
      )}
    </div>
  )
}

export default FpsSplitScreen
