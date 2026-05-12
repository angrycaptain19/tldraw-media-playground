import Header from './components/Header'
import ChessGame from './components/ChessGame'
import HandRecognitionPanel from './components/HandRecognitionPanel'
import './App.css'

export default function App() {
  return (
    <div className="app-shell">
      <Header />
      <div className="main-area">
        <ChessGame />
        <aside className="hand-panel-aside">
          <HandRecognitionPanel />
        </aside>
      </div>
    </div>
  )
}
