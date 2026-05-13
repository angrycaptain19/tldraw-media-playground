/**
 * NES Duck Hunt — pixel-accurate sprite components
 *
 * Sprites are drawn on SVG grids using individual pixel <rect> elements at a
 * fixed scale, with imageRendering:pixelated for the classic chunky NES look.
 *
 * NES palette colours (approximate sRGB):
 *   #000000  Black          – outlines
 *   #FFFFFF  White          – chest, teeth, eye sclera
 *   #8C2000  Dark Rust      – dog body shadow
 *   #C84818  Rust Red       – main dog body colour
 *   #E87848  Mid Orange     – body highlight
 *   #180800  Very Dark Brn  – ear colour
 *   #3C1800  Dark Brown     – ear mid-tone
 *   #E8A000  Amber/Yellow   – dog nose, duck bill & feet
 *   #585858  Dark Grey      – chest spots
 *   #C8A870  Tan            – leg / underside
 *   #2060C0  Blue           – duck body
 *   #004800  Dark Green     – duck head
 *   #007070  Teal           – duck wing
 *   #F0E8D0  Off-White      – duck neck ring
 */

import React from 'react'

// Dog colours
const BK = '#000000'
const WH = '#FFFFFF'
const DR = '#8C2000'
const MR = '#C84818'
const LR = '#E87848'
const VD = '#180800'
const DB_EAR = '#3C1800'
const AM = '#E8A000'
const SP = '#585858'
const TN = '#C8A870'
const EY = '#F8F8F0'

// Duck colours
const DU = '#2060C0'
const DG = '#004800'
const TQ = '#007070'
const YL = '#E8A000'
const NR = '#F0E8D0'

const __ = ''

interface Row { x: number; y: number; px: string[] }

function r(x: number, y: number, ...px: string[]): Row { return { x, y, px } }

function renderRows(rows: Row[], scale: number): React.ReactElement[] {
  const rects: React.ReactElement[] = []
  let k = 0
  rows.forEach(({ x: sx, y: sy, px }) => {
    px.forEach((col, i) => {
      if (!col) return
      rects.push(
        <rect
          key={k++}
          x={(sx + i) * scale}
          y={sy * scale}
          width={scale}
          height={scale}
          fill={col}
        />
      )
    })
  })
  return rects
}

// SNIFF state rows
const SNIFF_ROWS: Row[] = [
  r( 0, 1, VD, VD, VD),
  r( 0, 2, VD, DB_EAR, DB_EAR, VD),
  r( 0, 3, VD, DB_EAR, DB_EAR, DB_EAR, VD),
  r( 1, 4, VD, DB_EAR, DB_EAR, VD),
  r( 2, 5, VD, VD),
  r(18, 1, VD, VD, VD),
  r(18, 2, VD, DB_EAR, DB_EAR, VD),
  r(18, 3, VD, DB_EAR, DB_EAR, DB_EAR, VD),
  r(18, 4, VD, DB_EAR, DB_EAR, VD),
  r(18, 5, VD, VD),
  r( 4, 0, BK, BK, BK, BK, BK, BK, BK, BK, BK, BK, BK, BK, BK, BK),
  r( 4, 1, BK, MR, MR, MR, MR, MR, MR, MR, MR, MR, MR, MR, MR, BK),
  r( 4, 2, BK, MR, MR, BK, EY, BK, MR, MR, MR, BK, EY, BK, MR, BK),
  r( 4, 3, BK, MR, MR, BK, BK, LR, MR, MR, MR, BK, BK, LR, MR, BK),
  r( 3, 4, BK, MR, MR, MR, MR, MR, MR, MR, MR, MR, MR, MR, MR, MR, BK),
  r( 3, 5, BK, MR, DR, AM, AM, AM, AM, AM, AM, AM, DR, MR, MR, MR, BK),
  r( 3, 6, BK, MR, DR, AM, AM, DR, DR, AM, AM, DR, DR, MR, MR, MR, BK),
  r( 4, 7, BK, MR, MR, BK, BK, MR, MR, BK, BK, MR, MR, MR, BK),
  r( 6, 8, BK, MR, MR, MR, MR, MR, MR, MR, BK),
  r( 4, 9,  BK, BK, MR, WH, WH, WH, WH, WH, WH, WH, MR, BK, BK),
  r( 4, 10, BK, MR, WH, WH, SP, WH, WH, WH, SP, WH, WH, MR, BK),
  r( 4, 11, BK, MR, WH, WH, WH, WH, WH, WH, WH, WH, WH, MR, BK),
  r( 4, 12, BK, MR, WH, SP, WH, WH, WH, WH, SP, WH, MR, BK),
  r( 4, 13, BK, BK, DR, DR, DR, DR, DR, DR, DR, BK, BK),
  r( 3,  9, BK, MR),
  r( 3, 10, BK, MR),
  r( 3, 11, MR, MR),
  r(13,  9, MR, BK),
  r(13, 10, MR, BK),
  r(13, 11, MR, MR),
  r( 5, 14, BK, TN, TN, BK, __, BK, TN, TN, BK),
  r( 5, 15, BK, TN, TN, BK, __, BK, TN, TN, BK),
]

// LAUGH state rows
const LAUGH_ROWS: Row[] = [
  r( 0,  3, VD, VD, VD),
  r( 0,  4, VD, DB_EAR, DB_EAR, VD),
  r( 0,  5, VD, DB_EAR, DB_EAR, DB_EAR, VD),
  r( 0,  6, VD, DB_EAR, DB_EAR, DB_EAR, VD),
  r( 1,  7, VD, DB_EAR, DB_EAR, VD),
  r( 2,  8, VD, VD),
  r(18,  3, VD, VD, VD),
  r(18,  4, VD, DB_EAR, DB_EAR, VD),
  r(18,  5, VD, DB_EAR, DB_EAR, DB_EAR, VD),
  r(18,  6, VD, DB_EAR, DB_EAR, DB_EAR, VD),
  r(18,  7, VD, DB_EAR, DB_EAR, VD),
  r(18,  8, VD, VD),
  r( 4,  0, BK, BK, BK, BK, BK, BK, BK, BK, BK, BK, BK, BK, BK, BK),
  r( 4,  1, BK, MR, MR, MR, MR, MR, MR, MR, MR, MR, MR, MR, MR, BK),
  r( 4,  2, BK, MR, BK, EY, BK, MR, MR, MR, MR, BK, EY, BK, MR, BK),
  r( 4,  3, BK, MR, LR, LR, LR, MR, MR, MR, MR, LR, LR, LR, MR, BK),
  r( 4,  4, BK, MR, MR, AM, AM, AM, AM, AM, AM, MR, MR, MR, MR, BK),
  r( 4,  5, BK, MR, MR, AM, AM, DR, DR, AM, AM, DR, MR, MR, MR, BK),
  r( 5,  6, BK, WH, WH, WH, WH, WH, WH, WH, WH, BK),
  r( 5,  7, BK, WH, BK, WH, BK, WH, BK, WH, WH, BK),
  r( 5,  8, BK, BK, BK, BK, BK, BK, BK, BK, BK, BK),
  r( 7,  9, BK, MR, MR, MR, MR, MR, BK),
  r( 4, 10, BK, BK, MR, WH, WH, WH, WH, WH, WH, WH, MR, BK, BK),
  r( 4, 11, BK, MR, WH, WH, SP, WH, WH, WH, SP, WH, WH, MR, BK),
  r( 4, 12, BK, MR, WH, WH, WH, WH, WH, WH, WH, WH, WH, MR, BK),
  r( 4, 13, BK, MR, WH, SP, WH, WH, WH, WH, SP, WH, MR, BK),
  r( 4, 14, BK, BK, DR, DR, DR, DR, DR, DR, DR, BK, BK),
  r( 0, 11, BK, MR, MR, BK),
  r( 0, 12, BK, MR, MR),
  r( 1, 13, MR, MR, BK),
  r(13, 11, BK, MR, MR, BK),
  r(13, 12, MR, MR, BK),
  r(13, 13, BK, MR, MR),
  r( 0, 14, BK, DR, DR),
  r(14, 14, DR, DR, BK),
  r( 5, 15, BK, TN, TN, BK, __, BK, TN, TN, BK),
  r( 5, 16, BK, TN, TN, BK, __, BK, TN, TN, BK),
  r( 5, 17, BK, TN, BK, __, __, BK, TN, BK),
  r( 4, 18, BK, TN, TN, TN, __, BK, TN, TN, TN, BK),
]

// HOLD state rows
const HOLD_ROWS: Row[] = [
  r( 1,  1, VD, VD, VD),
  r( 1,  2, VD, DB_EAR, DB_EAR, VD),
  r( 1,  3, VD, DB_EAR, DB_EAR, DB_EAR, VD),
  r( 2,  4, VD, DB_EAR, DB_EAR, VD),
  r( 3,  5, VD, VD),
  r(18,  1, VD, VD, VD),
  r(18,  2, VD, DB_EAR, DB_EAR, VD),
  r(18,  3, VD, DB_EAR, DB_EAR, DB_EAR, VD),
  r(18,  4, VD, DB_EAR, DB_EAR, VD),
  r(18,  5, VD, VD),
  r( 4,  0, BK, BK, BK, BK, BK, BK, BK, BK, BK, BK, BK, BK, BK, BK),
  r( 4,  1, BK, MR, MR, MR, MR, MR, MR, MR, MR, MR, MR, MR, MR, BK),
  r( 4,  2, BK, MR, BK, EY, BK, MR, MR, MR, MR, BK, EY, BK, MR, BK),
  r( 4,  3, BK, MR, LR, LR, LR, MR, MR, MR, MR, LR, LR, LR, MR, BK),
  r( 3,  4, BK, MR, MR, MR, AM, AM, AM, AM, AM, AM, MR, MR, MR, MR, BK),
  r( 3,  5, BK, MR, DR, AM, AM, AM, AM, AM, AM, AM, DR, MR, MR, MR, BK),
  r( 4,  6, BK, MR, MR, BK, BK, MR, MR, BK, BK, MR, MR, MR, BK),
  r( 7,  7, BK, MR, MR, MR, MR, MR, BK),
  r( 4,  8, BK, BK, MR, WH, WH, WH, WH, WH, WH, WH, MR, BK, BK),
  r( 4,  9, BK, MR, WH, WH, SP, WH, WH, WH, SP, WH, WH, MR, BK),
  r( 4, 10, BK, MR, WH, WH, WH, WH, WH, WH, WH, WH, WH, MR, BK),
  r( 4, 11, BK, MR, WH, SP, WH, WH, WH, WH, SP, WH, MR, BK),
  r( 4, 12, BK, BK, DR, DR, DR, DR, DR, DR, DR, BK, BK),
  r( 3,  6, BK, DR),
  r( 3,  7, BK, MR, MR),
  r( 3,  8, BK, MR),
  r(14,  6, DR, BK),
  r(14,  7, MR, MR, BK),
  r(14,  8, MR, BK),
  r( 5, 13, BK, TN, TN, BK, __, BK, TN, TN, BK),
  r( 5, 14, BK, TN, TN, BK, __, BK, TN, TN, BK),
  r( 5, 15, BK, TN, BK, __, __, BK, TN, BK),
  r( 4, 16, BK, TN, TN, TN, __, BK, TN, TN, TN, BK),
]

function dogRows(state: 'sniff' | 'hold' | 'laugh'): Row[] {
  if (state === 'laugh') return LAUGH_ROWS
  if (state === 'hold')  return HOLD_ROWS
  return SNIFF_ROWS
}

// Dog native canvas sizes (width x height in NES pixels)
const DOG_NATIVE = {
  sniff: { w: 22, h: 16 },
  laugh: { w: 22, h: 19 },
  hold:  { w: 22, h: 17 },
}

// Duck pixel art
function duckRows(wingFrame: 0 | 1 | 2): Row[] {
  const wy = wingFrame === 0 ? 3 : wingFrame === 1 ? 5 : 7
  return [
    r( 8, 0, BK, BK, BK, BK, BK),
    r( 8, 1, BK, DG, DG, DG, BK),
    r( 7, 2, BK, DG, DG, DG, DG, BK, __, __, YL, YL),
    r( 7, 3, BK, DG, DG, DG, BK, __, __, BK, YL),
    r( 9, 1, AM),
    r( 8, 4, BK, NR, NR, NR, BK),
    r( 4, 5, BK, BK, DU, DU, DU, DU, DU, BK),
    r( 3, 6, BK, DU, DU, DU, DU, DU, DU, DU, BK),
    r( 3, 7, BK, DU, DU, DU, DU, DU, DU, BK),
    r( 4, 8, BK, DU, DU, DU, DU, DU, BK),
    r( 5, 9, BK, DU, DU, BK),
    r( 5, 10, __, BK, __, __, BK),
    r( 4, 11, BK, YL, YL, __, BK, YL, YL, BK),
    r( 2, wy + 0, __, __, BK, BK, BK, BK, BK, BK),
    r( 2, wy + 1, __, BK, TQ, TQ, TQ, TQ, TQ, BK),
    r( 3, wy + 2, BK, TQ, TQ, TQ, TQ, TQ, BK),
    r( 4, wy + 3, BK, BK, BK, BK, BK),
  ]
}

export type DogState = 'sniff' | 'hold' | 'laugh'

interface NesDogProps {
  state: DogState
  scale?: number
  className?: string
  style?: React.CSSProperties
}

export function NesDog({ state, scale = 3, className, style }: NesDogProps) {
  const { w, h } = DOG_NATIVE[state]
  const W = w * scale
  const H = h * scale
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className={className}
      style={{ imageRendering: 'pixelated', display: 'block', ...style }}
      aria-hidden
    >
      {renderRows(dogRows(state), scale)}
    </svg>
  )
}

interface NesDuckProps {
  facing: 'left' | 'right'
  wingFrame: 0 | 1 | 2
  scale?: number
  className?: string
  style?: React.CSSProperties
}

export function NesDuck({ facing, wingFrame, scale = 3, className, style }: NesDuckProps) {
  const W = 16 * scale
  const H = 14 * scale
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className={className}
      style={{
        imageRendering: 'pixelated',
        display: 'block',
        transform: facing === 'left' ? 'scaleX(-1)' : undefined,
        ...style,
      }}
      aria-hidden
    >
      {renderRows(duckRows(wingFrame), scale)}
    </svg>
  )
}

export function NesClay({ angle }: { angle: number }) {
  const scale = 3
  const disc: Row[] = [
    r( 3, 0, __, BK, BK, BK, BK, BK, BK, BK, BK),
    r( 1, 1, BK, BK, '#D84010', '#D84010', '#D84010', '#D84010', '#D84010', '#D84010', '#D84010', BK, BK),
    r( 0, 2, BK, '#D84010', '#F86030', '#F86030', '#FCA870', '#FCA870', '#F86030', '#F86030', '#D84010', BK),
    r( 0, 3, BK, '#D84010', '#F86030', '#F86030', '#FCA870', '#FCA870', '#F86030', '#F86030', '#D84010', BK),
    r( 1, 4, BK, BK, '#D84010', '#D84010', '#D84010', '#D84010', '#D84010', '#D84010', BK, BK),
    r( 3, 5, __, BK, BK, BK, BK, BK, BK, BK, BK),
  ]
  const W = 12 * scale
  const H = 6 * scale
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      aria-hidden
      style={{
        imageRendering: 'pixelated',
        display: 'block',
        transform: `rotate(${angle}deg)`,
      }}
    >
      {renderRows(disc, scale)}
    </svg>
  )
}
