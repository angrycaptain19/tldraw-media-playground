// ─── Chess Types ─────────────────────────────────────────────────────────────

export type Color = 'white' | 'black'

export type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P'

export interface Piece {
  type: PieceType
  color: Color
  /** Has this piece ever moved? (castling / pawn double-push eligibility) */
  hasMoved: boolean
}

/** Board coordinates: file 0-7 (a–h), rank 0-7 (rank 1–8) */
export interface Square {
  file: number // 0 = a … 7 = h
  rank: number // 0 = rank 1 … 7 = rank 8
}

export type Board = (Piece | null)[][]  // [rank][file], rank 0 = rank 1

export type MoveType =
  | 'normal'
  | 'capture'
  | 'castle-kingside'
  | 'castle-queenside'
  | 'en-passant'
  | 'promotion'
  | 'promotion-capture'

export interface Move {
  from: Square
  to: Square
  type: MoveType
  /** The piece that moved */
  piece: Piece
  /** Captured piece (if any) */
  captured?: Piece
  /** For pawn promotions: which piece type to promote to */
  promoteTo?: PieceType
  /** The square that was en-passant captured on */
  enPassantCaptureSquare?: Square
}

export type GameStatus =
  | 'active'
  | 'check'
  | 'checkmate'
  | 'stalemate'
  | 'draw'

export interface GameState {
  board: Board
  turn: Color
  status: GameStatus
  /** En-passant target square (the square behind the pawn that just double-moved) */
  enPassantTarget: Square | null
  /** Move history */
  history: Move[]
  /** Half-move clock for 50-move rule */
  halfMoveClock: number
  /** Full move number */
  fullMoveNumber: number
  /** Squares currently giving check */
  checkers: Square[]
}
