import { useCallback, useRef, useState } from 'react'
import Header from './components/Header'
import ChessGame from './components/ChessGame'
import DuckHuntGame from './components/DuckHuntGame'
import HandRecognitionPanel from './components/HandRecognitionPanel'
import AudioControlPanel from './components/AudioControlPanel'
import type { HandData } from './hooks/useHandRecognition'
import type { VoiceCommand } from './hooks/useVoiceRecognition'
import './App.css'

type ControlMode = 'none' | 'hand' | 'audio'
type GameMode = 'chess' | 'duckhunt'

export default function App() {
  const [gameMode, setGameMode]       = useState<GameMode>('chess')
  const [controlMode, setControlMode] = useState<ControlMode>('none')

  // ── Hand control wiring ───────────────────────────────────────────────────
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

      {/* ── Game selector + control-mode bar ──────────────────────────── */}
      <div className="control-mode-bar">
        <span className="control-mode-bar__label">Game:</span>
        <div className="control-mode-bar__options">
          <button
            className={`control-mode-btn ${gameMode === 'chess' ? 'control-mode-btn--active' : ''}`}
            onClick={() => setGameMode('chess')}
          >
            ♟️ Chess
          </button>
          <button
            className={`control-mode-btn ${gameMode === 'duckhunt' ? 'control-mode-btn--active' : ''}`}
            onClick={() => setGameMode('duckhunt')}
          >
            🦆 Duck Hunt
          </button>
        </div>

        {/* Control mode – only relevant for Chess */}
        {gameMode === 'chess' && (
          <>
            <span className="control-mode-bar__label" style={{ marginLeft: '1rem' }}>Control:</span>
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
          </>
        )}
      </div>

      {/* ── Main content area ──────────────────────────────────────────── */}
      <div className="main-area">
        {gameMode === 'chess' && (
          <>
            <ChessGame
              registerHandDataCallback={controlMode === 'hand' ? chessHandDataCbRef : undefined}
              registerVoiceCommandCallback={controlMode === 'audio' ? chessVoiceCommandCbRef : undefined}
            />

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
          </>
        )}

        {gameMode === 'duckhunt' && (
          <DuckHuntGame />
        )}
      </div>
    </div>
  )
}
