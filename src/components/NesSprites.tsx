/**
 * NES Duck Hunt — pixel-accurate sprite components
 *
 * The sprites are built from individual 1-pixel (scaled) SVG <rect> elements
 * to faithfully reproduce the Nintendo NES Duck Hunt character art.
 *
 * NES palette colours used (approximate RGB equivalents):
 *   #000000  Black        – outlines, pupils
 *   #FFFFFF  White        – chest, eye white, teeth
 *   #B43020  Dark Red     – dog body (NES $16)
 *   #F06040  Mid Red      – dog body highlight (NES $26)
 *   #180800  Very Dark    – dog ear / shadow
 *   #E88010  Orange-Tan   – nose, inner ear
 *   #606060  Dark Grey    – chest spots
 *   #D8A060  Tan          – leg / underside
 *   #2050B0  Blue         – duck body
 *   #005000  Dark Green   – duck head
 *   #008080  Teal         – duck wing
 *   #E8A000  Yellow       – duck bill, feet
 *   #F0E8D0  Off-White    – duck neck ring
 */

import React from 'react'

// ─── Palette ──────────────────────────────────────────────────────────────────

// Dog colours
const BK = '#000000'  // black
const WH = '#FFFFFF'  // white
const DR = '#B43020'  // dark red-brown (body)
const MR = '#F06040'  // mid red-brown (highlight)
const VD = '#180800'  // very dark (ears)
const OT = '#E88010'  // orange-tan (nose)
const SP = '#484848'  // spot grey
const TN = '#D8A060'  // tan (legs, underside)

// Duck colours
const DB = '#2050B0'  // duck body blue
const DG = '#005000'  // duck head dark green
const TQ = '#008080'  // teal wing
const YL = '#E8A000'  // yellow bill/feet
const NR = '#F0E8D0'  // neck ring off-white

// Transparent
const __ = ''

// ─── Pixel row type ───────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// NES Dog  —  20 × 28 native pixels
//
// Three animation states closely matching the original Nintendo sprite:
//
//   'sniff'  – Dog is partially hidden behind the grass, nose/head visible,
//              body just poking up (used during intro before bird is launched)
//
//   'laugh'  – Dog has risen fully above the grass and is laughing at the player
//              with its head thrown back, arms/paws waving  (miss state)
//
//   'hold'   – Dog holds up the caught duck with both arms raised high
//              (shown briefly after a hit — future use)
// ─────────────────────────────────────────────────────────────────────────────

/*
 * SNIFF state  (nose pointed downward, peering from grass)
 *
 * Row layout (20 cols, 0-indexed):
 *  Cols  0-1 : left ear overhang
 *  Cols  2-11: head
 *  Cols 12-13: right ear hint
 */
const SNIFF_ROWS: Row[] = [
  // Left ear
  r( 0, 0, VD, VD, VD, VD),
  r( 0, 1, BK, VD, VD, VD, VD, BK),
  r( 0, 2, __, BK, VD, VD, BK),

  // Head outline + fill (5 rows tall)
  r( 3, 1, BK, BK, BK, BK, BK, BK, BK, BK),
  r( 3, 2, BK, DR, DR, DR, DR, DR, DR, BK, __, VD, BK),
  r( 2, 3, BK, DR, DR, DR, DR, DR, DR, DR, BK, VD, VD, BK),
  r( 2, 4, BK, DR, MR, DR, DR, WH, DR, DR, BK, VD, VD),
  r( 2, 5, BK, DR, DR, OT, OT, DR, DR, BK, VD, VD),
  r( 3, 6, BK, DR, BK, OT, OT, DR, BK),
  r( 4, 7, BK, BK, BK, BK, BK),

  // Body
  r( 2,  8, BK, BK, DR, DR, DR, DR, DR, DR, BK, BK),
  r( 2,  9, BK, DR, WH, WH, WH, WH, WH, DR, DR, BK),
  r( 2, 10, BK, DR, WH, SP, WH, SP, WH, WH, DR, BK),
  r( 2, 11, BK, DR, WH, WH, WH, WH, WH, DR, BK),
  r( 3, 12, BK, DR, DR, DR, DR, DR, DR, BK),

  // Arms at sides
  r( 1,  9, BK, DR),
  r( 1, 10, BK, DR),
  r(12,  9, DR, BK),
  r(12, 10, DR, BK),

  // Legs (top of legs visible above grass line)
  r( 3, 13, BK, DR, BK, __, BK, DR, BK),
  r( 3, 14, BK, TN, TN, BK, BK, TN, TN, BK),
]

/*
 * LAUGH state  (full body visible, head thrown back, laughing)
 */
const LAUGH_ROWS: Row[] = [
  // Left ear (now floppy outward since head is raised)
  r( 0, 0, __, VD, VD, VD, VD),
  r( 0, 1, BK, VD, VD, VD, VD, VD, BK),
  r( 1, 2, BK, VD, VD, VD, BK),
  r( 2, 3, BK, VD, VD, BK),

  // Head tilted up/back
  r( 4, 1, BK, BK, BK, BK, BK, BK, BK, BK),
  r( 4, 2, BK, DR, DR, DR, DR, DR, DR, BK),
  r( 3, 3, BK, DR, DR, DR, DR, DR, DR, DR, BK, VD, BK),
  r( 3, 4, BK, DR, MR, DR, DR, WH, DR, DR, BK, VD, VD, BK),
  r( 3, 5, BK, DR, DR, OT, OT, DR, DR, BK, VD, VD),
  r( 4, 6, BK, DR, BK, OT, DR, DR, BK),

  // Open mouth — two rows of white teeth visible
  r( 5, 7, BK, WH, WH, WH, BK),
  r( 5, 8, BK, WH, WH, WH, BK),

  // Short neck
  r( 5, 9, BK, DR, DR, DR, BK),

  // Body
  r( 2, 10, BK, BK, DR, DR, DR, DR, DR, DR, BK, BK),
  r( 2, 11, BK, DR, WH, WH, WH, WH, WH, DR, DR, BK),
  r( 2, 12, BK, DR, WH, SP, WH, SP, WH, WH, DR, BK),
  r( 2, 13, BK, DR, WH, WH, WH, WH, WH, DR, BK),
  r( 3, 14, BK, DR, DR, DR, DR, DR, DR, BK),

  // Arms raised (waving / laughing gesture)
  r( 0, 11, BK, DR, DR),
  r( 0, 12, BK, DR),
  r(11, 11, DR, DR, BK),
  r(11, 12, DR, BK),

  // Legs
  r( 3, 15, BK, DR, BK, __, BK, DR, BK),
  r( 3, 16, BK, DR, BK, __, BK, DR, BK),
  r( 3, 17, BK, TN, TN, BK, BK, TN, TN, BK),
]

/*
 * HOLD state  (dog triumphantly holds duck overhead)
 */
const HOLD_ROWS: Row[] = [
  // Left ear
  r( 2, 0, VD, VD, VD, VD),
  r( 1, 1, BK, VD, VD, VD, VD, BK),
  r( 2, 2, BK, VD, VD, BK),

  // Head (neutral, looking slightly up)
  r( 4, 1, BK, BK, BK, BK, BK, BK, BK),
  r( 4, 2, BK, DR, DR, DR, DR, DR, BK),
  r( 3, 3, BK, DR, DR, DR, DR, DR, DR, BK, VD, BK),
  r( 3, 4, BK, DR, MR, DR, DR, WH, DR, BK, VD, VD, BK),
  r( 3, 5, BK, DR, DR, OT, OT, DR, DR, BK, VD, VD),
  r( 4, 6, BK, DR, BK, OT, DR, BK),
  r( 5, 7, BK, BK, BK, BK),

  // Body
  r( 2,  8, BK, BK, DR, DR, DR, DR, DR, DR, BK, BK),
  r( 2,  9, BK, DR, WH, WH, WH, WH, WH, DR, DR, BK),
  r( 2, 10, BK, DR, WH, SP, WH, SP, WH, WH, DR, BK),
  r( 2, 11, BK, DR, WH, WH, WH, WH, WH, DR, BK),
  r( 3, 12, BK, DR, DR, DR, DR, DR, DR, BK),

  // Arms up (holding duck high)
  r( 1,  8, BK, DR),
  r( 1,  9, BK, DR),
  r(12,  8, DR, BK),
  r(12,  9, DR, BK),

  // Legs
  r( 3, 13, BK, DR, BK, __, BK, DR, BK),
  r( 3, 14, BK, TN, TN, BK, BK, TN, TN, BK),
]

function dogRows(state: 'sniff' | 'hold' | 'laugh'): Row[] {
  if (state === 'laugh') return LAUGH_ROWS
  if (state === 'hold')  return HOLD_ROWS
  return SNIFF_ROWS
}

// ─────────────────────────────────────────────────────────────────────────────
// NES Duck  —  16 × 14 native pixels
//
// The classic Duck Hunt duck has:
//  - Dark green head
//  - White/off-white neck ring
//  - Blue body (duck is blue in Game A on the NES)
//  - Teal/dark wing
//  - Orange-yellow bill and feet
//
// wingFrame: 0=up  1=mid  2=down
// facing:    'right' | 'left'  (left = CSS scaleX flip)
// ─────────────────────────────────────────────────────────────────────────────

function duckRows(wingFrame: 0 | 1 | 2): Row[] {
  // Wing Y position: up=3, mid=5, down=7
  const wy = wingFrame === 0 ? 3 : wingFrame === 1 ? 5 : 7

  return [
    // Head
    r( 8, 0, BK, BK, BK, BK, BK),
    r( 8, 1, BK, DG, DG, DG, BK),
    r( 7, 2, BK, DG, DG, DG, DG, BK, __, __, YL, YL),
    r( 7, 3, BK, DG, DG, DG, BK, __, __, BK, YL),
    // Neck ring
    r( 8, 4, BK, NR, NR, NR, BK),
    // Body
    r( 4, 5, BK, BK, DB, DB, DB, DB, DB, BK),
    r( 3, 6, BK, DB, DB, DB, DB, DB, DB, DB, BK),
    r( 3, 7, BK, DB, DB, DB, DB, DB, DB, BK),
    r( 4, 8, BK, DB, DB, DB, DB, DB, BK),
    r( 5, 9, BK, DB, DB, BK),
    // Feet
    r( 5, 10, __, BK, __, __, BK),
    r( 4, 11, BK, YL, YL, __, BK, YL, YL, BK),
    // Wing (3 rows starting at wy)
    r( 2, wy + 0, __, __, BK, BK, BK, BK, BK, BK),
    r( 2, wy + 1, __, BK, TQ, TQ, TQ, TQ, TQ, BK),
    r( 3, wy + 2, BK, TQ, TQ, TQ, TQ, TQ, BK),
    r( 4, wy + 3, BK, BK, BK, BK, BK),
  ]
}

// ─────────────────────────────────────────────────────────────────────────────
// Public React components
// ─────────────────────────────────────────────────────────────────────────────

export type DogState = 'sniff' | 'hold' | 'laugh'

interface NesDogProps {
  state: DogState
  /** pixel scale — 3 gives 60×84 display pixels */
  scale?: number
  className?: string
  style?: React.CSSProperties
}

export function NesDog({ state, scale = 3, className, style }: NesDogProps) {
  const W = 20 * scale
  const H = 28 * scale
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
  /** pixel scale — 3 gives 48×42 display pixels */
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

/** NES-style clay pigeon disc */
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
