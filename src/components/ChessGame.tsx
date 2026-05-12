// ─── ChessGame Component ─────────────────────────────────────────────────────
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
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
import { GESTURE_FIST, GESTURE_OPEN_PALM } from '../hooks/useHandRecognition'
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

// ── Hand drag state: separate from mouse drag ─────────────────────────────────
interface HandDragState {
  /** Square the piece was picked up from */
  from: Square
  /** Current screen position of the index tip (px) — for the ghost piece */
  screenX: number
  screenY: number
  /** Target square the piece would land on (highlighted on board) */
  targetSquare: Square | null
}

const CELL_SIZE = 64

// ── Gesture-based pick-up / drop (GestureRecognizer — optimal approach) ──────────────
//
// Instead of a raw pinch-distance threshold, the hook now uses MediaPipe’s
// GestureRecognizer model to classify the whole hand into named poses.
// This is far more robust: lighting-independent, hand-size-independent,
// and eliminates the partial-curl false-positive problem entirely.
//
//   “Pointing_Up”  → index finger extended → cursor / hover mode
//   “Closed_Fist”  → deliberate grab pose  → pick up the hovered piece
//   “Open_Palm”    → open hand             → release / drop the held piece
//
// A 6-frame temporal debounce (≈ 200 ms at 30 fps) prevents single-frame
// noise from triggering accidental picks or drops.
//
const GESTURE_DWELL_FRAMES = 6   // consecutive frames required to commit

interface ChessGameProps {
  /**
   * Parent passes a ref whose `.current` we set to our hand-data handler.
   * This avoids prop-drilling a callback that fires at 30+ fps.
   */
  registerHandDataCallback?: MutableRefObject<((data: HandData) => void) | null>
}

export default function ChessGame({ registerHandDataCallback }: ChessGameProps = {}) {
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

  // ── Hand tracking state ───────────────────────────────────────────────────────
  /** The board square that the hand index tip is currently hovering over */
  const [handHovered, setHandHovered] = useState<Square | null>(null)
  /** Active hand-drag: piece lifted via pinch */
  const [handDrag, setHandDrag] = useState<HandDragState | null>(null)

  // Refs for the hand handler closure (so it always sees fresh game/state)
  const gameRef = useRef(game)
  const handDragRef = useRef(handDrag)
  const isHumanTurnRef = useRef(false)

  useEffect(() => { gameRef.current = game }, [game])
  useEffect(() => { handDragRef.current = handDrag }, [handDrag])

  const legalMoves: Move[] = selected ? getMovesFrom(game, selected) : []
  const legalTargets = new Set(legalMoves.map(m => m.to.file + ',' + m.to.rank))

  // Legal moves from the hand-dragged piece (for highlighting valid drop targets)
  const handDragLegalMoves: Move[] = handDrag ? getMovesFrom(game, handDrag.from) : []
  const handDragLegalTargets = new Set(handDragLegalMoves.map(m => m.to.file + ',' + m.to.rank))

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

  useEffect(() => { isHumanTurnRef.current = isHumanTurn }, [isHumanTurn])

  const handleSquareClick = useCallback(
    (sq: Square) => {
      if (!isHumanTurn) return
      if (drag) return
      if (handDrag) return
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


  // ── Hand tracking: process incoming HandData ──────────────────────────────
  //
  // Strategy (GestureRecognizer-based — optimal approach):
  //  * Take the first detected hand’s index tip position.
  //  * Map normalised coords to a board square using the board element rect.
  //  * Gesture “Pointing_Up”  → cursor / hover; highlights the hovered square.
  //  * Gesture “Closed_Fist”  → pick up the friendly piece on the hovered square.
  //    Requires GESTURE_DWELL_FRAMES consecutive frames to commit (debounce).
  //  * While dragging: the index tip tracks position regardless of gesture so
  //    the ghost piece follows the hand smoothly.
  //  * Gesture “Open_Palm”    → drop the held piece on the current target square.
  //    Also requires GESTURE_DWELL_FRAMES consecutive frames to commit.
  //
  // Camera is front-facing (selfie). MediaPipe reports coordinates in the
  // mirrored video space. The panel flips the <video> via CSS scaleX(-1) so
  // the user sees themselves correctly, but raw landmark x=0 is still the
  // left edge of the physical feed (right hand side of the board from player
  // perspective). We flip x: boardX = 1 - landmark.x.

  // Dwell counters: how many consecutive frames we’ve seen each gesture
  const grabCounterRef = useRef(0)
  const dropCounterRef = useRef(0)

  const handHandlerRef = useRef<(data: HandData) => void>(() => {})

  useEffect(() => {
    handHandlerRef.current = (data: HandData) => {
      if (!boardRef.current) return
      const currentGame = gameRef.current
      const currentHandDrag = handDragRef.current
      const humanTurn = isHumanTurnRef.current

      if (data.hands.length === 0) {
        // No hand visible — reset counters and cancel any in-progress drag
        grabCounterRef.current = 0
        dropCounterRef.current = 0
        if (currentHandDrag) {
          setHandDrag(null)
          setHandHovered(null)
        }
        return
      }

      const hand = data.hands[0]
      const { indexTip, gesture } = hand

      // Mirror x: MediaPipe x=0 is the left edge of the (mirrored) camera feed.
      const mirroredX = 1 - indexTip.x

      const boardRect = boardRef.current.getBoundingClientRect()

      // Map the normalised tip position onto the board rect.
      // We always track the index tip for cursor position, regardless of gesture.
      const tipPixelX = boardRect.left + mirroredX * boardRect.width
      const tipPixelY = boardRect.top  + indexTip.y * boardRect.height

      const file = Math.floor((tipPixelX - boardRect.left) / CELL_SIZE)
      const rank = 7 - Math.floor((tipPixelY - boardRect.top) / CELL_SIZE)
      const hoveredSq: Square | null =
        file >= 0 && file < 8 && rank >= 0 && rank < 8 ? { file, rank } : null

      setHandHovered(hoveredSq)

      if (!currentHandDrag) {
        // Not currently dragging — watch for a grab gesture

        if (gesture === GESTURE_FIST) {
          grabCounterRef.current += 1
        } else {
          grabCounterRef.current = 0
        }
        // Reset drop counter when not dragging
        dropCounterRef.current = 0

        // Commit the grab only after GESTURE_DWELL_FRAMES consecutive Closed_Fist frames
        if (grabCounterRef.current >= GESTURE_DWELL_FRAMES && hoveredSq && humanTurn) {
          const piece = getPiece(currentGame.board, hoveredSq)
          if (piece && piece.color === currentGame.turn) {
            grabCounterRef.current = 0  // reset so it doesn’t re-trigger
            setSelected(hoveredSq)
            setHandDrag({
              from: hoveredSq,
              screenX: tipPixelX,
              screenY: tipPixelY,
              targetSquare: hoveredSq,
            })
          }
        }
      } else {
        // Currently dragging — watch for a release gesture

        if (gesture === GESTURE_OPEN_PALM) {
          dropCounterRef.current += 1
        } else {
          dropCounterRef.current = 0
        }
        // Reset grab counter while dragging
        grabCounterRef.current = 0

        if (dropCounterRef.current >= GESTURE_DWELL_FRAMES) {
          // Commit the drop after GESTURE_DWELL_FRAMES consecutive Open_Palm frames
          dropCounterRef.current = 0
          const target = currentHandDrag.targetSquare
          if (target && !sqEq(currentHandDrag.from, target)) {
            const moves = getMovesFrom(currentGame, currentHandDrag.from)
            const isLegal = moves.some(m =>
              m.to.file === target.file && m.to.rank === target.rank,
            )
            if (isLegal) {
              if (requiresPromotion(currentGame, currentHandDrag.from, target)) {
                const hasTarget = moves.some(
                  m => m.to.file === target.file && m.to.rank === target.rank,
                )
                if (hasTarget) {
                  setPromotionPending({ from: currentHandDrag.from, to: target })
                }
              } else {
                const move = findMove(currentGame, currentHandDrag.from, target)
                if (move) {
                  dispatch({ type: 'APPLY_MOVE', move })
                  setSelected(null)
                }
              }
            }
          } else if (target && sqEq(currentHandDrag.from, target)) {
            setSelected(null)
          }
          setHandDrag(null)
        } else {
          // Still dragging — update ghost piece position and target square
          setHandDrag(prev =>
            prev
              ? {
                  ...prev,
                  screenX: tipPixelX,
                  screenY: tipPixelY,
                  targetSquare: hoveredSq,
                }
              : null,
          )
        }
      }
    }
  })

  // Register our stable callback with the parent ref
  useEffect(() => {
    if (!registerHandDataCallback) return
    registerHandDataCallback.current = (data: HandData) => {
      handHandlerRef.current(data)
    }
    return () => {
      if (registerHandDataCallback.current === handHandlerRef.current) {
        registerHandDataCallback.current = null
      }
    }
  }, [registerHandDataCallback])

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
                const isLastFrom = lastMove !== null && sqEq(sq, lastMove.from)
                const isLastTo = lastMove !== null && sqEq(sq, lastMove.to)
                const isChkd = checkedKingSquare !== null && sqEq(sq, checkedKingSquare)
                const isDragging = drag !== null && sqEq(sq, drag.from)

                // ── Hand tracking states ──────────────────────────────────────
                const isHandHovered = handHovered !== null && sqEq(sq, handHovered)
                const isHandDragging = handDrag !== null && sqEq(sq, handDrag.from)
                const isHandDragLegal = handDrag !== null && handDragLegalTargets.has(key)
                const isHandDropTarget =
                  handDrag !== null &&
                  handDrag.targetSquare !== null &&
                  sqEq(sq, handDrag.targetSquare) &&
                  handDragLegalTargets.has(key)

                const squareCls = [
                  'chess-square',
                  isLight ? 'chess-square--light' : 'chess-square--dark',
                  isSel ? 'chess-square--selected' : '',
                  !isSel && isLastFrom ? 'chess-square--last-move-from' : '',
                  !isSel && isLastTo ? 'chess-square--last-move-to' : '',
                  isChkd ? 'chess-square--in-check' : '',
                  isHandHovered && !handDrag ? 'chess-square--hand-hover' : '',
                  isHandDragging ? 'chess-square--hand-dragging' : '',
                  isHandDropTarget ? 'chess-square--hand-drop-target' : '',
                  !isHandDropTarget && isHandDragLegal ? 'chess-square--hand-drag-legal' : '',
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

      {/* Mouse/touch drag ghost */}
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
          style={{ left: handDrag.screenX, top: handDrag.screenY }}
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
