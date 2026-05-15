// ─── FPS Game – Map Data ──────────────────────────────────────────────────────
// Tile arrays for every built-in map.
//
// Encoding:
//   0  = empty / walkable floor
//   1  = standard stone wall
//   2  = brick wall (accent colour)
//   3  = metal wall
//
// Layout: map[row][col]  (row 0 = top / north edge)

import type { FpsMap } from './types'

// ── MAP_01: "The Arena" ───────────────────────────────────────────────────────
//
//  A 20x20 map with a solid perimeter, four corner rooms, two corridor
//  cross-arms, and a large open centre. Tile legend:
//
//    1 = perimeter / structural wall
//    2 = decorative brick pillar
//    3 = metal doorframe accent
//    0 = walkable floor
//
// ASCII preview (. = floor, # = any wall):
//
//   ####################
//   #........#.........#
//   #........#.........#
//   #...##...3...##....#
//   #........#.........#
//   #........#.........#
//   #.................. #
//   ##3####.......####3##
//   #..................#
//   #......2..2........#
//   #..................#
//   #......2..2........#
//   #..................#
//   ##3####.......####3##
//   #........#.........#
//   #........#.........#
//   #...##...3...##....#
//   #........#.........#
//   #........#.........#
//   ####################

export const MAP_01: FpsMap = [
  // row  0 - north perimeter wall
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  // row  1
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  // row  2
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  // row  3 - brick pillars and metal doorframe
  [1, 0, 0, 2, 2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 2, 2, 0, 0, 0, 1],
  // row  4
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  // row  5
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  // row  6 - horizontal corridor connector
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  // row  7 - cross-wall with metal accents
  [1, 1, 3, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 3, 1, 1],
  // row  8 - open corridor
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  // row  9 - centre room with pillar ring
  [1, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 1],
  // row 10
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  // row 11
  [1, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 1],
  // row 12 - open corridor
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  // row 13 - cross-wall (mirror of row 7)
  [1, 1, 3, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 3, 1, 1],
  // row 14
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  // row 15
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  // row 16 - brick pillars and metal doorframe (mirror of row 3)
  [1, 0, 0, 2, 2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 2, 2, 0, 0, 0, 1],
  // row 17
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  // row 18
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  // row 19 - south perimeter wall
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
]

// ── Convenience metadata ──────────────────────────────────────────────────────

/** Number of rows in MAP_01 */
export const MAP_01_ROWS = MAP_01.length // 20

/** Number of columns in MAP_01 */
export const MAP_01_COLS = MAP_01[0].length // 20

/** Suggested player-1 spawn (col, row) inside the NW quadrant */
export const MAP_01_SPAWN_P1 = { col: 3, row: 3 } as const

/** Suggested player-2 spawn (col, row) inside the SE quadrant */
export const MAP_01_SPAWN_P2 = { col: 16, row: 16 } as const
