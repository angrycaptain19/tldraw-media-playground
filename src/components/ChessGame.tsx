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
import type { HandData } from '../hooks/useHandRecognition'
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

// ── Hand drag state ──────────────────────────────────────────────────────────
interface HandDragState {
  from: Square
  /** Screen coordinates of the virtual piece following the index tip */
  currentX: number
  currentY: number
}

const CELL_SIZE = 64
// Pinch threshold: above this value the hand is considered "pinching"
const PINCH_PICK_UP   = 0.72
const PINCH_RELEASE   = 0.55

// ── Props ────────────────────────────────────────────────────────────────────
interface ChessGameProps {
  /** Called to get hand-tracking data from the parent-mounted HandRecognitionPanel */
  onHandData?: (cb: (data: HandData) => void) => void
}

export default function ChessGame({ onHandData: registerHandDataCb }: ChessGameProps) {
  const [game, dispatch] = useReducer(chessReducer, undefined, createInitialGameState)
  const [selected, setSelected] = useState<Square | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [promotionPending, setPromotionPending] = useState<{ from: Square; to: Square } | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)

  // ── Hand tracking state ───────────────────────────────────────────────────
  /** The square the hand's index tip is hovering over (null if none) */
  const [handHovered, setHandHovered] = useState<Square | null>(null)
  /** A piece currently being dragged by the hand (pinch active) */
  const [handDrag, setHandDrag] = useState<HandDragState | null>(null)
  // Internal refs to avoid stale closures in the hand-data callback
  const handDragRef = useRef<HandDragState | null>(null)
  const gameRef = useRef(game)
  const isHumanTurnRef = useRef(true)

  // Keep refs in sync
  useEffect(() => { gameRef.current = game }, [game])

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
  const handDragLegalMoves: Move[] = handDrag ? getMovesFrom(game, handDrag.from) : []
  const handDragLegalTargets = new Set(handDragLegalMoves.map(m => m.to.file + ',' + m.to.rank))
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

  // Keep the ref updated so the hand-data callback (stable ref) can read it
  useEffect(() => { isHumanTurnRef.current = isHumanTurn }, [isHumanTurn])

  // ── Helper: convert normalised hand point to board square ─────────────────
  /**
   * MediaPipe gives x/y normalised to the video frame [0,1].
   * We mirror x (because the camera feed is mirrored in the panel) and map
   * to the board element's bounding rect to get a chess square.
   */
  const normToSquare = useCallback((nx: number, ny: number): Square | null => {
    const board = boardRef.current
    if (!board) return null
    const rect = board.getBoundingClientRect()

    // The camera feed is naturally mirrored, so x=0 is the right side of the
    // screen from the user's perspective.  We flip x so pointing left on the
    // camera maps to the left side of the board.
    const screenX = (1 - nx) * rect.width + rect.left
    const screenY = ny * rect.height + rect.top

    const file = Math.floor((screenX - rect.left) / CELL_SIZE)
    const rank = 7 - Math.floor((screenY - rect.top) / CELL_SIZE)
    if (file < 0 || file > 7 || rank < 0 || rank > 7) return null
    return { file, rank }
  }, [])

  // ── Hand data processing ──────────────────────────────────────────────────
  const handleHandData = useCallback((data: HandData) => {
    if (!isHumanTurnRef.current) {
      // Clear any hover/drag when it's the AI's turn
      setHandHovered(null)
      return
    }

    // Use the first detected hand
    const hand = data.hands[0]
    if (!hand) {
      setHandHovered(null)
      return
    }

    const sq = normToSquare(hand.indexTip.x, hand.indexTip.y)
    setHandHovered(sq)

    const currentHandDrag = handDragRef.current
    const pinching = hand.pinchStrength >= PINCH_PICK_UP
    const wasPickedUp = currentHandDrag !== null
    const releaseThreshold = PINCH_RELEASE

    if (pinching && !wasPickedUp) {
      // Attempt to pick up the piece at the hovered square
      if (!sq) return
      const g = gameRef.current
      const piece = getPiece(g.board, sq)
      if (!piece || piece.color !== g.turn) return
      // Convert normalised tip to approximate screen coords for ghost rendering
      const board = boardRef.current
      if (!board) return
      const rect = board.getBoundingClientRect()
      const screenX = (1 - hand.indexTip.x) * rect.width + rect.left
      const screenY = hand.indexTip.y * rect.height + rect.top
      const newDrag: HandDragState = { from: sq, currentX: screenX, currentY: screenY }
      handDragRef.current = newDrag
      setHandDrag(newDrag)
      setSelected(sq)
    } else if (wasPickedUp && hand.pinchStrength < releaseThreshold) {
      // Release / drop
      const dropSq = sq
      const fromSq = currentHandDrag!.from
      handDragRef.current = null
      setHandDrag(null)
      setSelected(null)
      if (dropSq && !sqEq(fromSq, dropSq)) {
        const g = gameRef.current
        if (requiresPromotion(g, fromSq, dropSq)) {
          const moves = getMovesFrom(g, fromSq)
          if (moves.some(m => m.to.file === dropSq.file && m.to.rank === dropSq.rank)) {
            setPromotionPending({ from: fromSq, to: dropSq })
          }
        } else {
          const move = findMove(g, fromSq, dropSq)
          if (move) dispatch({ type: 'APPLY_MOVE', move })
        }
      }
    } else if (wasPickedUp) {
      // Still pinching — update ghost position
      const board = boardRef.current
      if (!board) return
      const rect = board.getBoundingClientRect()
      const screenX = (1 - hand.indexTip.x) * rect.width + rect.left
      const screenY = hand.indexTip.y * rect.height + rect.top
      const updated: HandDragState = { ...currentHandDrag!, currentX: screenX, currentY: screenY }
      handDragRef.current = updated
      setHandDrag(updated)
    }
  }, [normToSquare])

  // Register the callback with the parent so HandRecognitionPanel can call it
  useEffect(() => {
    registerHandDataCb?.(handleHandData)
  }, [registerHandDataCb, handleHandData])

  const handleSquareClick = useCallback(
    (sq: Square) => {
      if (!isHumanTurn) return
      if (drag) return
      if (handDrag) return  // hand is dragging, ignore mouse clicks
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
    [isHumanTurn, drag, handDrag, game, selected, tryMove],
  )

  const handlePieceMouseDown = useCallback(
    (e: React.MouseEvent, sq: Square) => {
      if (!isHumanTurn) return
      if (handDrag) return  // hand is dragging, ignore mouse
      if (game.status === 'checkmate' || game.status === 'stalemate') return
      const piece = getPiece(game.board, sq)
      if (!piece || piece.color !== game.turn) return
      e.preventDefault()
      setSelected(sq)
      setDrag({ from: sq, currentX: e.clientX, currentY: e.clientY })
    },
    [isHumanTurn, handDrag, game],
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
    setHandDrag(null)
    handDragRef.current = null
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
  const handDragPiece = handDrag ? getPiece(game.board, handDrag.from) : null
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
                // For hand drag: highlight valid drop targets
                const isHandDragTarget = handDrag !== null && handDragLegalTargets.has(key)
                const isHandHovered = handHovered !== null && sqEq(sq, handHovered)
                // Highlight the drop-target square the index tip is over during hand drag
                const isHandDropTarget = handDrag !== null && handHovered !== null && sqEq(sq, handHovered) && handDragLegalTargets.has(key)
                const isLastFrom = lastMove !== null && sqEq(sq, lastMove.from)
                const isLastTo = lastMove !== null && sqEq(sq, lastMove.to)
                const isChkd = checkedKingSquare !== null && sqEq(sq, checkedKingSquare)
                const isDragging = drag !== null && sqEq(sq, drag.from)
                const isHandDragging = handDrag !== null && sqEq(sq, handDrag.from)

                const squareCls = [
                  'chess-square',
                  isLight ? 'chess-square--light' : 'chess-square--dark',
                  isSel ? 'chess-square--selected' : '',
                  !isSel && isLastFrom ? 'chess-square--last-move-from' : '',
                  !isSel && isLastTo ? 'chess-square--last-move-to' : '',
                  isChkd ? 'chess-square--in-check' : '',
                  // Hand hover — subtle glow when no drag active
                  !handDrag && isHandHovered ? 'chess-square--hand-hover' : '',
                  // Green highlight for valid drop target during hand drag
                  isHandDropTarget ? 'chess-square--hand-drop-target' : '',
                  // Highlight all valid targets while hand-dragging
                  handDrag && isHandDragTarget && !isHandDropTarget ? 'chess-square--hand-drag-legal' : '',
                ].filter(Boolean).join(' ')

                const pieceCls = [
                  'chess-piece',
                  isDragging || isHandDragging ? 'chess-piece--dragging' : '',
                  theme.pieceSet === 'text'  ? 'chess-piece--text'  : '',
                  theme.pieceSet === 'emoji' ? 'chess-piece--emoji' : '',
                ].filter(Boolean).join(' ')

                return (
                  <div key={key} className={squareCls} onClick={() => handleSquareClick(sq)}>
                    {isLegal && !piece && <div className="chess-square__dot" />}
                    {isLegal && piece && <div className="chess-square__ring" />}
                    {/* Show legal dots/rings during hand drag too */}
                    {!isLegal && isHandDragTarget && !piece && <div className="chess-square__dot chess-square__dot--hand" />}
                    {!isLegal && isHandDragTarget && piece && <div className="chess-square__ring chess-square__ring--hand" />}
                    {piece && !(isHandDragging) && (
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
                    {/* Render faded piece in original square during hand drag */}
                    {piece && isHandDragging && (
                      <div className={pieceCls}>
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
          onClick={() => { dispatch({ type: 'NEW_GAME' }); setSelected(null); setHandDrag(null); handDragRef.current = null }}
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

      {/* Mouse drag ghost */}
      {drag && dragPiece && (
        <div
          className="chess-drag-ghost"
          style={{ left: drag.currentX, top: drag.currentY }}
        >
          {pieceSymbol(dragPiece, PIECE_SYMBOLS)}
        </div>
      )}

      {/* Hand drag ghost — follows the index tip */}
      {handDrag && handDragPiece && (
        <div
          className="chess-drag-ghost chess-drag-ghost--hand"
          style={{ left: handDrag.currentX, top: handDrag.currentY }}
        >
          {pieceSymbol(handDragPiece, PIECE_SYMBOLS)}
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
