// ─── FpsGame – Top-Level Component ────────────────────────────────────────────
// Composes useGameLoop, FpsRenderer (single-player), FpsSplitScreen (2-player),
// and the optional FpsHandControls hand-tracking overlay into a single, self-
// contained game component.
//
// Props
//   mode      'single' | 'splitscreen' — defaults to 'single'
//   onExit    optional callback fired when the user presses the Exit button
//
// Layout (single-player)
//   ┌─────────────────────────────────────────┐
//   │  [Single]  [Split-screen]   [Exit]      │  ← toolbar
//   ├─────────────────────────────────────────┤
//   │                                         │
//   │          FpsRenderer (full-width)       │
//   │                                         │
//   │  [FpsHandControls P1 overlay]           │
//   └─────────────────────────────────────────┘
//
// Layout (split-screen)
//   ┌─────────────────────────────────────────┐
//   │  [Single]  [Split-screen]   [Exit]      │  ← toolbar
//   ├─────────────────────────────────────────┤
//   │                                         │
//   │           FpsSplitScreen                │
//   │                                         │
//   └─────────────────────────────────────────┘

import { useCallback, useEffect, useRef, useState } from 'react'
import type { FpsExternalInput, FpsGameState } from './types'
import { FpsRenderer } from './FpsRenderer'
import FpsSplitScreen from './FpsSplitScreen'
import FpsHandControls from './FpsHandControls'
import { useGameLoop } from './useGameLoop'
import { MAP_01, MAP_01_SPAWN_P1, MAP_01_SPAWN_P2 } from './maps'
import './FpsGame.css'

// ── Constants ──────────────────────────────────────────────────────────────────

const KILLS_TO_WIN = 5

// ── Initial state factory ──────────────────────────────────────────────────────

function makeInitialState(mode: 'single' | 'splitscreen'): FpsGameState {
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
    mode,
    tick: 0,
  }
}

// ── Props ──────────────────────────────────────────────────────────────────────

export interface FpsGameProps {
  mode?: 'single' | 'splitscreen'
  onExit?: () => void
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function HealthBar({ health }: { health: number }) {
  const pct = Math.max(0, Math.min(100, health))
  const color =
    pct > 60 ? '#22c55e' :
    pct > 30 ? '#f59e0b' :
               '#ef4444'

  return (
    <div className="fps-hud-bar" aria-label={`Health: ${pct}`}>
      <div
        className="fps-hud-bar__fill"
        style={{ width: `${pct}%`, background: color }}
      />
      <span className="fps-hud-bar__text">{pct} HP</span>
    </div>
  )
}

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
        <p className="fps-win-overlay__subtitle">First to {KILLS_TO_WIN} kills</p>
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

// ── Single-player inner component ──────────────────────────────────────────────

interface SinglePlayerViewProps {
  containerW: number
  containerH: number
  showHandControls: boolean
}

function SinglePlayerView({ containerW, containerH, showHandControls }: SinglePlayerViewProps) {
  const [p1HandInput, setP1HandInput] = useState<FpsExternalInput | undefined>(undefined)
  const [restartKey, setRestartKey] = useState(0)
  const [initialState] = useState<FpsGameState>(() => makeInitialState('single'))

  const externalInputsTuple: [FpsExternalInput?, FpsExternalInput?] = [p1HandInput, undefined]

  const gameState = useGameLoop(initialState, externalInputsTuple)

  const winner: 1 | 2 | null =
    gameState.players[0].kills >= KILLS_TO_WIN ? 1 :
    gameState.players[1].kills >= KILLS_TO_WIN ? 2 :
    null

  const handleRestart = useCallback(() => {
    setRestartKey((k) => k + 1)
  }, [])

  const handleP1Input = useCallback((input: FpsExternalInput) => {
    setP1HandInput(input)
  }, [])

  return (
    <div key={restartKey} className="fps-single-view" style={{ width: containerW, height: containerH }}>
      <FpsRenderer
        state={gameState}
        width={containerW}
        height={containerH}
        playerIndex={0}
      />

      <div className="fps-hud fps-hud--single" aria-label="Player 1 HUD">
        <div className="fps-hud__label">P1</div>
        <HealthBar health={gameState.players[0].health} />
        <div className="fps-hud__kills">
          {'💀'} {gameState.players[0].kills} / {KILLS_TO_WIN}
        </div>
        <div className="fps-hud__controls">WASD + Space</div>
      </div>

      {showHandControls && (
        <FpsHandControls playerId={0} onInput={handleP1Input} />
      )}

      {winner !== null && (
        <WinOverlay winner={winner} onRestart={handleRestart} />
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function FpsGame({ mode: modeProp = 'single', onExit }: FpsGameProps) {
  const [mode, setMode] = useState<'single' | 'splitscreen'>(modeProp)
  const [showHandControls, setShowHandControls] = useState(false)

  const viewportRef = useRef<HTMLDivElement>(null)
  const [viewportSize, setViewportSize] = useState({ w: 800, h: 480 })

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const obs = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      setViewportSize({
        w: Math.max(200, Math.floor(width)),
        h: Math.max(120, Math.floor(height)),
      })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div className="fps-game">
      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="fps-game__toolbar" role="toolbar" aria-label="FPS game controls">
        <div className="fps-game__toolbar-group">
          <span className="fps-game__toolbar-label">Mode:</span>
          <button
            className={`fps-game__toolbar-btn${mode === 'single' ? ' fps-game__toolbar-btn--active' : ''}`}
            onClick={() => setMode('single')}
            aria-pressed={mode === 'single'}
          >
            Single
          </button>
          <button
            className={`fps-game__toolbar-btn${mode === 'splitscreen' ? ' fps-game__toolbar-btn--active' : ''}`}
            onClick={() => setMode('splitscreen')}
            aria-pressed={mode === 'splitscreen'}
          >
            Split-screen
          </button>
        </div>

        {mode === 'single' && (
          <div className="fps-game__toolbar-group">
            <button
              className={`fps-game__toolbar-btn${showHandControls ? ' fps-game__toolbar-btn--active' : ''}`}
              onClick={() => setShowHandControls((v) => !v)}
              aria-pressed={showHandControls}
              title="Toggle hand-tracking controls for P1"
            >
              ✋ Hand Controls
            </button>
          </div>
        )}

        <div className="fps-game__toolbar-spacer" />

        <button
          className="fps-game__toolbar-btn fps-game__toolbar-btn--exit"
          onClick={onExit}
          aria-label="Exit game"
        >
          ✕ Exit
        </button>
      </div>

      {/* ── Game viewport ──────────────────────────────────────────────────── */}
      <div ref={viewportRef} className="fps-game__viewport">
        {mode === 'splitscreen' ? (
          <FpsSplitScreen />
        ) : (
          <SinglePlayerView
            containerW={viewportSize.w}
            containerH={viewportSize.h}
            showHandControls={showHandControls}
          />
        )}
      </div>
    </div>
  )
}
