import { type Editor, createShapeId, toRichText } from 'tldraw'
import { createChessPieces } from './createChessPieces'

/**
 * Draws a complete chess board (8 × 8 squares + border) onto the tldraw canvas,
 * then places all 32 chess pieces as individual, movable shapes on their
 * starting squares.
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
          // Empty squares — pieces are separate draggable shapes placed on top
          richText: toRichText(''),
          labelColor: 'black',
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

  // ── 3. Place chess pieces as individual movable shapes ─────────────────
  createChessPieces(editor, ox, oy, cellSize)

  // ── 4. Zoom to fit the new board ──────────────────────────────────────
  editor.zoomToFit({ animation: { duration: 200 } })
}
