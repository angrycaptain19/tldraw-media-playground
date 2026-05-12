// ─── AudioControlPanel ────────────────────────────────────────────────────────
// A self-contained panel that:
//   * uses the Web Speech API via useVoiceRecognition
//   * shows live transcript + last parsed command
//   * exposes an `onCommand` prop so ChessGame can act on voice commands
//   * mirrors the HandRecognitionPanel structure (collapsed / expanded)

import { useState } from 'react'
import { useVoiceRecognition, type VoiceCommand } from '../hooks/useVoiceRecognition'
import './AudioControlPanel.css'

interface AudioControlPanelProps {
  onCommand?: (cmd: VoiceCommand) => void
}

const COMMAND_LABELS: Record<string, string> = {
  move: '♟ Move',
  'new-game': '🔄 New Game',
  undo: '↩ Undo',
  unknown: '❓ Unknown',
}

export default function AudioControlPanel({ onCommand }: AudioControlPanelProps) {
  const [expanded, setExpanded] = useState(false)

  const {
    isListening,
    isSupported,
    error,
    lastTranscript,
    lastCommand,
    start,
    stop,
  } = useVoiceRecognition({ onCommand })

  const toggleMic = () => {
    if (isListening) stop()
    else start()
  }

  return (
    <div className={`acp ${expanded ? 'acp--expanded' : 'acp--collapsed'}`}>
      {/* Header bar */}
      <div className="acp__header">
        <span className="acp__title">
          <span className="acp__mic-icon" aria-hidden="true">🎙</span>
          Voice Control
        </span>

        <div className="acp__header-actions">
          {isSupported ? (
            <button
              className={`acp__btn ${isListening ? 'acp__btn--stop' : 'acp__btn--start'}`}
              onClick={toggleMic}
              title={isListening ? 'Stop listening' : 'Start listening'}
            >
              {isListening ? 'Stop' : 'Start'}
            </button>
          ) : (
            <span className="acp__unsupported">Not supported</span>
          )}

          <button
            className="acp__btn acp__btn--toggle"
            onClick={() => setExpanded((e) => !e)}
            title={expanded ? 'Collapse panel' : 'Expand panel'}
          >
            {expanded ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {/* Body (only visible when expanded) */}
      {expanded && (
        <div className="acp__body">
          {!isSupported && (
            <div className="acp__error">
              Your browser does not support the Web Speech API. Try Chrome or Edge for voice
              control.
            </div>
          )}

          {error && <div className="acp__error">{error}</div>}

          {/* Listening status indicator */}
          <div className={`acp__status ${isListening ? 'acp__status--active' : ''}`}>
            <span className="acp__status-dot" aria-hidden="true" />
            <span>{isListening ? 'Listening…' : 'Microphone off'}</span>
          </div>

          {/* Live transcript */}
          <div className="acp__section-label">Live transcript</div>
          <div className="acp__transcript">
            {lastTranscript || <span className="acp__muted">—</span>}
          </div>

          {/* Last parsed command */}
          {lastCommand && (
            <div className="acp__command-card">
              <div className="acp__command-type">
                {COMMAND_LABELS[lastCommand.type] ?? lastCommand.type}
              </div>
              {lastCommand.type === 'move' && (
                <div className="acp__command-detail">
                  <span className="acp__sq">{lastCommand.from}</span>
                  <span className="acp__arrow">→</span>
                  <span className="acp__sq">{lastCommand.to}</span>
                </div>
              )}
              <div className="acp__command-raw">"{lastCommand.transcript}"</div>
            </div>
          )}

          {/* Usage hint */}
          <div className="acp__hint">
            <strong>Move:</strong> say <em>"e2 to e4"</em> or <em>"e2 e4"</em>
            <br />
            <strong>Undo:</strong> say <em>"undo"</em> or <em>"take back"</em>
            <br />
            <strong>New game:</strong> say <em>"new game"</em>
            <br />
            <em>Phonetic aliases: "bee four" → b4, "knight to eff three" → Nf3</em>
          </div>
        </div>
      )}
    </div>
  )
}
