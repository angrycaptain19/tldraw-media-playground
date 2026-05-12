// ─── Move Generation ──────────────────────────────────────────────────────────
import type { Board, Color, Move, MoveType, Piece, Square } from './types'
import {
  cloneBoard,
  findKing,
  getPiece,
  getPieceSquares,
  inBounds,
  setPiece,
  squareEq,
} from './board'

// ─── Attack helpers ───────────────────────────────────────────────────────────

/** All squares attacked by `color` (ignores legality / king safety). */
export function attackedSquares(board: Board, color: Color): Set<string> {
  const attacked = new Set<string>()
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const p = board[rank][file]
      if (!p || p.color !== color) continue
      const from = { file, rank }
      const targets = rawAttacks(board, from, p)
      for (const sq of targets) {
        attacked.add(sqKey(sq))
      }
    }
  }
  return attacked
}

function sqKey(sq: Square): string {
  return `${sq.file},${sq.rank}`
}

/** Returns squares attacked by the piece at `from` (not checking legality). */
function rawAttacks(board: Board, from: Square, piece: Piece): Square[] {
  switch (piece.type) {
    case 'P': return pawnAttacks(from, piece.color)
    case 'N': return knightAttacks(from)
    case 'B': return slidingAttacks(board, from, DIAGONAL_DIRS)
    case 'R': return slidingAttacks(board, from, CARDINAL_DIRS)
    case 'Q': return slidingAttacks(board, from, [...DIAGONAL_DIRS, ...CARDINAL_DIRS])
    case 'K': return kingAttacks(from)
  }
}

const DIAGONAL_DIRS = [
  { df: 1, dr: 1 },
  { df: 1, dr: -1 },
  { df: -1, dr: 1 },
  { df: -1, dr: -1 },
]
const CARDINAL_DIRS = [
  { df: 0, dr: 1 },
  { df: 0, dr: -1 },
  { df: 1, dr: 0 },
  { df: -1, dr: 0 },
]

function pawnAttacks(from: Square, color: Color): Square[] {
  const dir = color === 'white' ? 1 : -1
  const result: Square[] = []
  for (const df of [-1, 1]) {
    const sq = { file: from.file + df, rank: from.rank + dir }
    if (inBounds(sq)) result.push(sq)
  }
  return result
}

function knightAttacks(from: Square): Square[] {
  const offsets = [
    { df: 1, dr: 2 }, { df: -1, dr: 2 },
    { df: 1, dr: -2 }, { df: -1, dr: -2 },
    { df: 2, dr: 1 }, { df: -2, dr: 1 },
    { df: 2, dr: -1 }, { df: -2, dr: -1 },
  ]
  return offsets
    .map(o => ({ file: from.file + o.df, rank: from.rank + o.dr }))
    .filter(inBounds)
}

function slidingAttacks(
  board: Board,
  from: Square,
  dirs: { df: number; dr: number }[],
): Square[] {
  const result: Square[] = []
  for (const { df, dr } of dirs) {
    let sq = { file: from.file + df, rank: from.rank + dr }
    while (inBounds(sq)) {
      result.push(sq)
      if (getPiece(board, sq) !== null) break // blocked
      sq = { file: sq.file + df, rank: sq.rank + dr }
    }
  }
  return result
}

function kingAttacks(from: Square): Square[] {
  const offsets = [
    { df: 1, dr: 0 }, { df: -1, dr: 0 },
    { df: 0, dr: 1 }, { df: 0, dr: -1 },
    { df: 1, dr: 1 }, { df: 1, dr: -1 },
    { df: -1, dr: 1 }, { df: -1, dr: -1 },
  ]
  return offsets
    .map(o => ({ file: from.file + o.df, rank: from.rank + o.dr }))
    .filter(inBounds)
}

// ─── Check detection ──────────────────────────────────────────────────────────

export function isInCheck(board: Board, color: Color): boolean {
  const king = findKing(board, color)
  if (!king) return false
  const enemy: Color = color === 'white' ? 'black' : 'white'
  const attacked = attackedSquares(board, enemy)
  return attacked.has(sqKey(king))
}

/** Squares that are attacking the king of `color`. */
export function findCheckers(board: Board, color: Color): Square[] {
  const king = findKing(board, color)
  if (!king) return []
  const checkers: Square[] = []
  const enemy: Color = color === 'white' ? 'black' : 'white'
  for (const sq of getPieceSquares(board, enemy)) {
    const p = getPiece(board, sq)!
    const attacks = rawAttacks(board, sq, p)
    if (attacks.some(a => squareEq(a, king))) {
      checkers.push(sq)
    }
  }
  return checkers
}

// ─── Pseudo-legal move generation ────────────────────────────────────────────

/** Generates pseudo-legal moves (may leave king in check). */
function pseudoLegalMoves(
  board: Board,
  from: Square,
  enPassantTarget: Square | null,
): Move[] {
  const piece = getPiece(board, from)
  if (!piece) return []

  switch (piece.type) {
    case 'P': return pawnMoves(board, from, piece, enPassantTarget)
    case 'N': return knightMoves(board, from, piece)
    case 'B': return slidingMoves(board, from, piece, DIAGONAL_DIRS)
    case 'R': return slidingMoves(board, from, piece, CARDINAL_DIRS)
    case 'Q': return slidingMoves(board, from, piece, [...DIAGONAL_DIRS, ...CARDINAL_DIRS])
    case 'K': return kingMoves(board, from, piece)
  }
}

function makeMove(type: MoveType, from: Square, to: Square, piece: Piece, captured?: Piece): Move {
  return { type, from, to, piece, captured }
}

function pawnMoves(
  board: Board,
  from: Square,
  piece: Piece,
  enPassantTarget: Square | null,
): Move[] {
  const moves: Move[] = []
  const dir = piece.color === 'white' ? 1 : -1
  const startRank = piece.color === 'white' ? 1 : 6
  const promRank = piece.color === 'white' ? 7 : 0

  // Single push
  const oneStep = { file: from.file, rank: from.rank + dir }
  if (inBounds(oneStep) && getPiece(board, oneStep) === null) {
    if (oneStep.rank === promRank) {
      for (const pt of ['Q', 'R', 'B', 'N'] as const) {
        moves.push({ ...makeMove('promotion', from, oneStep, piece), promoteTo: pt })
      }
    } else {
      moves.push(makeMove('normal', from, oneStep, piece))
    }

    // Double push from starting rank
    if (from.rank === startRank) {
      const twoStep = { file: from.file, rank: from.rank + 2 * dir }
      if (inBounds(twoStep) && getPiece(board, twoStep) === null) {
        moves.push(makeMove('normal', from, twoStep, piece))
      }
    }
  }

  // Captures
  for (const df of [-1, 1]) {
    const capSq = { file: from.file + df, rank: from.rank + dir }
    if (!inBounds(capSq)) continue
    const target = getPiece(board, capSq)
    if (target && target.color !== piece.color) {
      if (capSq.rank === promRank) {
        for (const pt of ['Q', 'R', 'B', 'N'] as const) {
          moves.push({ ...makeMove('promotion-capture', from, capSq, piece, target), promoteTo: pt })
        }
      } else {
        moves.push(makeMove('capture', from, capSq, piece, target))
      }
    }

    // En-passant
    if (enPassantTarget && squareEq(capSq, enPassantTarget)) {
      const captured = getPiece(board, { file: capSq.file, rank: from.rank })
      if (captured && captured.color !== piece.color) {
        moves.push({
          type: 'en-passant',
          from,
          to: capSq,
          piece,
          captured,
          enPassantCaptureSquare: { file: capSq.file, rank: from.rank },
        })
      }
    }
  }

  return moves
}

function knightMoves(board: Board, from: Square, piece: Piece): Move[] {
  return knightAttacks(from)
    .map(to => {
      const target = getPiece(board, to)
      if (target === null) return makeMove('normal', from, to, piece)
      if (target.color !== piece.color) return makeMove('capture', from, to, piece, target)
      return null
    })
    .filter((m): m is Move => m !== null)
}

function slidingMoves(
  board: Board,
  from: Square,
  piece: Piece,
  dirs: { df: number; dr: number }[],
): Move[] {
  const moves: Move[] = []
  for (const { df, dr } of dirs) {
    let sq = { file: from.file + df, rank: from.rank + dr }
    while (inBounds(sq)) {
      const target = getPiece(board, sq)
      if (target === null) {
        moves.push(makeMove('normal', from, sq, piece))
      } else {
        if (target.color !== piece.color) {
          moves.push(makeMove('capture', from, sq, piece, target))
        }
        break
      }
      sq = { file: sq.file + df, rank: sq.rank + dr }
    }
  }
  return moves
}

function kingMoves(board: Board, from: Square, piece: Piece): Move[] {
  return kingAttacks(from)
    .map(to => {
      const target = getPiece(board, to)
      if (target === null) return makeMove('normal', from, to, piece)
      if (target.color !== piece.color) return makeMove('capture', from, to, piece, target)
      return null
    })
    .filter((m): m is Move => m !== null)
}

// ─── Legality filter (remove moves that leave king in check) ─────────────────

function applyMoveToBoard(board: Board, move: Move): Board {
  const next = cloneBoard(board)
  const movedPiece: Piece = { ...move.piece, hasMoved: true }

  // Handle en-passant capture
  if (move.type === 'en-passant' && move.enPassantCaptureSquare) {
    setPiece(next, move.enPassantCaptureSquare, null)
  }

  setPiece(next, move.from, null)
  setPiece(next, move.to, move.promoteTo
    ? { type: move.promoteTo, color: move.piece.color, hasMoved: true }
    : movedPiece)

  return next
}

export function getLegalMoves(
  board: Board,
  from: Square,
  enPassantTarget: Square | null,
): Move[] {
  const piece = getPiece(board, from)
  if (!piece) return []

  const pseudo = pseudoLegalMoves(board, from, enPassantTarget)

  // Add castling moves (they are legal-only)
  const castlingMoves = getCastlingMoves(board, from, piece)

  return [...pseudo, ...castlingMoves].filter(move => {
    const next = applyMoveToBoard(board, move)
    return !isInCheck(next, piece.color)
  })
}

// ─── Castling ─────────────────────────────────────────────────────────────────

function getCastlingMoves(board: Board, from: Square, piece: Piece): Move[] {
  if (piece.type !== 'K' || piece.hasMoved) return []

  const backRank = piece.color === 'white' ? 0 : 7
  if (from.rank !== backRank || from.file !== 4) return []

  if (isInCheck(board, piece.color)) return []

  const enemy: Color = piece.color === 'white' ? 'black' : 'white'
  const attacked = attackedSquares(board, enemy)
  const moves: Move[] = []

  // Kingside
  const kRook = getPiece(board, { file: 7, rank: backRank })
  if (
    kRook && kRook.type === 'R' && !kRook.hasMoved &&
    getPiece(board, { file: 5, rank: backRank }) === null &&
    getPiece(board, { file: 6, rank: backRank }) === null &&
    !attacked.has(sqKey({ file: 5, rank: backRank })) &&
    !attacked.has(sqKey({ file: 6, rank: backRank }))
  ) {
    moves.push({
      type: 'castle-kingside',
      from,
      to: { file: 6, rank: backRank },
      piece,
    })
  }

  // Queenside
  const qRook = getPiece(board, { file: 0, rank: backRank })
  if (
    qRook && qRook.type === 'R' && !qRook.hasMoved &&
    getPiece(board, { file: 1, rank: backRank }) === null &&
    getPiece(board, { file: 2, rank: backRank }) === null &&
    getPiece(board, { file: 3, rank: backRank }) === null &&
    !attacked.has(sqKey({ file: 3, rank: backRank })) &&
    !attacked.has(sqKey({ file: 2, rank: backRank }))
  ) {
    moves.push({
      type: 'castle-queenside',
      from,
      to: { file: 2, rank: backRank },
      piece,
    })
  }

  return moves
}

// ─── All legal moves for a color ─────────────────────────────────────────────

export function allLegalMoves(
  board: Board,
  color: Color,
  enPassantTarget: Square | null,
): Move[] {
  const moves: Move[] = []
  for (const sq of getPieceSquares(board, color)) {
    moves.push(...getLegalMoves(board, sq, enPassantTarget))
  }
  return moves
}
