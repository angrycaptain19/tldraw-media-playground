import { useCallback, useRef } from 'react'
import Header from './components/Header'
import ChessGame from './components/ChessGame'
import HandRecognitionPanel from './components/HandRecognitionPanel'
import type { HandData } from './hooks/useHandRecognition'
import './App.css'

export default function App() {
  // Stable ref so we can forward hand data from the panel into ChessGame
  // without causing re-renders on every frame.
  const chessHandDataCbRef = useRef<((data: HandData) => void) | null>(null)

  const handleHandData = useCallback((data: HandData) => {
    chessHandDataCbRef.current?.(data)
  }, [])

  return (
    <div className="app-shell">
      <Header />
      <div className="main-area">
        <ChessGame registerHandDataCallback={chessHandDataCbRef} />
        <aside className="hand-panel-aside">
          <HandRecognitionPanel onHandData={handleHandData} />
        </aside>
      </div>
    </div>
  )
}
