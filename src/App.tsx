import { useCallback, useRef, useState } from 'react'
import Header from './components/Header'
import GameSelectionScreen from './components/GameSelectionScreen'
import type { GameId } from './components/GameSelectionScreen'
import ChessGame from './components/ChessGame'
import DuckHuntGame from './components/DuckHuntGame'
import PlatformerGame from './components/PlatformerGame'
import FpsGame from './components/FpsGame'
import HandRecognitionPanel from './components/HandRecognitionPanel'
import AudioControlPanel from './components/AudioControlPanel'
import type { HandData } from './hooks/useHandRecognition'
import type { VoiceCommand } from './hooks/useVoiceRecognition'
import './App.css'

type ControlMode = 'none' | 'hand' | 'audio'

export default function App() {
  // 'selection' => selection screen; GameId => active game
  const [activeGame, setActiveGame] = useState<GameId | 'selection'>('selection')
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

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleSelectGame(id: GameId) {
    setActiveGame(id)
    setControlMode('none')
  }

  function handleBackToMenu() {
    setActiveGame('selection')
    setControlMode('none')
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="app-shell">
      <Header />

      {activeGame === 'selection' ? (
        /* ── Game selection screen ─────────────────────────────────────────── */
        <div className="main-area">
          <GameSelectionScreen onSelect={handleSelectGame} />
        </div>
      ) : (
        <>
          {/* ── Game selector + control-mode bar ────────────────────────── */}
          <div className="control-mode-bar">
            {/* Back-to-menu button */}
            <button
              className="control-mode-btn control-mode-btn--back"
              onClick={handleBackToMenu}
              title="Return to game menu"
            >
              ← Menu
            </button>

            <span className="control-mode-bar__separator" aria-hidden="true" />

            {/* Current game switcher */}
            <span className="control-mode-bar__label">Game:</span>
            <div className="control-mode-bar__options">
              <button
                className={`control-mode-btn ${activeGame === 'chess' ? 'control-mode-btn--active' : ''}`}
                onClick={() => handleSelectGame('chess')}
              >
                ♟️ Chess
              </button>
              <button
                className={`control-mode-btn ${activeGame === 'duckhunt' ? 'control-mode-btn--active' : ''}`}
                onClick={() => handleSelectGame('duckhunt')}
              >
                🦆 Duck Hunt
              </button>
              <button
                className={`control-mode-btn ${activeGame === 'platformer' ? 'control-mode-btn--active' : ''}`}
                onClick={() => handleSelectGame('platformer')}
              >
                🍄 Platformer
              </button>
              <button
                className={`control-mode-btn ${activeGame === 'fps' ? 'control-mode-btn--active' : ''}`}
                onClick={() => handleSelectGame('fps')}
              >
                🔫 FPS Arena
              </button>
            </div>

            {/* Control mode – only relevant for Chess */}
            {activeGame === 'chess' && (
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

          {/* ── Main content area ──────────────────────────────────────── */}
          <div className="main-area">
            {activeGame === 'chess' && (
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

            {activeGame === 'duckhunt' && (
              <DuckHuntGame />
            )}

            {activeGame === 'platformer' && (
              <PlatformerGame />
            )}

            {activeGame === 'fps' && (
              <FpsGame onExit={handleBackToMenu} />
            )}
          </div>
        </>
      )}
    </div>
  )
}
