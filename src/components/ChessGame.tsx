// ─── ChessGame Component ─────────────────────────────────────────────────────
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { Color, GameState, Move, PieceType, Square } from '../chess/types'
import type { AiDifficulty } from '../chess/ai'
import {
  applyMove,
  createInitialGameState,
  findMove,
  getMovesFrom,
  getPiece,
  requiresPromotion,
  scheduleAiMove,
} from '../chess'
import { BOARD_THEMES, DEFAULT_THEME_ID, getTheme, getPieceSymbols } from './themes'
import './ChessGame.css'

function pieceSymbol(
  piece: { type: PieceType; color: Color },
  symbols: Record<Color, Record<PieceType, string>>,
): string {
  return symbols[piece.color][piece.type]
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

function squareLabel(sq: Square): string {
  return FILES[sq.file] + (sq.rank + 1)
}

function moveToAN(move: Move): string {
  if (move.type === 'castle-kingside') return 'O-O'
  if (move.type === 'castle-queenside') return 'O-O-O'
  const capture = move.captured ? 'x' : ''
  const prom = move.promoteTo ? ('=' + move.promoteTo) : ''
  const pFrom = move.piece.type !== 'P' ? move.piece.type : ''
  return pFrom + squareLabel(move.from) + capture + squareLabel(move.to) + prom
}

function sqEq(a: Square, b: Square): boolean {
  return a.file === b.file && a.rank === b.rank
}

type ChessAction =
  | { type: 'APPLY_MOVE'; move: Move }
  | { type: 'NEW_GAME' }
  | { type: 'UNDO' }
  | { type: 'UNDO_TWO' }

function chessReducer(state: GameState, action: ChessAction): GameState {
  switch (action.type) {
    case 'APPLY_MOVE': return applyMove(state, action.move)
    case 'NEW_GAME': return createInitialGameState()
    case 'UNDO': {
      if (state.history.length === 0) return state
      let s = createInitialGameState()
      for (const m of state.history.slice(0, -1)) s = applyMove(s, m)
      return s
    }
    case 'UNDO_TWO': {
      const targetLen = Math.max(0, state.history.length - 2)
      if (targetLen === state.history.length) return state
      let s = createInitialGameState()
      for (const m of state.history.slice(0, targetLen)) s = applyMove(s, m)
      return s
    }
    default: return state
  }
}

interface DragState { from: Square; currentX: number; currentY: number }

const CELL_SIZE = 64

export default function ChessGame() {
  const [game, dispatch] = useReducer(chessReducer, undefined, createInitialGameState)
  const [selected, setSelected] = useState<Square | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [promotionPending, setPromotionPending] = useState<{ from: Square; to: Square } | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)

  // ── Theme state ──────────────────────────────────────────────────────────────
  const [themeId, setThemeId] = useState(DEFAULT_THEME_ID)
  const theme = getTheme(themeId)
  const PIECE_SYMBOLS = getPieceSymbols(theme.pieceSet)

  // ── AI state ──────────────────────────────────────────────────────────────────
  const [aiEnabled, setAiEnabled] = useState(true)
  const [aiColor, setAiColor] = useState<Color>('black')
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>('medium')
  const aiThinkingRef = useRef(false)

  const legalMoves: Move[] = selected ? getMovesFrom(game, selected) : []
  const legalTargets = new Set(legalMoves.map(m => m.to.file + ',' + m.to.rank))
  const lastMove = game.history[game.history.length - 1] ?? null

  const checkedKingSquare: Square | null = (() => {
    if (game.status !== 'check' && game.status !== 'checkmate') return null
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const p = game.board[rank][file]
        if (p && p.type === 'K' && p.color === game.turn) return { file, rank }
      }
    }
    return null
  })()

  const executeMove = useCallback(
    (from: Square, to: Square, promoteTo?: PieceType) => {
      if (game.status === 'checkmate' || game.status === 'stalemate' || game.status === 'draw') return
      const move = findMove(game, from, to, promoteTo)
      if (!move) return
      dispatch({ type: 'APPLY_MOVE', move })
      setSelected(null)
    },
    [game],
  )

  const tryMove = useCallback(
    (from: Square, to: Square) => {
      if (requiresPromotion(game, from, to)) {
        const moves = getMovesFrom(game, from)
        const hasTarget = moves.some(m => m.to.file === to.file && m.to.rank === to.rank)
        if (hasTarget) setPromotionPending({ from, to })
      } else {
        executeMove(from, to)
      }
    },
    [game, executeMove],
  )

  // ── Block human interaction when it is the AI's turn ─────────────────────
  const isHumanTurn =
    !aiEnabled ||
    game.turn !== aiColor ||
    game.status === 'checkmate' ||
    game.status === 'stalemate' ||
    game.status === 'draw'

  const handleSquareClick = useCallback(
    (sq: Square) => {
      if (!isHumanTurn) return
      if (drag) return
      if (game.status === 'checkmate' || game.status === 'stalemate') return
      const piece = getPiece(game.board, sq)
      if (selected) {
        if (sqEq(selected, sq)) { setSelected(null); return }
        if (piece && piece.color === game.turn) { setSelected(sq); return }
        tryMove(selected, sq)
      } else {
        if (piece && piece.color === game.turn) setSelected(sq)
      }
    },
    [isHumanTurn, drag, game, selected, tryMove],
  )

  const handlePieceMouseDown = useCallback(
    (e: React.MouseEvent, sq: Square) => {
      if (!isHumanTurn) return
      if (game.status === 'checkmate' || game.status === 'stalemate') return
      const piece = getPiece(game.board, sq)
      if (!piece || piece.color !== game.turn) return
      e.preventDefault()
      setSelected(sq)
      setDrag({ from: sq, currentX: e.clientX, currentY: e.clientY })
    },
    [isHumanTurn, game],
  )

  useEffect(() => {
    if (!drag) return
    function onMouseMove(e: MouseEvent) {
      setDrag(prev => prev ? { ...prev, currentX: e.clientX, currentY: e.clientY } : null)
    }
    function onMouseUp(e: MouseEvent) {
      if (!drag || !boardRef.current) { setDrag(null); return }
      const rect = boardRef.current.getBoundingClientRect()
      const file = Math.floor((e.clientX - rect.left) / CELL_SIZE)
      const rank = 7 - Math.floor((e.clientY - rect.top) / CELL_SIZE)
      if (file >= 0 && file < 8 && rank >= 0 && rank < 8) {
        const to: Square = { file, rank }
        if (!sqEq(drag.from, to)) tryMove(drag.from, to)
      }
      setDrag(null)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [drag, tryMove])

  useEffect(() => {
    if (!drag) return
    function onTouchMove(e: TouchEvent) {
      const t = e.touches[0]
      setDrag(prev => prev ? { ...prev, currentX: t.clientX, currentY: t.clientY } : null)
    }
    function onTouchEnd(e: TouchEvent) {
      if (!drag || !boardRef.current) { setDrag(null); return }
      const t = e.changedTouches[0]
      const rect = boardRef.current.getBoundingClientRect()
      const file = Math.floor((t.clientX - rect.left) / CELL_SIZE)
      const rank = 7 - Math.floor((t.clientY - rect.top) / CELL_SIZE)
      if (file >= 0 && file < 8 && rank >= 0 && rank < 8) {
        const to: Square = { file, rank }
        if (!sqEq(drag.from, to)) tryMove(drag.from, to)
      }
      setDrag(null)
    }
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd)
    return () => {
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [drag, tryMove])

  function handlePromotion(pt: PieceType) {
    if (!promotionPending) return
    executeMove(promotionPending.from, promotionPending.to, pt)
    setPromotionPending(null)
  }

  // ── AI: trigger when it is the AI's turn ─────────────────────────────────
  useEffect(() => {
    if (
      !aiEnabled ||
      game.turn !== aiColor ||
      game.status === 'checkmate' ||
      game.status === 'stalemate' ||
      game.status === 'draw' ||
      aiThinkingRef.current
    ) return

    aiThinkingRef.current = true
    const timer = scheduleAiMove(game, aiColor, aiDifficulty, (move) => {
      aiThinkingRef.current = false
      dispatch({ type: 'APPLY_MOVE', move })
    })
    return () => {
      clearTimeout(timer)
      aiThinkingRef.current = false
    }
  }, [game, aiEnabled, aiColor, aiDifficulty])

  // ── Undo: step back two plies when AI is enabled ──────────────────────────
  function handleUndo() {
    setSelected(null)
    if (!aiEnabled || game.history.length < 2) {
      dispatch({ type: 'UNDO' })
    } else {
      dispatch({ type: 'UNDO_TWO' })
    }
  }

  // ── Labels & status ───────────────────────────────────────────────────────
  const aiIsThinking = aiEnabled && game.turn === aiColor &&
    game.status !== 'checkmate' && game.status !== 'stalemate' && game.status !== 'draw'

  const turnLabel = game.turn === 'white' ? '\u2b1c White' : '\u2b1b Black'
  let statusText = turnLabel + (aiIsThinking ? ' (AI thinking\u2026)' : "'s turn")
  let dotClass = ''
  if (game.status === 'check') {
    statusText = turnLabel + (aiIsThinking ? ' (AI in check\u2026)' : ' is in CHECK!')
    dotClass = 'chess-status__dot--check'
  } else if (game.status === 'checkmate') {
    const winner = game.turn === 'white' ? '\u2b1b Black' : '\u2b1c White'
    statusText = 'CHECKMATE \u2014 ' + winner + ' wins!'
    dotClass = 'chess-status__dot--end'
  } else if (game.status === 'stalemate') {
    statusText = 'STALEMATE \u2014 Draw!'
    dotClass = 'chess-status__dot--end'
  } else if (game.status === 'draw') {
    statusText = 'DRAW (50-move rule)'
    dotClass = 'chess-status__dot--end'
  }

  const historyPairs: string[] = []
  for (let i = 0; i < game.history.length; i += 2) {
    const wMove = moveToAN(game.history[i])
    const bMove = game.history[i + 1] ? moveToAN(game.history[i + 1]) : ''
    historyPairs.push((Math.floor(i / 2) + 1) + '. ' + wMove + (bMove ? ' ' + bMove : ''))
  }

  const dragPiece = drag ? getPiece(game.board, drag.from) : null
  const boardSize = CELL_SIZE * 8

  // ── Theme-driven CSS vars injected as inline style ────────────────────────
  const cssProp = {
    '--cell-size':    CELL_SIZE + 'px',
    '--board-size':   boardSize + 'px',
    '--sq-light':     theme.light,
    '--sq-dark':      theme.dark,
    '--sq-accent':    theme.accent,
    '--sq-accent-dk': theme.accentDark,
    '--board-border': theme.border,
  } as React.CSSProperties

  return (
    <div className="chess-game" style={cssProp}>
      <div className="chess-status">
        <div className={'chess-status__dot ' + dotClass} />
        <span>{statusText}</span>
      </div>

      {/* Controls bar */}
      <div className="chess-ai-controls">
        <label className="chess-ai-toggle">
          <input
            type="checkbox"
            checked={aiEnabled}
            onChange={e => {
              setAiEnabled(e.target.checked)
              dispatch({ type: 'NEW_GAME' })
              setSelected(null)
            }}
          />
          <span>AI opponent</span>
        </label>

        {aiEnabled && (
          <>
            <label className="chess-ai-label">
              <span>AI plays</span>
              <select
                className="chess-ai-select"
                value={aiColor}
                onChange={e => {
                  setAiColor(e.target.value as Color)
                  dispatch({ type: 'NEW_GAME' })
                  setSelected(null)
                }}
              >
                <option value="black">Black</option>
                <option value="white">White</option>
              </select>
            </label>

            <label className="chess-ai-label">
              <span>Difficulty</span>
              <select
                className="chess-ai-select"
                value={aiDifficulty}
                onChange={e => setAiDifficulty(e.target.value as AiDifficulty)}
              >
                <option value="easy">Easy (depth 1)</option>
                <option value="medium">Medium (depth 2)</option>
                <option value="hard">Hard (depth 3)</option>
              </select>
            </label>
          </>
        )}

        {/* Theme picker */}
        <label className="chess-ai-label">
          <span>Theme</span>
          <select
            className="chess-ai-select chess-theme-select"
            value={themeId}
            onChange={e => setThemeId(e.target.value)}
          >
            {BOARD_THEMES.map(t => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <div className="chess-board-wrapper">
          <div className="chess-board-labels">
            {[8, 7, 6, 5, 4, 3, 2, 1].map(r => (
              <span key={r}>{r}</span>
            ))}
          </div>

          <div
            ref={boardRef}
            className={['chess-board', theme.boardClass].filter(Boolean).join(' ')}
            style={{ touchAction: 'none' }}
          >
            {[7, 6, 5, 4, 3, 2, 1, 0].map(rank =>
              [0, 1, 2, 3, 4, 5, 6, 7].map(file => {
                const sq: Square = { file, rank }
                const key = file + ',' + rank
                const piece = getPiece(game.board, sq)
                const isLight = (file + rank) % 2 !== 0
                const isSel = selected !== null && sqEq(sq, selected)
                const isLegal = legalTargets.has(key)
                const isLastFrom = lastMove !== null && sqEq(sq, lastMove.from)
                const isLastTo = lastMove !== null && sqEq(sq, lastMove.to)
                const isChkd = checkedKingSquare !== null && sqEq(sq, checkedKingSquare)
                const isDragging = drag !== null && sqEq(sq, drag.from)

                const squareCls = [
                  'chess-square',
                  isLight ? 'chess-square--light' : 'chess-square--dark',
                  isSel ? 'chess-square--selected' : '',
                  !isSel && isLastFrom ? 'chess-square--last-move-from' : '',
                  !isSel && isLastTo ? 'chess-square--last-move-to' : '',
                  isChkd ? 'chess-square--in-check' : '',
                ].filter(Boolean).join(' ')

                const pieceCls = [
                  'chess-piece',
                  isDragging ? 'chess-piece--dragging' : '',
                  theme.pieceSet === 'text'  ? 'chess-piece--text'  : '',
                  theme.pieceSet === 'emoji' ? 'chess-piece--emoji' : '',
                ].filter(Boolean).join(' ')

                return (
                  <div key={key} className={squareCls} onClick={() => handleSquareClick(sq)}>
                    {isLegal && !piece && <div className="chess-square__dot" />}
                    {isLegal && piece && <div className="chess-square__ring" />}
                    {piece && (
                      <div
                        className={pieceCls}
                        onMouseDown={e => handlePieceMouseDown(e, sq)}
                        onTouchStart={e => {
                          const t = e.touches[0]
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          handlePieceMouseDown({ clientX: t.clientX, clientY: t.clientY, preventDefault: () => e.preventDefault() } as any, sq)
                        }}
                      >
                        {pieceSymbol(piece, PIECE_SYMBOLS)}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div style={{ display: 'flex', marginLeft: 18 }}>
          <div className="chess-board-files">
            {FILES.map(f => <span key={f}>{f}</span>)}
          </div>
        </div>
      </div>

      <div className="chess-controls">
        <button
          className="chess-btn"
          onClick={() => { dispatch({ type: 'NEW_GAME' }); setSelected(null) }}
        >
          New Game
        </button>
        <button
          className="chess-btn"
          onClick={handleUndo}
          disabled={game.history.length === 0}
        >
          Undo
        </button>
      </div>

      {historyPairs.length > 0 && (
        <div className="chess-history">
          {historyPairs.map((pair, i) => (
            <span key={i}>{pair}{'  '}</span>
          ))}
        </div>
      )}

      {drag && dragPiece && (
        <div
          className="chess-drag-ghost"
          style={{ left: drag.currentX, top: drag.currentY }}
        >
          {pieceSymbol(dragPiece, PIECE_SYMBOLS)}
        </div>
      )}

      {promotionPending && (
        <div className="chess-promotion-overlay">
          <div className="chess-promotion-dialog">
            <h3>Promote pawn to</h3>
            <div className="chess-promotion-options">
              {(['Q', 'R', 'B', 'N'] as PieceType[]).map(pt => (
                <button
                  key={pt}
                  className="chess-promotion-option"
                  onClick={() => handlePromotion(pt)}
                >
                  {PIECE_SYMBOLS[game.turn][pt]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
