// ─── FpsGame Component ────────────────────────────────────────────────────────
// Top-level React component for the multiplayer FPS game.
// Currently renders a <canvas> placeholder with an "FPS coming soon" overlay.
// Downstream tasks will wire up the game loop, renderer, and multiplayer layer.

import { useRef } from 'react'
import './FpsGame.css'

// ── Component ──────────────────────────────────────────────────────────────────

export default function FpsGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // TODO: initialise FpsGameState
  // TODO: set up input handlers (keyboard, mouse pointer-lock)
  // TODO: call useGameLoop({ running, getInput, onTick, initialState })
  // TODO: on each onTick, call renderFrame({ ctx, width, height, state, localPlayerId })

  return (
    <div className="fps-container">
      <canvas
        ref={canvasRef}
        className="fps-canvas"
        aria-label="FPS game canvas"
      />

      {/* Placeholder overlay - remove once the game loop is wired up */}
      <div className="fps-coming-soon">
        <span className="fps-coming-soon__icon">🎮</span>
        <span className="fps-coming-soon__text">FPS coming soon</span>
      </div>
    </div>
  )
}
