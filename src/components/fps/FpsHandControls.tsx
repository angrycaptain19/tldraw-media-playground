// ─── FPS Hand Controls ────────────────────────────────────────────────────────
// Wires HandRecognitionPanel + useHandRecognition into the FPS game as an
// optional, per-player hand-tracking control source.
//
// Gesture → FpsExternalInput mapping
//   Open_Palm   → forward: true   (open hand = charge / move forward)
//   Closed_Fist → fire: true      (punch / squeeze the trigger)
//   Lean left   → left: true      (hand index tip X < 0.4, normalised)
//   Lean right  → right: true     (hand index tip X > 0.6, normalised)
//
// If no hand is detected the callback fires with an all-false input snapshot
// so the keyboard handler in useGameLoop remains in full control.
//
// Usage:
//   <FpsHandControls
//     playerId={0}
//     onInput={(input: FpsExternalInput) => { … }}
//   />

import { useCallback, useRef } from 'react'
import HandRecognitionPanel from '../HandRecognitionPanel'
import type { HandData } from '../../hooks/useHandRecognition'
import {
  GESTURE_FIST,
  GESTURE_OPEN_PALM,
} from '../../hooks/useHandRecognition'
import type { FpsExternalInput } from './types'
import './FpsHandControls.css'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Minimum gesture confidence required before we act on the classification. */
const MIN_GESTURE_CONF = 0.65

/** Normalised X threshold below which the hand is considered "leaning left". */
const LEAN_LEFT_THRESHOLD = 0.40

/** Normalised X threshold above which the hand is considered "leaning right". */
const LEAN_RIGHT_THRESHOLD = 0.60

// ── Helpers ───────────────────────────────────────────────────────────────────

function blankInput(): FpsExternalInput {
  return { forward: false, back: false, left: false, right: false, fire: false }
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface FpsHandControlsProps {
  /**
   * Which player slot this hand controller feeds.
   * 0 = Player 1 (also used in single-player mode), 1 = Player 2.
   */
  playerId: 0 | 1

  /**
   * Called every frame with the current hand-derived input snapshot.
   * When no hand is detected this fires with an all-false snapshot so
   * the keyboard handler in useGameLoop retains control seamlessly.
   */
  onInput: (input: FpsExternalInput) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FpsHandControls({ playerId, onInput }: FpsHandControlsProps) {
  // Keep a stable ref to onInput so our handleHandData callback never
  // goes stale and can be created with an empty dependency array.
  const onInputRef = useRef(onInput)
  onInputRef.current = onInput

  // ── Gesture → input translation ────────────────────────────────────────────
  const handleHandData = useCallback((data: HandData) => {
    if (data.hands.length === 0) {
      onInputRef.current(blankInput())
      return
    }

    // Use the first detected hand (or, for P2, the second if available).
    // Index 0 is always present; index 1 may not be – fall back to index 0.
    const handIndex = playerId === 1 && data.hands.length > 1 ? 1 : 0
    const hand = data.hands[handIndex]

    // Only trust gestures above our confidence threshold.
    const gesture =
      hand.gestureScore >= MIN_GESTURE_CONF ? hand.gesture : 'None'

    // Lean direction is derived from the horizontal position of the index-tip.
    // MediaPipe reports x=0 on the left edge and x=1 on the right edge of the
    // mirrored camera frame, so we invert it (1 - x) to get screen-space left/right.
    const tipX = 1 - hand.indexTip.x

    const input: FpsExternalInput = {
      forward: gesture === GESTURE_OPEN_PALM,
      back:    false,
      left:    tipX < LEAN_LEFT_THRESHOLD,
      right:   tipX > LEAN_RIGHT_THRESHOLD,
      fire:    gesture === GESTURE_FIST,
    }

    onInputRef.current(input)
  }, [playerId])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={`fps-hand-controls fps-hand-controls--p${playerId + 1}`}>
      <div className="fps-hand-controls__label">
        P{playerId + 1} Hand Controls
      </div>

      <div className="fps-hand-controls__panel">
        <HandRecognitionPanel
          onHandData={handleHandData}
          autoStart
          defaultCollapsed={false}
        />
      </div>

      <div className="fps-hand-controls__legend">
        <div className="fps-hand-controls__legend-row">
          <span className="fps-hand-controls__legend-icon">🖐️</span>
          <span className="fps-hand-controls__legend-text">Open palm → move forward</span>
        </div>
        <div className="fps-hand-controls__legend-row">
          <span className="fps-hand-controls__legend-icon">✊</span>
          <span className="fps-hand-controls__legend-text">Fist → fire</span>
        </div>
        <div className="fps-hand-controls__legend-row">
          <span className="fps-hand-controls__legend-icon">👈</span>
          <span className="fps-hand-controls__legend-text">Lean left → rotate left</span>
        </div>
        <div className="fps-hand-controls__legend-row">
          <span className="fps-hand-controls__legend-icon">👉</span>
          <span className="fps-hand-controls__legend-text">Lean right → rotate right</span>
        </div>
      </div>
    </div>
  )
}
