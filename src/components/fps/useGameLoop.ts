// ─── FPS Game – Game Loop Hook ────────────────────────────────────────────────
// Stub React hook that will drive the FPS simulation.
// Downstream tasks will fill in the tick logic.

import { useEffect, useRef } from 'react'
import type { FpsGameState, FpsExternalInput } from './types'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface UseGameLoopOptions {
  /** Whether the game loop should be running */
  running: boolean
  /** A getter for the current external input snapshot */
  getInput: () => FpsExternalInput
  /** Called every animation frame with the updated game state */
  onTick: (state: FpsGameState) => void
  /** Initial game state */
  initialState: FpsGameState
}

// ── Exported stub ──────────────────────────────────────────────────────────────

/**
 * Drives the FPS game simulation via `requestAnimationFrame`.
 *
 * - Calls `getInput()` each tick to collect the latest player input.
 * - Advances the game state (physics, bullets, enemies, etc.).
 * - Invokes `onTick` with the new state so the React component can re-render.
 *
 * @stub The hook schedules and cancels the RAF loop but does not yet advance
 *       the simulation. Downstream tasks should mutate `stateRef.current` and
 *       call `onTick` inside the `tick` function.
 */
export function useGameLoop(options: UseGameLoopOptions): void {
  const { running, getInput, onTick, initialState } = options

  const stateRef = useRef<FpsGameState>(initialState)
  const rafRef   = useRef<number | null>(null)

  useEffect(() => {
    stateRef.current = initialState
  }, [initialState])

  useEffect(() => {
    function tick(): void {
      if (!running) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      // TODO: read input
      void getInput()

      // TODO: advance simulation (movement, collision, bullets, enemies)

      // TODO: call onTick with the mutated state
      onTick({ ...stateRef.current })

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
    // Intentionally omitting getInput and onTick from deps - callers
    // should memoize those callbacks with useCallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])
}
