import { type Editor, createShapeId, toRichText } from 'tldraw'

/**
 * Unicode symbols for each chess piece, keyed by piece type.
 * White pieces are hollow/light; black pieces are solid/dark.
 */
const WHITE_PIECES: Record<string, string> = {
  K: '♔',
  Q: '♕',
  R: '♖',
  B: '♗',
  N: '♘',
  P: '♙',
}

const BLACK_PIECES: Record<string, string> = {
  K: '♚',
  Q: '♛',
  R: '♜',
  B: '♝',
  N: '♞',
  P: '♟',
}

/**
 * Standard chess starting position.
 * Index [0] = rank 8 (black's back rank), index [7] = rank 1 (white's back rank).
 * Each entry is "<side><type>": side ∈ {w, b}, type ∈ {K,Q,R,B,N,P}.
 */
const INITIAL_POSITION: (string | null)[][] = [
  ['bR', 'bN', 'bB', 'bQ', 'bK', 'bB', 'bN', 'bR'], // rank 8
  ['bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP'], // rank 7
  [null, null, null, null, null, null, null, null],   // rank 6
  [null, null, null, null, null, null, null, null],   // rank 5
  [null, null, null, null, null, null, null, null],   // rank 4
  [null, null, null, null, null, null, null, null],   // rank 3
  ['wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP'], // rank 2
  ['wR', 'wN', 'wB', 'wQ', 'wK', 'wB', 'wN', 'wR'], // rank 1
]

/**
 * Places all 32 chess pieces as independent text shapes centred on their
 * respective squares.  Each piece is a separate, draggable shape so players
 * can move pieces around the board freely.
 *
 * @param editor    tldraw Editor instance
 * @param originX   top-left X of the board in canvas coordinates
 * @param originY   top-left Y of the board in canvas coordinates
 * @param cellSize  pixel size of each square (must match the board's cellSize)
 */
export function createChessPieces(
  editor: Editor,
  originX: number,
  originY: number,
  cellSize = 64,
) {
  // Scale factor: text 'xl' looks good at ~64 px squares; adjust proportionally.
  const scale = cellSize / 64

  const shapes: Parameters<Editor['createShapes']>[0] = []

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = INITIAL_POSITION[row][col]
      if (!piece) continue

      const side = piece[0]  // 'w' or 'b'
      const type = piece[1]  // 'K','Q','R','B','N','P'
      const symbol = side === 'w' ? (WHITE_PIECES[type] ?? '') : (BLACK_PIECES[type] ?? '')
      if (!symbol) continue

      // Position the text shape within the cell with a small margin.
      const cellX = originX + col * cellSize
      const cellY = originY + row * cellSize

      shapes.push({
        id: createShapeId(),
        type: 'text',
        x: cellX + cellSize * 0.05,
        y: cellY + cellSize * 0.05,
        props: {
          richText: toRichText(symbol),
          // Use a large size so the glyph fills most of the cell.
          size: 'xl',
          font: 'sans',
          color: 'black',
          textAlign: 'middle',
          w: cellSize * 0.9,
          autoSize: false,
          scale,
        },
      })
    }
  }

  editor.createShapes(shapes)
}
