// ─── Chess module public API ──────────────────────────────────────────────────
export type {
  Color,
  PieceType,
  Piece,
  Square,
  Board,
  Move,
  MoveType,
  GameState,
  GameStatus,
} from './types'

export {
  createInitialGameState,
  applyMove,
  getMovesFrom,
  findMove,
  requiresPromotion,
} from './engine'

export { initialBoard, cloneBoard, getPiece, findKing } from './board'

export { allLegalMoves, getLegalMoves, isInCheck, findCheckers } from './moves'
