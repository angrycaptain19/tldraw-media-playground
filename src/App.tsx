import { useCallback, useRef, useState } from 'react'
import Header from './components/Header'
import ChessGame from './components/ChessGame'
import HandRecognitionPanel from './components/HandRecognitionPanel'
import AudioControlPanel from './components/AudioControlPanel'
import type { HandData } from './hooks/useHandRecognition'
import type { VoiceCommand } from './hooks/useVoiceRecognition'
import './App.css'

type ControlMode = 'none' | 'hand' | 'audio'

export default function App() {
  const [controlMode, setControlMode] = useState<ControlMode>('none')

  // ── Hand control wiring ───────────────────────────────────────────────────
  // Stable ref so we can forward hand data from the panel into ChessGame
  // without causing re-renders on every frame.
  const chessHandDataCbRef = useRef<((data: HandData) => void) | null>(null)

  const handleHandData = useCallback((data: HandData) => {
    chessHandDataCbRef.current?.(data)
  }, [])

  // ── Voice control wiring ──────────────────────────────────────────────────
  const chessVoiceCommandCbRef = useRef<((cmd: VoiceCommand) => void) | null>(null)

  const handleVoiceCommand = useCallback((cmd: VoiceCommand) => {
    chessVoiceCommandCbRef.current?.(cmd)
  }, [])

  return (
    <div className="app-shell">
      <Header />

      {/* Control-mode selector bar */}
      <div className="control-mode-bar">
        <span className="control-mode-bar__label">Control mode:</span>
        <div className="control-mode-bar__options">
          {(['none', 'hand', 'audio'] as ControlMode[]).map((mode) => (
            <button
              key={mode}
              className={`control-mode-btn ${controlMode === mode ? 'control-mode-btn--active' : ''}`}
              onClick={() => setControlMode(mode)}
            >
              {mode === 'none' && <>{'\uD83D\uDDB1'} Mouse / Touch</>}
              {mode === 'hand' && <>{'\u270B'} Hand Tracking</>}
              {mode === 'audio' && <>{'\uD83C\uDF99'} Voice Control</>}
            </button>
          ))}
        </div>
      </div>

      <div className="main-area">
        <ChessGame
          registerHandDataCallback={controlMode === 'hand' ? chessHandDataCbRef : undefined}
          registerVoiceCommandCallback={controlMode === 'audio' ? chessVoiceCommandCbRef : undefined}
        />

        {/* Side panel -- rendered based on selected mode */}
        {controlMode !== 'none' && (
          <aside className="control-panel-aside">
            {controlMode === 'hand' && (
              <HandRecognitionPanel onHandData={handleHandData} />
            )}
            {controlMode === 'audio' && (
              <AudioControlPanel onCommand={handleVoiceCommand} />
            )}
          </aside>
        )}
      </div>
    </div>
  )
}
