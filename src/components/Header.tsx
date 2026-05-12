import './Header.css'

export default function Header() {
  return (
    <header className="app-header">
      <div className="app-header__brand">
        <span className="app-header__icon">♟️</span>
        <span className="app-header__title">Board Game Canvas</span>
        <span className="app-header__subtitle">Powered by tldraw</span>
      </div>
    </header>
  )
}
