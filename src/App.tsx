import { Tldraw, type Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import { useCallback, useState } from 'react'
import Header from './components/Header'
import ChessGame from './components/ChessGame'
import './App.css'

export type AppMode = 'canvas' | 'chess'

export default function App() {
  const [editor, setEditor] = useState<Editor | null>(null)
  const [mode, setMode] = useState<AppMode>('chess')

  const handleMount = useCallback((ed: Editor) => {
    setEditor(ed)
  }, [])

  return (
    <div className="app-shell">
      <Header editor={editor} mode={mode} setMode={setMode} />
      <div className="canvas-area">
        {mode === 'chess' ? (
          <ChessGame />
        ) : (
          <Tldraw
            onMount={handleMount}
            persistenceKey="board-game-canvas"
          />
        )}
      </div>
    </div>
  )
}
