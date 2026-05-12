// ─── Board Helpers ────────────────────────────────────────────────────────────
import type { Board, Color, Piece, PieceType, Square } from './types'

export function emptyBoard(): Board {
  return Array.from({ length: 8 }, () => Array(8).fill(null) as (Piece | null)[])
}

export function cloneBoard(board: Board): Board {
  return board.map(rank => rank.map(p => (p ? { ...p } : null)))
}

export function inBounds(sq: Square): boolean {
  return sq.file >= 0 && sq.file < 8 && sq.rank >= 0 && sq.rank < 8
}

export function squareEq(a: Square, b: Square): boolean {
  return a.file === b.file && a.rank === b.rank
}

export function getPiece(board: Board, sq: Square): Piece | null {
  return board[sq.rank][sq.file]
}

export function setPiece(board: Board, sq: Square, piece: Piece | null): void {
  board[sq.rank][sq.file] = piece
}

export function findKing(board: Board, color: Color): Square | null {
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const p = board[rank][file]
      if (p && p.type === 'K' && p.color === color) {
        return { file, rank }
      }
    }
  }
  return null
}

/** Return all squares occupied by the given color. */
export function getPieceSquares(board: Board, color: Color): Square[] {
  const result: Square[] = []
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const p = board[rank][file]
      if (p && p.color === color) result.push({ file, rank })
    }
  }
  return result
}

// ─── Initial Board Setup ──────────────────────────────────────────────────────

const BACK_RANK: PieceType[] = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']

export function initialBoard(): Board {
  const board = emptyBoard()

  for (let file = 0; file < 8; file++) {
    // White back rank (rank 0 = rank 1)
    board[0][file] = { type: BACK_RANK[file], color: 'white', hasMoved: false }
    // White pawns (rank 1 = rank 2)
    board[1][file] = { type: 'P', color: 'white', hasMoved: false }
    // Black pawns (rank 6 = rank 7)
    board[6][file] = { type: 'P', color: 'black', hasMoved: false }
    // Black back rank (rank 7 = rank 8)
    board[7][file] = { type: BACK_RANK[file], color: 'black', hasMoved: false }
  }

  return board
}
