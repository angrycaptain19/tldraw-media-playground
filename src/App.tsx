import Header from './components/Header'
import ChessGame from './components/ChessGame'
import './App.css'

export default function App() {
  return (
    <div className="app-shell">
      <Header />
      <div className="main-area">
        <ChessGame />
      </div>
    </div>
  )
}
