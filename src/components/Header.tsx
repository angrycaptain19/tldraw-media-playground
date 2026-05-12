import type { Editor } from 'tldraw'
import type { AppMode } from '../App'
import { createChessBoard } from '../utils/createChessBoard'
import './Header.css'

interface HeaderProps {
  editor: Editor | null
  mode: AppMode
  setMode: (mode: AppMode) => void
}

export default function Header({ editor, mode, setMode }: HeaderProps) {
  function handleChessBoard() {
    if (!editor) return
    createChessBoard(editor)
  }

  function handleExport() {
    if (!editor) return
    const snapshot = editor.getSnapshot()
    const json = JSON.stringify(snapshot, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'canvas-snapshot.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleClear() {
    if (!editor) return
    if (!confirm('Clear the canvas? This cannot be undone.')) return
    editor.selectAll()
    editor.deleteShapes(editor.getSelectedShapeIds())
  }

  return (
    <header className="app-header">
      <div className="app-header__brand">
        <span className="app-header__icon">♟️</span>
        <span className="app-header__title">Board Game Canvas</span>
        <span className="app-header__subtitle">Powered by tldraw</span>
      </div>
      <div className="app-header__actions">
        <button
          className={`app-header__btn app-header__btn--chess${mode === 'chess' ? ' app-header__btn--active' : ''}`}
          onClick={() => setMode('chess')}
          title="Play an interactive chess game"
        >
          ♟ Play Chess
        </button>
        <button
          className={`app-header__btn${mode === 'canvas' ? ' app-header__btn--active' : ''}`}
          onClick={() => setMode('canvas')}
          title="Switch to the free-draw canvas"
        >
          ✏ Canvas Mode
        </button>
        {mode === 'canvas' && (
          <>
            <button
              className="app-header__btn"
              onClick={handleChessBoard}
              disabled={!editor}
              title="Draw a static chess board on the canvas"
            >
              ♙ Draw Board
            </button>
            <button
              className="app-header__btn"
              onClick={handleExport}
              disabled={!editor}
              title="Download canvas as JSON"
            >
              ↓ Export
            </button>
            <button
              className="app-header__btn app-header__btn--danger"
              onClick={handleClear}
              disabled={!editor}
              title="Clear all shapes"
            >
              ✕ Clear
            </button>
          </>
        )}
      </div>
    </header>
  )
}
