// ─── Chess Engine ─────────────────────────────────────────────────────────────
import type { GameState, Move, PieceType, Square } from './types'
import { initialBoard, cloneBoard, getPiece, setPiece } from './board'
import { allLegalMoves, findCheckers, getLegalMoves, isInCheck } from './moves'

// ─── Initial state ────────────────────────────────────────────────────────────

export function createInitialGameState(): GameState {
  const board = initialBoard()
  return {
    board,
    turn: 'white',
    status: 'active',
    enPassantTarget: null,
    history: [],
    halfMoveClock: 0,
    fullMoveNumber: 1,
    checkers: [],
  }
}

// ─── Apply a move ─────────────────────────────────────────────────────────────

export function applyMove(state: GameState, move: Move): GameState {
  const board = cloneBoard(state.board)
  const { from, to, type } = move

  const movedPiece = { ...move.piece, hasMoved: true }

  // Remove piece from origin
  setPiece(board, from, null)

  // Handle special move types
  if (type === 'castle-kingside') {
    const rank = from.rank
    setPiece(board, to, movedPiece)
    const rook = getPiece(board, { file: 7, rank })!
    setPiece(board, { file: 7, rank }, null)
    setPiece(board, { file: 5, rank }, { ...rook, hasMoved: true })
  } else if (type === 'castle-queenside') {
    const rank = from.rank
    setPiece(board, to, movedPiece)
    const rook = getPiece(board, { file: 0, rank })!
    setPiece(board, { file: 0, rank }, null)
    setPiece(board, { file: 3, rank }, { ...rook, hasMoved: true })
  } else if (type === 'en-passant' && move.enPassantCaptureSquare) {
    setPiece(board, move.enPassantCaptureSquare, null)
    setPiece(board, to, movedPiece)
  } else if (type === 'promotion' || type === 'promotion-capture') {
    const promoteTo = move.promoteTo ?? 'Q'
    setPiece(board, to, { type: promoteTo, color: move.piece.color, hasMoved: true })
  } else {
    setPiece(board, to, movedPiece)
  }

  // ── Update en-passant target ──────────────────────────────────────────
  let enPassantTarget: Square | null = null
  if (move.piece.type === 'P' && Math.abs(to.rank - from.rank) === 2) {
    enPassantTarget = {
      file: from.file,
      rank: (from.rank + to.rank) / 2,
    }
  }

  // ── Clock updates ─────────────────────────────────────────────────────
  const isCapture = type === 'capture' || type === 'en-passant' || type === 'promotion-capture'
  const isPawnMove = move.piece.type === 'P'
  const halfMoveClock = (isCapture || isPawnMove) ? 0 : state.halfMoveClock + 1
  const fullMoveNumber =
    move.piece.color === 'black' ? state.fullMoveNumber + 1 : state.fullMoveNumber

  // ── Determine next player ─────────────────────────────────────────────
  const nextTurn = move.piece.color === 'white' ? 'black' : 'white'

  // ── Check / checkmate / stalemate ────────────────────────────────────
  const checkers = findCheckers(board, nextTurn)
  const legalMovesForNext = allLegalMoves(board, nextTurn, enPassantTarget)
  const inCheck = isInCheck(board, nextTurn)

  let status: GameState['status']
  if (legalMovesForNext.length === 0) {
    status = inCheck ? 'checkmate' : 'stalemate'
  } else if (inCheck) {
    status = 'check'
  } else if (halfMoveClock >= 100) {
    status = 'draw'
  } else {
    status = 'active'
  }

  return {
    board,
    turn: nextTurn,
    status,
    enPassantTarget,
    history: [...state.history, move],
    halfMoveClock,
    fullMoveNumber,
    checkers,
  }
}

// ─── Query helpers ────────────────────────────────────────────────────────────

export function getMovesFrom(state: GameState, from: Square): Move[] {
  const piece = getPiece(state.board, from)
  if (!piece || piece.color !== state.turn) return []
  return getLegalMoves(state.board, from, state.enPassantTarget)
}

export function findMove(
  state: GameState,
  from: Square,
  to: Square,
  promoteTo?: PieceType,
): Move | null {
  const moves = getMovesFrom(state, from)
  return (
    moves.find(m => {
      if (m.to.file !== to.file || m.to.rank !== to.rank) return false
      if (
        (m.type === 'promotion' || m.type === 'promotion-capture') &&
        m.promoteTo !== (promoteTo ?? 'Q')
      ) {
        return false
      }
      return true
    }) ?? null
  )
}

export function requiresPromotion(state: GameState, from: Square, to: Square): boolean {
  const piece = getPiece(state.board, from)
  if (!piece || piece.type !== 'P') return false
  return (piece.color === 'white' && to.rank === 7) ||
    (piece.color === 'black' && to.rank === 0)
}
