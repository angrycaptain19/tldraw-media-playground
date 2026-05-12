import { type Editor, createShapeId, toRichText } from 'tldraw'

/**
 * Standard chess piece Unicode symbols.
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
 * Starting layout for each row (rank 8 → rank 1, file a → h).
 * Format: "<side><type>" where side ∈ {w, b} and type ∈ {K,Q,R,B,N,P}.
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
 * Draws a complete chess board (8 × 8 squares + pieces) onto the tldraw canvas.
 *
 * @param editor   tldraw Editor instance
 * @param originX  top-left X of the board in canvas coordinates (default: centred in viewport)
 * @param originY  top-left Y of the board in canvas coordinates (default: centred in viewport)
 * @param cellSize pixel size of each square (default: 64)
 */
export function createChessBoard(
  editor: Editor,
  originX?: number,
  originY?: number,
  cellSize = 64,
) {
  const boardSize = cellSize * 8

  // Default: centre in the current viewport
  const vp = editor.getViewportPageBounds()
  const ox = originX ?? vp.x + (vp.w - boardSize) / 2
  const oy = originY ?? vp.y + (vp.h - boardSize) / 2

  const shapes: Parameters<Editor['createShapes']>[0] = []

  // ── 1. Board squares ──────────────────────────────────────────────────
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const isLight = (row + col) % 2 === 0
      const piece = INITIAL_POSITION[row][col]

      let label = ''
      if (piece) {
        const side = piece[0]  // 'w' or 'b'
        const type = piece[1]  // 'K','Q','R','B','N','P'
        label = side === 'w' ? (WHITE_PIECES[type] ?? '') : (BLACK_PIECES[type] ?? '')
      }

      shapes.push({
        id: createShapeId(),
        type: 'geo',
        x: ox + col * cellSize,
        y: oy + row * cellSize,
        props: {
          geo: 'rectangle',
          w: cellSize,
          h: cellSize,
          // Light squares: white fill; dark squares: blue fill
          fill: 'solid',
          color: isLight ? 'white' : 'blue',
          dash: 'solid',
          size: 'm',
          // Piece label rendered inside the square
          richText: toRichText(label),
          // Piece text colour contrasts with the square colour
          labelColor: isLight ? 'black' : 'white',
          align: 'middle',
          verticalAlign: 'middle',
          font: 'sans',
        },
      })
    }
  }

  // ── 2. Board border ───────────────────────────────────────────────────
  const BORDER = 4
  shapes.push({
    id: createShapeId(),
    type: 'geo',
    x: ox - BORDER,
    y: oy - BORDER,
    props: {
      geo: 'rectangle',
      w: boardSize + BORDER * 2,
      h: boardSize + BORDER * 2,
      fill: 'none',
      color: 'black',
      dash: 'solid',
      size: 'l',
    },
  })

  editor.createShapes(shapes)

  // ── 3. Zoom to fit the new board ──────────────────────────────────────
  editor.zoomToFit({ animation: { duration: 200 } })
}
