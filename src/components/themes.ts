// ─── Board & Piece Themes ─────────────────────────────────────────────────────

export interface BoardTheme {
  id: string
  label: string
  /** CSS colour for light squares */
  light: string
  /** CSS colour for dark squares */
  dark: string
  /** Accent/highlight colour used for selected / last-move squares */
  accent: string
  /** Secondary accent (slightly darker variant) used for last-move-from/to */
  accentDark: string
  /** Board border colour */
  border: string
  /** Piece rendering style */
  pieceSet: PieceSet
  /** Optional extra CSS class applied to the board element */
  boardClass?: string
}

export type PieceSet = 'unicode' | 'unicode-outlined' | 'emoji' | 'text'

// ── Piece symbol tables ──────────────────────────────────────────────────────
export type PieceColor = 'white' | 'black'
export type PieceType  = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P'

// Standard filled unicode chess pieces
const SYMBOLS_UNICODE: Record<PieceColor, Record<PieceType, string>> = {
  white: { K: '\u2654', Q: '\u2655', R: '\u2656', B: '\u2657', N: '\u2658', P: '\u2659' },
  black: { K: '\u265a', Q: '\u265b', R: '\u265c', B: '\u265d', N: '\u265e', P: '\u265f' },
}

// Emoji-style icons — fun thematic set
const SYMBOLS_EMOJI: Record<PieceColor, Record<PieceType, string>> = {
  white: { K: '\ud83d\udc51', Q: '\u2b50', R: '\ud83c\udff0', B: '\ud83e\udd85', N: '\ud83e\udd84', P: '\ud83c\udf19' },
  black: { K: '\ud83d\udc80', Q: '\ud83c\udf11', R: '\ud83d\uddfc', B: '\ud83e\udd87', N: '\ud83d\udc34', P: '\ud83d\udca3' },
}

// Plain text labels — retro terminal feel
const SYMBOLS_TEXT: Record<PieceColor, Record<PieceType, string>> = {
  white: { K: 'wK', Q: 'wQ', R: 'wR', B: 'wB', N: 'wN', P: 'wP' },
  black: { K: 'bK', Q: 'bQ', R: 'bR', B: 'bB', N: 'bN', P: 'bP' },
}

export function getPieceSymbols(
  set: PieceSet,
): Record<PieceColor, Record<PieceType, string>> {
  switch (set) {
    case 'emoji':           return SYMBOLS_EMOJI
    case 'text':            return SYMBOLS_TEXT
    case 'unicode-outlined':
    case 'unicode':
    default:                return SYMBOLS_UNICODE
  }
}

// ── Theme definitions ────────────────────────────────────────────────────────
export const BOARD_THEMES: BoardTheme[] = [
  {
    id: 'classic',
    label: '\u265f Classic Wood',
    light:      '#f0d9b5',
    dark:       '#b58863',
    accent:     '#f6f669',
    accentDark: '#baca2b',
    border:     '#7c5c2e',
    pieceSet:   'unicode',
    boardClass: 'theme-classic',
  },
  {
    id: 'glass',
    label: '\ud83e\ude9f Glass',
    light:      'rgba(200,230,255,0.55)',
    dark:       'rgba(70,140,200,0.50)',
    accent:     'rgba(255,255,120,0.70)',
    accentDark: 'rgba(180,220,60,0.70)',
    border:     'rgba(150,200,255,0.80)',
    pieceSet:   'unicode',
    boardClass: 'theme-glass',
  },
  {
    id: 'marble',
    label: '\ud83c\udfdb Marble',
    light:      '#e8e0d4',
    dark:       '#8a7d6e',
    accent:     '#d4c87a',
    accentDark: '#b0a050',
    border:     '#5c4d3c',
    pieceSet:   'unicode',
    boardClass: 'theme-marble',
  },
  {
    id: 'forest',
    label: '\ud83c\udf3f Forest',
    light:      '#c8ddb0',
    dark:       '#5a7a3e',
    accent:     '#e8e040',
    accentDark: '#b0b820',
    border:     '#2d4a1e',
    pieceSet:   'unicode',
    boardClass: 'theme-forest',
  },
  {
    id: 'ocean',
    label: '\ud83c\udf0a Ocean',
    light:      '#a8d8ea',
    dark:       '#226f8b',
    accent:     '#f9e04b',
    accentDark: '#c8a820',
    border:     '#0a3a52',
    pieceSet:   'unicode',
    boardClass: 'theme-ocean',
  },
  {
    id: 'neon',
    label: '\ud83c\udfd9 Neon City',
    light:      '#1a0a2e',
    dark:       '#0d0620',
    accent:     '#ff00ff',
    accentDark: '#cc00cc',
    border:     '#ff00ff',
    pieceSet:   'unicode',
    boardClass: 'theme-neon',
  },
  {
    id: 'simpsons',
    label: '\ud83c\udf69 Simpsons',
    light:      '#ffd700',
    dark:       '#ff7f00',
    accent:     '#00bfff',
    accentDark: '#007fbf',
    border:     '#8b4513',
    pieceSet:   'emoji',
    boardClass: 'theme-simpsons',
  },
  {
    id: 'retro',
    label: '\ud83d\udd79 Retro Terminal',
    light:      '#0a1a0a',
    dark:       '#001200',
    accent:     '#00ff41',
    accentDark: '#00cc30',
    border:     '#00ff41',
    pieceSet:   'text',
    boardClass: 'theme-retro',
  },
  {
    id: 'candy',
    label: '\ud83c\udf6d Candy',
    light:      '#ffcce0',
    dark:       '#e0589a',
    accent:     '#a3ff80',
    accentDark: '#70e050',
    border:     '#cc2277',
    pieceSet:   'unicode',
    boardClass: 'theme-candy',
  },
  {
    id: 'midnight',
    label: '\ud83c\udf19 Midnight',
    light:      '#2c3e6e',
    dark:       '#0f1a3e',
    accent:     '#5588ff',
    accentDark: '#3366dd',
    border:     '#3d5a9e',
    pieceSet:   'unicode',
    boardClass: 'theme-midnight',
  },
]

export const DEFAULT_THEME_ID = 'classic'

export function getTheme(id: string): BoardTheme {
  return BOARD_THEMES.find(t => t.id === id) ?? BOARD_THEMES[0]
}
