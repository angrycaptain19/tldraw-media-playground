// ─── HandRecognitionPanel ─────────────────────────────────────────────────────
// A self-contained panel that:
//   * shows the live camera feed with landmark overlays
//   * surfaces detected-hand data (handedness, gesture name, index-tip pos)
//   * exposes an `onHandData` prop so the chess game can respond to gestures
//
// This is intentionally a *display + hook-wiring* layer only — no chess logic
// lives here.

import { useState } from 'react'
import {
  useHandRecognition,
  type HandData,
  GESTURE_FIST,
  GESTURE_OPEN_PALM,
  GESTURE_POINTING_UP,
} from '../hooks/useHandRecognition'
import './HandRecognitionPanel.css'

interface HandRecognitionPanelProps {
  /** Optional callback forwarded from the parent (e.g. ChessGame) */
  onHandData?: (data: HandData) => void
}

export default function HandRecognitionPanel({ onHandData }: HandRecognitionPanelProps) {
  const [expanded, setExpanded] = useState(false)

  const {
    videoRef,
    canvasRef,
    handData,
    isRunning,
    isLoading,
    error,
    start,
    stop,
  } = useHandRecognition({ onHandData })

  const toggleCamera = () => {
    if (isRunning) {
      stop()
    } else {
      void start()
    }
  }

  return (
    <div className={`hrp ${expanded ? 'hrp--expanded' : 'hrp--collapsed'}`}>
      {/* Header bar */}
      <div className="hrp__header">
        <span className="hrp__title">Hand Control</span>

        <div className="hrp__header-actions">
          {/* Camera toggle */}
          <button
            className={`hrp__btn ${isRunning ? 'hrp__btn--stop' : 'hrp__btn--start'}`}
            onClick={toggleCamera}
            disabled={isLoading}
            title={isRunning ? 'Stop camera' : 'Start camera'}
          >
            {isLoading ? 'Loading...' : isRunning ? 'Stop' : 'Start'}
          </button>

          {/* Expand / collapse */}
          <button
            className="hrp__btn hrp__btn--toggle"
            onClick={() => setExpanded(e => !e)}
            title={expanded ? 'Collapse panel' : 'Expand panel'}
          >
            {expanded ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {/* Body (only visible when expanded) */}
      {expanded && (
        <div className="hrp__body">
          {error && (
            <div className="hrp__error">
              {error}
            </div>
          )}

          {/* Camera + overlay stack */}
          <div className="hrp__video-wrapper">
            <video
              ref={videoRef}
              className="hrp__video"
              playsInline
              muted
            />
            <canvas ref={canvasRef} className="hrp__canvas" />

            {!isRunning && !isLoading && (
              <div className="hrp__placeholder">
                <span>Camera off</span>
                <small>Press Start to enable hand detection</small>
              </div>
            )}
            {isLoading && (
              <div className="hrp__placeholder hrp__placeholder--loading">
                <span>Loading GestureRecognizer model...</span>
                <small>Downloading WASM runtime (~10 MB, first time only)</small>
              </div>
            )}
          </div>

          {/* Live stats */}
          {handData && handData.hands.length > 0 ? (
            <div className="hrp__stats">
              {handData.hands.map((hand, i) => (
                <div key={i} className="hrp__hand-card">
                  <div className="hrp__hand-title">
                    {hand.handedness} hand
                    {hand.gesture === GESTURE_POINTING_UP && (
                      <span className="hrp__badge hrp__badge--pointing">cursor</span>
                    )}
                    {hand.gesture === GESTURE_FIST && (
                      <span className="hrp__badge hrp__badge--fist">grab</span>
                    )}
                    {hand.gesture === GESTURE_OPEN_PALM && (
                      <span className="hrp__badge hrp__badge--palm">release</span>
                    )}
                  </div>

                  <div className="hrp__hand-row">
                    <span className="hrp__label">Index tip</span>
                    <span className="hrp__value">
                      ({(hand.indexTip.x * 100).toFixed(1)}%, {(hand.indexTip.y * 100).toFixed(1)}%)
                    </span>
                  </div>

                  <div className="hrp__hand-row">
                    <span className="hrp__label">Gesture</span>
                    <span className="hrp__value">
                      <span className={`hrp__gesture-badge hrp__gesture-badge--${hand.gesture.toLowerCase().replace(/_/g, '-')}`}>
                        {hand.gesture}
                      </span>
                      <span className="hrp__gesture-score">
                        {' '}{Math.round(hand.gestureScore * 100)}%
                      </span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : isRunning ? (
            <div className="hrp__no-hands">No hands detected — show your hand to the camera</div>
          ) : null}

          {/* Usage hint */}
          <div className="hrp__hint">
            <strong>Point</strong> your index finger at a square to hover it.
            <br />
            <strong>Close your fist</strong> over a piece to pick it up (hold ~0.2 s).
            <br />
            <strong>Move</strong> your hand to drag the piece across the board.
            <br />
            <strong>Open your palm</strong> to drop it on a valid square (hold ~0.2 s).
            <br />
            <em>Pink = grab &nbsp;·&nbsp; Green = release &nbsp;·&nbsp; Cyan = cursor</em>
          </div>
        </div>
      )}
    </div>
  )
}
