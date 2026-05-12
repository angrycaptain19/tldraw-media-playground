// ─── Simple Opposition AI ─────────────────────────────────────────────────────
//
// A minimax AI with alpha-beta pruning that plugs directly into the existing
// chess rules engine (allLegalMoves / applyMove).
//
// Difficulty levels:
//   'easy'   – depth 1, random move selection among equal scores
//   'medium' – depth 2
//   'hard'   – depth 3
//
// The evaluation function combines:
//   • Material balance (classic piece values)
//   • Piece-square tables for positional incentives
//   • Mobility bonus (number of legal moves available)
// ─────────────────────────────────────────────────────────────────────────────

import type { Color, GameState, Move, PieceType } from './types'
import { allLegalMoves } from './moves'
import { applyMove } from './engine'

// ─── AI difficulty ────────────────────────────────────────────────────────────

export type AiDifficulty = 'easy' | 'medium' | 'hard'

const DEPTH_FOR_DIFFICULTY: Record<AiDifficulty, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
}

// ─── Material values ──────────────────────────────────────────────────────────

const PIECE_VALUE: Record<PieceType, number> = {
  P: 100,
  N: 320,
  B: 330,
  R: 500,
  Q: 900,
  K: 20000,
}

// ─── Piece-square tables (from White's perspective; flipped for Black) ────────
// Each table is indexed [rank][file], rank 0 = rank 1 (White's first rank).

const PST_PAWN: number[][] = [
  [  0,  0,  0,  0,  0,  0,  0,  0],
  [ 50, 50, 50, 50, 50, 50, 50, 50],
  [ 10, 10, 20, 30, 30, 20, 10, 10],
  [  5,  5, 10, 25, 25, 10,  5,  5],
  [  0,  0,  0, 20, 20,  0,  0,  0],
  [  5, -5,-10,  0,  0,-10, -5,  5],
  [  5, 10, 10,-20,-20, 10, 10,  5],
  [  0,  0,  0,  0,  0,  0,  0,  0],
]

const PST_KNIGHT: number[][] = [
  [-50,-40,-30,-30,-30,-30,-40,-50],
  [-40,-20,  0,  0,  0,  0,-20,-40],
  [-30,  0, 10, 15, 15, 10,  0,-30],
  [-30,  5, 15, 20, 20, 15,  5,-30],
  [-30,  0, 15, 20, 20, 15,  0,-30],
  [-30,  5, 10, 15, 15, 10,  5,-30],
  [-40,-20,  0,  5,  5,  0,-20,-40],
  [-50,-40,-30,-30,-30,-30,-40,-50],
]

const PST_BISHOP: number[][] = [
  [-20,-10,-10,-10,-10,-10,-10,-20],
  [-10,  0,  0,  0,  0,  0,  0,-10],
  [-10,  0,  5, 10, 10,  5,  0,-10],
  [-10,  5,  5, 10, 10,  5,  5,-10],
  [-10,  0, 10, 10, 10, 10,  0,-10],
  [-10, 10, 10, 10, 10, 10, 10,-10],
  [-10,  5,  0,  0,  0,  0,  5,-10],
  [-20,-10,-10,-10,-10,-10,-10,-20],
]

const PST_ROOK: number[][] = [
  [  0,  0,  0,  0,  0,  0,  0,  0],
  [  5, 10, 10, 10, 10, 10, 10,  5],
  [ -5,  0,  0,  0,  0,  0,  0, -5],
  [ -5,  0,  0,  0,  0,  0,  0, -5],
  [ -5,  0,  0,  0,  0,  0,  0, -5],
  [ -5,  0,  0,  0,  0,  0,  0, -5],
  [ -5,  0,  0,  0,  0,  0,  0, -5],
  [  0,  0,  0,  5,  5,  0,  0,  0],
]

const PST_QUEEN: number[][] = [
  [-20,-10,-10, -5, -5,-10,-10,-20],
  [-10,  0,  0,  0,  0,  0,  0,-10],
  [-10,  0,  5,  5,  5,  5,  0,-10],
  [ -5,  0,  5,  5,  5,  5,  0, -5],
  [  0,  0,  5,  5,  5,  5,  0, -5],
  [-10,  5,  5,  5,  5,  5,  0,-10],
  [-10,  0,  5,  0,  0,  0,  0,-10],
  [-20,-10,-10, -5, -5,-10,-10,-20],
]

const PST_KING_MIDDLEGAME: number[][] = [
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-20,-30,-30,-40,-40,-30,-30,-20],
  [-10,-20,-20,-20,-20,-20,-20,-10],
  [ 20, 20,  0,  0,  0,  0, 20, 20],
  [ 20, 30, 10,  0,  0, 10, 30, 20],
]

const PST: Record<PieceType, number[][]> = {
  P: PST_PAWN,
  N: PST_KNIGHT,
  B: PST_BISHOP,
  R: PST_ROOK,
  Q: PST_QUEEN,
  K: PST_KING_MIDDLEGAME,
}

// ─── Static evaluation ────────────────────────────────────────────────────────

/**
 * Returns a score from White's perspective (positive = White is ahead).
 * For terminal states (checkmate / stalemate) we score extremely high/low.
 */
function evaluate(state: GameState): number {
  if (state.status === 'checkmate') {
    // The side that just moved delivered checkmate; state.turn is the loser
    return state.turn === 'white' ? -99999 : 99999
  }
  if (state.status === 'stalemate' || state.status === 'draw') return 0

  let score = 0

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = state.board[rank][file]
      if (!piece) continue

      const material = PIECE_VALUE[piece.type]

      // For PST: White uses the table as-is (rank 0 = home rank).
      // Black mirrors vertically (rank 7 -> table row 0, etc.)
      const tableRank = piece.color === 'white' ? rank : 7 - rank
      const positional = PST[piece.type][tableRank][file]

      const pieceScore = material + positional
      score += piece.color === 'white' ? pieceScore : -pieceScore
    }
  }

  // Small mobility bonus (encourages active pieces)
  const whiteMoves = allLegalMoves(state.board, 'white', state.enPassantTarget).length
  const blackMoves = allLegalMoves(state.board, 'black', state.enPassantTarget).length
  score += (whiteMoves - blackMoves) * 5

  return score
}

// ─── Move ordering (puts captures / promotions first for better pruning) ──────

function orderMoves(moves: Move[]): Move[] {
  return [...moves].sort((a, b) => {
    const aScore = mvvLva(a)
    const bScore = mvvLva(b)
    return bScore - aScore
  })
}

function mvvLva(move: Move): number {
  // Most-Valuable-Victim / Least-Valuable-Attacker heuristic
  let score = 0
  if (move.captured) {
    score += PIECE_VALUE[move.captured.type] * 10 - PIECE_VALUE[move.piece.type]
  }
  if (move.type === 'promotion' || move.type === 'promotion-capture') {
    score += PIECE_VALUE[move.promoteTo ?? 'Q']
  }
  return score
}

// ─── Minimax with alpha-beta pruning ─────────────────────────────────────────

function minimax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
): number {
  if (
    depth === 0 ||
    state.status === 'checkmate' ||
    state.status === 'stalemate' ||
    state.status === 'draw'
  ) {
    return evaluate(state)
  }

  const moves = orderMoves(allLegalMoves(state.board, state.turn, state.enPassantTarget))

  if (maximizing) {
    let best = -Infinity
    for (const move of moves) {
      const child = applyMove(state, move)
      const score = minimax(child, depth - 1, alpha, beta, false)
      best = Math.max(best, score)
      alpha = Math.max(alpha, best)
      if (beta <= alpha) break // beta cutoff
    }
    return best
  } else {
    let best = Infinity
    for (const move of moves) {
      const child = applyMove(state, move)
      const score = minimax(child, depth - 1, alpha, beta, true)
      best = Math.min(best, score)
      beta = Math.min(beta, best)
      if (beta <= alpha) break // alpha cutoff
    }
    return best
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Pick the best move for `color` in the given `state`.
 *
 * @param state       Current game state
 * @param color       Which side the AI is playing
 * @param difficulty  'easy' | 'medium' | 'hard'
 * @returns The chosen Move, or null if there are no legal moves
 */
export function pickAiMove(
  state: GameState,
  color: Color,
  difficulty: AiDifficulty = 'medium',
): Move | null {
  const depth = DEPTH_FOR_DIFFICULTY[difficulty]
  const moves = orderMoves(allLegalMoves(state.board, color, state.enPassantTarget))
  if (moves.length === 0) return null

  const maximizing = color === 'white'
  let bestScore = maximizing ? -Infinity : Infinity
  let bestMoves: Move[] = []

  for (const move of moves) {
    const child = applyMove(state, move)
    const score = minimax(child, depth - 1, -Infinity, Infinity, !maximizing)

    if (maximizing ? score > bestScore : score < bestScore) {
      bestScore = score
      bestMoves = [move]
    } else if (score === bestScore) {
      bestMoves.push(move)
    }
  }

  // Pick randomly among equally-scored moves (adds variety, especially at depth 1)
  return bestMoves[Math.floor(Math.random() * bestMoves.length)]
}

/**
 * A non-blocking wrapper that runs pickAiMove via a zero-delay setTimeout so
 * the UI can paint the human's move before the AI "thinks".
 */
export function scheduleAiMove(
  state: GameState,
  color: Color,
  difficulty: AiDifficulty,
  onMove: (move: Move) => void,
): ReturnType<typeof setTimeout> {
  return setTimeout(() => {
    const move = pickAiMove(state, color, difficulty)
    if (move) onMove(move)
  }, 0)
}
