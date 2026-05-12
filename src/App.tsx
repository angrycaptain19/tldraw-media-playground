import { Tldraw, type Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import { useCallback, useState } from 'react'
import Header from './components/Header'
import './App.css'

export default function App() {
  const [editor, setEditor] = useState<Editor | null>(null)

  const handleMount = useCallback((ed: Editor) => {
    setEditor(ed)
  }, [])

  return (
    <div className="app-shell">
      <Header editor={editor} />
      <div className="canvas-area">
        <Tldraw
          onMount={handleMount}
          persistenceKey="board-game-canvas"
        />
      </div>
    </div>
  )
}
