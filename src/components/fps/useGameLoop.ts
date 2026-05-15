// ─── FPS Game – Game Loop Hook stub ───────────────────────────────────────────
// Exports useGameLoop() — a React hook that will drive the FPS simulation at
// ~60 fps via requestAnimationFrame.
// Downstream tasks will fill in the tick logic (movement, bullets, collision).

import { useState } from 'react'
import type { FpsExternalInput, FpsGameState } from './types'

/**
 * Runs the FPS game loop at ~60fps via requestAnimationFrame.
 *
 * @param initialState   Seed state for the simulation.
 * @param externalInputs Optional [p1Input, p2Input] that overrides keyboard.
 * @returns The current FpsGameState, updated every frame.
 *
 * @stub The RAF loop and tick logic are not yet implemented.
 */
export function useGameLoop(
  initialState: FpsGameState,
  _externalInputs?: [FpsExternalInput?, FpsExternalInput?],
): FpsGameState {
  const [gameState] = useState<FpsGameState>(initialState)

  // TODO: set up requestAnimationFrame loop
  // TODO: register keyboard listeners for P1 (WASD + Space) and P2 (IJKL + Enter)
  // TODO: implement per-frame tick: move players, advance bullets, detect hits

  return gameState
}
