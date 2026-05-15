// ─── GameSelectionScreen Component ───────────────────────────────────────────
// A full-screen menu that lets the player choose which game to launch.
// Add new games by extending the GAMES array below.

import './GameSelectionScreen.css'

export type GameId = 'chess' | 'duckhunt' | 'platformer' | 'fps'

interface GameMeta {
  id: GameId
  emoji: string
  name: string
  description: string
  tags: string[]
  bannerClass: string
}

const GAMES: GameMeta[] = [
  {
    id: 'chess',
    emoji: '♟️',
    name: 'Chess',
    description:
      'Classic two-player strategy. Play against a friend or challenge the AI. ' +
      'Supports hand-tracking and voice-control inputs.',
    tags: ['Strategy', 'AI Opponent', '✋ Hand Tracking', '🎙️ Voice'],
    bannerClass: 'game-card__banner--chess',
  },
  {
    id: 'duckhunt',
    emoji: '🦆',
    name: 'Duck Hunt',
    description:
      'Aim your cursor or use hand-tracking to shoot ducks before they fly away. ' +
      'How many rounds can you survive?',
    tags: ['Arcade', 'Shooter', '✋ Hand Tracking'],
    bannerClass: 'game-card__banner--duckhunt',
  },
  {
    id: 'platformer',
    emoji: '🍄',
    name: 'Platformer',
    description:
      'A Mario-style side-scrolling platformer. Jump over enemies, collect coins, ' +
      'and reach the flag. Supports WASD keyboard and hand-tracking controls.',
    tags: ['Arcade', 'Platformer', '✋ Hand Tracking', '⌨️ WASD'],
    bannerClass: 'game-card__banner--platformer',
  },
  {
    id: 'fps',
    emoji: '🔫',
    name: 'FPS Arena',
    description:
      'Local split-screen 2-player FPS. Face off in a raycasted 3D arena — ' +
      'P1 uses WASD + Space, P2 uses IJKL + Enter. First to 5 kills wins!',
    tags: ['Shooter', 'Split-Screen', '2 Players', '⌨️ Keyboard'],
    bannerClass: 'game-card__banner--fps',
  },
]

interface Props {
  onSelect: (game: GameId) => void
}

export default function GameSelectionScreen({ onSelect }: Props) {
  return (
    <section className="game-selection" aria-label="Game selection">
      <h1 className="game-selection__title">🎮 Game Arcade</h1>
      <p className="game-selection__subtitle">Choose a game to play</p>

      <div className="game-selection__grid" role="list">
        {GAMES.map((game) => (
          <article
            key={game.id}
            className="game-card"
            role="listitem"
            tabIndex={0}
            aria-label={`Play ${game.name}`}
            onClick={() => onSelect(game.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect(game.id)
              }
            }}
          >
            {/* ── Coloured banner ── */}
            <div className={`game-card__banner ${game.bannerClass}`}>
              <span className="game-card__emoji" aria-hidden="true">
                {game.emoji}
              </span>
            </div>

            {/* ── Card body ── */}
            <div className="game-card__body">
              <h2 className="game-card__name">{game.name}</h2>
              <p className="game-card__description">{game.description}</p>

              <div className="game-card__tags" aria-label="Features">
                {game.tags.map((tag) => (
                  <span key={tag} className="game-card__tag">
                    {tag}
                  </span>
                ))}
              </div>

              <button
                className="game-card__play-btn"
                tabIndex={-1}
                aria-hidden="true"
              >
                Play Now ▶
              </button>
            </div>
          </article>
        ))}
      </div>

      <p className="game-selection__footer">
        More games coming soon · Use keyboard ↵ / Space to select
      </p>
    </section>
  )
}
