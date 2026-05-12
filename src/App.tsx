import { useRef, useCallback } from 'react'
import Header from './components/Header'
import ChessGame from './components/ChessGame'
import HandRecognitionPanel from './components/HandRecognitionPanel'
import type { HandData } from './hooks/useHandRecognition'
import './App.css'

export default function App() {
  // Stable ref to the ChessGame's hand-data handler so we can forward
  // MediaPipe results from the panel to the chess board.
  const chessHandlerRef = useRef<((data: HandData) => void) | null>(null)

  // ChessGame calls this once to register its handler
  const registerHandler = useCallback((cb: (data: HandData) => void) => {
    chessHandlerRef.current = cb
  }, [])

  // HandRecognitionPanel calls this each frame
  const handleHandData = useCallback((data: HandData) => {
    chessHandlerRef.current?.(data)
  }, [])

  return (
    <div className="app-shell">
      <Header />
      <div className="main-area">
        <ChessGame onHandData={registerHandler} />
        <aside className="hand-panel-aside">
          <HandRecognitionPanel onHandData={handleHandData} />
        </aside>
      </div>
    </div>
  )
}
