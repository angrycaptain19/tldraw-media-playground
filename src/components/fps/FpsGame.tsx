// ─── FpsGame – Top-Level Component stub ───────────────────────────────────────
// Returns a <canvas> placeholder with a "FPS coming soon" overlay.
// Downstream tasks will wire up useGameLoop, the renderer, and multiplayer.

import { useRef } from 'react'
import './FpsGame.css'

export interface FpsGameProps {
  /** 'single' = one player; 'splitscreen' = two players side-by-side */
  mode?: 'single' | 'splitscreen'
  /** Optional callback fired when the user exits the game */
  onExit?: () => void
}

/**
 * Top-level FPS game component.
 *
 * Currently renders a full-size canvas placeholder with an overlay that
 * reads "FPS coming soon". Downstream tasks will replace this stub with a
 * working game loop and raycasted renderer.
 */
export default function FpsGame({ mode: _mode = 'single', onExit: _onExit }: FpsGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // TODO: build FpsGameState from props / server
  // TODO: call useGameLoop(initialState, [p1Input, p2Input])
  // TODO: on each frame call renderFrame({ ctx, width, height, state, playerIndex })

  return (
    <div className="fps-container">
      <canvas
        ref={canvasRef}
        className="fps-canvas"
        aria-label="FPS game canvas"
      />

      {/* Placeholder overlay — remove once the game loop is wired up */}
      <div className="fps-coming-soon">
        <span className="fps-coming-soon__icon">🎮</span>
        <span className="fps-coming-soon__text">FPS coming soon</span>
      </div>
    </div>
  )
}
