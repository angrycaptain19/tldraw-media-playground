// ─── DuckHuntGame Component ──────────────────────────────────────────────────
// Full Duck Hunt implementation with correct classic gameplay rules:
//   • 3 game modes: Game A (1 duck at a time), Game B (2 ducks at a time),
//     Game C (clay pigeons — 2 fast discs at a time)
//   • 10 birds per round; ducks appear one / two at a time in sequence
//   • 3 shots per individual duck (NOT a shared round pool)
//   • Miss all 3 on a duck → dog laughs, duck flies away; next duck spawns
//   • Pass condition: hit required minimum ducks per round; fail → game over
//   • Duck speed increases each round; direction changes at fixed engine ticks
//   • 3-frame wing-flap animation loop
//   • HUD: Score, Hi-Score, Round, Shots (3 bullets, reset per duck), Hit/10
//   • Visual shot feedback: muzzle-flash, hit explosion, miss ripple
//   • Hand-tracking support: index tip → crosshair, Closed_Fist (dwell) → fire

import { useCallback, useEffect, useRef, useState } from 'react'
import HandRecognitionPanel from './HandRecognitionPanel'
import type { HandData } from '../hooks/useHandRecognition'
import { GESTURE_FIST, GESTURE_NONE } from '../hooks/useHandRecognition'
import { NesDog } from './NesSprites'
import './DuckHuntGame.css'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Duck {
  id: number
  x: number        // px from left of sky
  y: number        // px from top of sky
  vx: number       // velocity x px/frame
  vy: number       // velocity y px/frame
  alive: boolean
  hit: boolean     // tumbling after being shot
  escaped: boolean // flew away without being hit
  visible: boolean
  wingFrame: number  // 0 | 1 | 2  (3-frame flap loop)
  dirTimer: number   // ticks until next direction change
}

type GameMode  = 'A' | 'B' | 'C'   // A=1 duck, B=2 ducks, C=clay pigeons
type GamePhase =
  | 'modeSelect'
  | 'playing'
  | 'birdResult'  // brief pause between birds (dog laugh or success)
  | 'roundOver'   // round passed — transition to next
  | 'roundFail'   // round failed — game over
  | 'gameOver'

// ── Shot-effect types ──────────────────────────────────────────────────────────

type ShotKind = 'hit' | 'miss'

interface ShotEffect {
  id: number
  x: number
  y: number
  kind: ShotKind
}

let shotEffectIdCounter = 0

// ── Constants ─────────────────────────────────────────────────────────────────

const BIRDS_PER_ROUND  = 10           // total birds each round
const SHOTS_PER_BIRD   = 3            // shots per individual duck / pair
const DUCK_SIZE        = 48           // px — NES pixel sprite (16 px × 3 scale)
const DUCK_SPEED_BASE  = 2.0          // px/frame at round 1
const DUCK_SPEED_INC   = 0.35         // extra px/frame per round
const POINTS_PER_DUCK  = 1000         // base score (+ round bonus)
const BIRD_RESULT_MS   = 2000         // ms — dog laugh or hit flash
const ROUND_OVER_MS    = 2200         // ms — round-clear banner
const ROUND_FAIL_MS    = 2500         // ms — fail banner → game over
const DIR_CHANGE_TICKS = 150          // frames between direction flips — longer pass = more screen coverage
const WING_ANIM_TICKS  = 8            // frames per wing-flap frame
const MIN_DUCKS_PASS   = 6            // ducks you must hit to pass a round

// Per-mode simultaneous ducks
const DUCKS_IN_FLIGHT: Record<GameMode, number> = { A: 1, B: 2, C: 2 }

// Hand-tracking fire dwell
const FIRE_DWELL_FRAMES = 8  // ~130 ms at 60 fps

// ── Duck factory ─────────────────────────────────────────────────────────────

let duckIdCounter = 0

/** Classic zigzag duck — enters from bottom, flies upward */
function makeDuck(skyW: number, skyH: number, round: number): Duck {
  const speed    = DUCK_SPEED_BASE + (round - 1) * DUCK_SPEED_INC
  const fromLeft = Math.random() < 0.5
  // Spawn anywhere across the full width (5–95%) so birds traverse the whole screen
  const x        = skyW * (0.05 + Math.random() * 0.90)
  const y        = skyH + DUCK_SIZE           // start just below visible area
  // Wider horizontal speed so a single pass covers 60–100% of screen width
  const vx  = (fromLeft ? 1 : -1) * speed * (1.0 + Math.random() * 0.6)
  const vy  = -(speed * (0.8 + Math.random() * 0.4))  // upward

  return {
    id: ++duckIdCounter,
    x, y, vx, vy,
    alive: true, hit: false, escaped: false, visible: true,
    wingFrame: 0,
    dirTimer: DIR_CHANGE_TICKS,
  }
}

/** Clay pigeon — disc launched from a corner, fast arc */
function makeClay(skyW: number, skyH: number, round: number, index: number): Duck {
  const speed    = (DUCK_SPEED_BASE + (round - 1) * DUCK_SPEED_INC) * 1.4
  const fromLeft = index % 2 === 0
  const x        = fromLeft ? 0 : skyW
  const y        = skyH * 0.85
  const vx       = fromLeft ? speed * 1.2 : -speed * 1.2
  const vy       = -(speed * 1.6)   // steep upward arc

  return {
    id: ++duckIdCounter,
    x, y, vx, vy,
    alive: true, hit: false, escaped: false, visible: true,
    wingFrame: 0,
    dirTimer: 9999,  // clay pigeons don't zigzag
  }
}

// ── NES-accurate Duck Color Palettes ────────────────────────────────────────
//
//  The original NES Duck Hunt used three distinct mallard color schemes:
//    variant 0 (Game A):  green body, blue-iridescent head, white collar
//    variant 1 (Game B):  brown/tan body, dark-brown head, white collar
//    variant 2 (alt):     black body, black head (dark variant for higher rounds)
//
//  Each variant has 3 wing-flap frames: wing-up / wing-mid / wing-down.
//  A separate "falling" pose (wings spread wide) is used when the duck is hit.
//  All sprites are drawn on a 16×16 NES pixel grid, rendered at 3× scale (48px).
//  shapeRendering="crispEdges" + CSS image-rendering:pixelated gives the blocky
//  pixel-art look faithful to the original hardware output.

type DuckVariant = 0 | 1 | 2  // 0=green, 1=brown, 2=black

interface DuckPalette {
  body:    string  // main body / wing color
  bodyDk:  string  // dark body shading
  head:    string  // head / neck color
  headDk:  string  // dark head shading
  collar:  string  // white collar ring
  bill:    string  // bill/beak color
  feet:    string  // feet/leg color
  eye:     string  // eye white
  eyePup:  string  // pupil
  outline: string  // pixel outline / shadow
}

const DUCK_PALETTES: DuckPalette[] = [
  // 0 — Classic green mallard (Game A)
  {
    body:    '#3CB054',  // NES bright green
    bodyDk:  '#1A6B2A',  // dark green
    head:    '#1C7A8C',  // iridescent teal-blue
    headDk:  '#0E4D5A',  // dark teal
    collar:  '#E8E8E8',  // white collar
    bill:    '#D4A020',  // golden-yellow bill
    feet:    '#D4A020',  // matching feet
    eye:     '#F0F0F0',
    eyePup:  '#101010',
    outline: '#101010',
  },
  // 1 — Brown mallard (Game B second duck)
  {
    body:    '#B87040',  // NES tan-brown
    bodyDk:  '#7A4020',  // dark brown
    head:    '#7A4020',  // chocolate-brown head
    headDk:  '#3C1A00',  // very dark brown
    collar:  '#E8E8D0',  // cream collar
    bill:    '#C8A000',  // amber bill
    feet:    '#C8A000',
    eye:     '#F0F0F0',
    eyePup:  '#101010',
    outline: '#101010',
  },
  // 2 — Dark/black duck (alternate high-round variant)
  {
    body:    '#404858',  // dark slate
    bodyDk:  '#202430',  // near-black
    head:    '#202430',  // dark head
    headDk:  '#101018',
    collar:  '#C8C8D8',  // pale collar
    bill:    '#B09000',  // dark-gold bill
    feet:    '#B09000',
    eye:     '#E8E8E8',
    eyePup:  '#101010',
    outline: '#101010',
  },
]

// ── Pixel helpers ─────────────────────────────────────────────────────────────
// We draw each sprite on a virtual 16×16 grid.  Each "pixel" is one 3×3 rect
// on the final 48×48 SVG (scale=3).

const NES_S = 3  // pixel scale
const NES_W = 16 // NES sprite width
const NES_H = 16 // NES sprite height

/** Render one NES-pixel at grid (col, row) */
function px(col: number, row: number, fill: string, key: string | number) {
  return (
    <rect
      key={key}
      x={col * NES_S}
      y={row * NES_S}
      width={NES_S}
      height={NES_S}
      fill={fill}
    />
  )
}

/** Render a horizontal run of same-color pixels */
function row(r: number, colStart: number, colEnd: number, fill: string, keyPfx: string) {
  const rects = []
  for (let c = colStart; c <= colEnd; c++) {
    rects.push(px(c, r, fill, `${keyPfx}-${r}-${c}`))
  }
  return rects
}

// ── Wing-flap frame pixel data ────────────────────────────────────────────────
//
//  Each frame is described as an array of { r, c1, c2, key } row-spans for the
//  WING area only.  The body and head stay constant across frames.
//
//  NES Duck sprite anatomy (facing right, 16×16 grid):
//
//  Row  0-1  : empty / sky
//  Row  2-5  : HEAD (cols 9-14)
//  Row  6    : COLLAR + NECK junction
//  Row  7-12 : BODY (cols 4-14)
//  Row  7-11 : WING overlay (cols 1-7, position shifts per frame)
//  Row 13-14 : FEET (cols 7-10)
//  Row 15    : empty

// Wing-up: wings raised high (rows 5-9)
const WING_UP = [
  { r: 5,  c1: 2, c2: 8  },
  { r: 6,  c1: 1, c2: 9  },
  { r: 7,  c1: 1, c2: 8  },
  { r: 8,  c1: 2, c2: 7  },
  { r: 9,  c1: 3, c2: 6  },
]

// Wing-mid: wings level with body (rows 7-10)
const WING_MID = [
  { r: 7,  c1: 0, c2: 7  },
  { r: 8,  c1: 0, c2: 8  },
  { r: 9,  c1: 1, c2: 7  },
  { r: 10, c1: 2, c2: 6  },
]

// Wing-down: wings dipped below body (rows 8-12)
const WING_DOWN = [
  { r: 8,  c1: 1, c2: 6  },
  { r: 9,  c1: 0, c2: 7  },
  { r: 10, c1: 0, c2: 8  },
  { r: 11, c1: 1, c2: 7  },
  { r: 12, c1: 2, c2: 5  },
]

const WING_FRAMES = [WING_UP, WING_MID, WING_DOWN]

// ── Falling duck pixel data ───────────────────────────────────────────────────
// Wings spread wide horizontally — matches the NES "duck falling" sprite.
// Shown when the duck is hit; tumbles with CSS rotate animation.
const WING_FALL_LEFT  = [
  { r: 6,  c1: 0, c2: 3  },
  { r: 7,  c1: 0, c2: 4  },
  { r: 8,  c1: 0, c2: 3  },
]
const WING_FALL_RIGHT = [
  { r: 6,  c1: 11, c2: 15 },
  { r: 7,  c1: 10, c2: 15 },
  { r: 8,  c1: 11, c2: 15 },
]

// ── Core NES duck body (same for all frames) ──────────────────────────────────
function DuckBody({ p, flip }: { p: DuckPalette; flip: boolean }) {
  const transform = flip ? `scale(-1,1) translate(-${NES_W * NES_S},0)` : undefined
  return (
    <g transform={transform}>
      {/* OUTLINE: full silhouette border pixels (outline color) */}
      {/* Head outline */}
      {row(2, 9,  13, p.outline, 'hout2')}
      {row(3, 8,  14, p.outline, 'hout3')}
      {row(4, 8,  14, p.outline, 'hout4')}
      {row(5, 9,  14, p.outline, 'hout5')}
      {/* Body outline */}
      {row(6, 4,  15, p.outline, 'bout6')}
      {row(7, 3,  15, p.outline, 'bout7')}
      {row(8, 3,  15, p.outline, 'bout8')}
      {row(9, 3,  15, p.outline, 'bout9')}
      {row(10,3,  15, p.outline, 'bout10')}
      {row(11,3,  15, p.outline, 'bout11')}
      {row(12,4,  15, p.outline, 'bout12')}
      {row(13,6,  12, p.outline, 'bout13')}
      {/* HEAD fill */}
      {row(3, 9,  13, p.head,    'h3')}
      {row(4, 9,  13, p.head,    'h4')}
      {row(5, 10, 13, p.head,    'h5')}
      {/* Head dark shading (right side) */}
      {row(3, 12, 13, p.headDk,  'hdk3')}
      {row(4, 12, 13, p.headDk,  'hdk4')}
      {/* EYE: white sclera + dark pupil side by side (NES style) */}
      {px(10, 3, p.eye,    'eye')}
      {px(11, 3, p.eyePup, 'pup')}
      {/* COLLAR */}
      {row(5, 9, 11, p.collar, 'col')}
      {/* BILL */}
      {row(2, 12, 15, p.bill, 'bill2')}
      {row(3, 13, 15, p.bill, 'bill3')}
      {px(14, 2, p.bill, 'billtip')}
      {/* NECK / collar join */}
      {row(6, 7, 10, p.collar, 'neck6')}
      {/* BODY fill */}
      {row(7,  4, 14, p.body,   'bod7')}
      {row(8,  4, 14, p.body,   'bod8')}
      {row(9,  4, 14, p.body,   'bod9')}
      {row(10, 4, 14, p.body,   'bod10')}
      {row(11, 4, 14, p.body,   'bod11')}
      {row(12, 5, 14, p.body,   'bod12')}
      {/* Body dark shading (bottom / right) */}
      {row(10, 12, 14, p.bodyDk, 'bdk10')}
      {row(11, 10, 14, p.bodyDk, 'bdk11')}
      {row(12, 10, 14, p.bodyDk, 'bdk12')}
      {/* TAIL feather tip */}
      {row(7, 14, 15, p.bodyDk, 'tail7')}
      {row(8, 14, 15, p.bodyDk, 'tail8')}
      {/* FEET */}
      {px(7,  13, p.feet, 'ft1')}
      {px(8,  13, p.feet, 'ft2')}
      {px(9,  13, p.feet, 'ft3')}
      {px(10, 13, p.feet, 'ft4')}
      {px(7,  14, p.feet, 'ft5')}
      {px(10, 14, p.feet, 'ft6')}
    </g>
  )
}

// ── Wing layer ────────────────────────────────────────────────────────────────
function DuckWing({
  p, frameData, flip,
}: {
  p: DuckPalette
  frameData: { r: number; c1: number; c2: number }[]
  flip: boolean
}) {
  const transform = flip ? `scale(-1,1) translate(-${NES_W * NES_S},0)` : undefined
  return (
    <g transform={transform}>
      {frameData.flatMap(({ r, c1, c2 }) =>
        Array.from({ length: c2 - c1 + 1 }, (_, i) => {
          const c = c1 + i
          // Outline pixel on the outermost column
          const fill = (c === c1 || c === c2) ? p.outline : p.body
          return px(c, r, fill, `w-${r}-${c}`)
        })
      )}
      {/* Wing dark shading (bottom row of each wing strip) */}
      {frameData.slice(-1).flatMap(({ r, c1, c2 }) =>
        Array.from({ length: c2 - c1 - 1 }, (_, i) => px(c1 + 1 + i, r, p.bodyDk, `wdk-${r}-${i}`))
      )}
    </g>
  )
}

// ── Full NES duck sprite component ────────────────────────────────────────────
/**
 * NesDuckSprite
 *
 * Renders an NES-accurate 16×16 pixel-art duck at 3× scale (48×48 CSS px).
 * Props:
 *   facing    – 'left' | 'right'  (mirrors the sprite horizontally)
 *   wingFrame – 0 | 1 | 2        (wing-up / wing-mid / wing-down)
 *   variant   – 0 | 1 | 2        (green / brown / black color palette)
 *   falling   – true when the duck has been hit (spread-wing tumble pose)
 */
function NesDuckSprite({
  facing,
  wingFrame,
  variant = 0,
  falling = false,
}: {
  facing:    'left' | 'right'
  wingFrame: 0 | 1 | 2
  variant?:  DuckVariant
  falling?:  boolean
}) {
  const p    = DUCK_PALETTES[variant]
  const flip = facing === 'left'
  const svgW = NES_W * NES_S   // 48
  const svgH = NES_H * NES_S   // 48

  return (
    <svg
      viewBox={`0 0 ${svgW} ${svgH}`}
      width={svgW}
      height={svgH}
      aria-hidden
      style={{ imageRendering: 'pixelated' }}
      shapeRendering="crispEdges"
    >
      {falling ? (
        // Falling pose: body + spread wings, no feet (duck tumbles)
        <>
          <DuckBody p={p} flip={flip} />
          <DuckWing p={p} frameData={WING_FALL_LEFT}  flip={flip} />
          <DuckWing p={p} frameData={WING_FALL_RIGHT} flip={flip} />
        </>
      ) : (
        // Normal flying pose: body + animated wing frame
        <>
          <DuckBody p={p} flip={flip} />
          <DuckWing p={p} frameData={WING_FRAMES[wingFrame]} flip={flip} />
        </>
      )}
    </svg>
  )
}


// ── NES Background Scenery ─────────────────────────────────────────────────
// Renders the classic Duck Hunt layered backdrop:
//   1. Flat NES-palette sky (handled in CSS)
//   2. Three pixel-art clouds at fixed NES positions
//   3. Foreground trees (separate layer, on top of ducks — birds can hide in canopy)
//   4. Hill + house silhouette on the right
//   5. Foreground grass strip (handled in CSS + NesScenery bottom rows)
//   6. Four pixel-art bushes at fixed positions on the ground strip

/** Single NES-style blocky cloud — stacked SVG rects, no border-radius */
function NesCloud({ x, y, scale = 1 }: { x: string; y: string; scale?: number }) {
  const S = 8 * scale  // px per NES "pixel"
  return (
    <svg
      className="dh-nes-cloud"
      style={{ left: x, top: y, position: 'absolute', pointerEvents: 'none', zIndex: 2 }}
      width={S * 10}
      height={S * 5}
      viewBox={`0 0 ${S * 10} ${S * 5}`}
      aria-hidden
      shapeRendering="crispEdges"
    >
      {/* Row 0: top bump (cols 3-6) */}
      <rect x={S * 3} y={0}       width={S * 4}  height={S} fill="#F8F8F8" />
      {/* Row 1 (cols 2-7) */}
      <rect x={S * 2} y={S}       width={S * 6}  height={S} fill="#F8F8F8" />
      {/* Row 2: widest (cols 0-9) */}
      <rect x={0}     y={S * 2}   width={S * 10} height={S} fill="#F8F8F8" />
      {/* Row 3 (cols 1-8) */}
      <rect x={S}     y={S * 3}   width={S * 8}  height={S} fill="#F8F8F8" />
      {/* Row 4: shadow (cols 1-8) */}
      <rect x={S}     y={S * 4}   width={S * 8}  height={S} fill="#C8C8C8" />
    </svg>
  )
}

// ── NES Background Scenery (hill + house, behind ducks) ───────────────────────
// Uses preserveAspectRatio="none" so the SVG always fills the sky container.
// viewBox is 256x144 (16:9). All scenery is anchored to y=144 (the "ground").

/** NES background layer: hill silhouette + house — drawn behind birds */
function NesBackground() {
  const HILL     = '#00A800'  // hill green
  const HILL_DK  = '#006800'  // darker hill edge
  const HOUSE_WL = '#D8B070'  // house wall (tan/cream)
  const HOUSE_RF = '#A83000'  // house roof (dark red)
  const HOUSE_WN = '#5C94FC'  // window (NES sky-blue)

  // Hill occupies the right ~40% of screen.
  // Stepped rise from x=150 up to x=220, then flat to x=256.
  // All rects extend to y=144 so there is no floating gap.
  return (
    <svg
      className="dh-nes-scenery"
      width="100%"
      height="100%"
      viewBox="0 0 256 144"
      preserveAspectRatio="none"
      aria-hidden
      shapeRendering="crispEdges"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}
    >
      {/* ── Hill — gentle stepped rise anchored to ground (y=144) ── */}
      <rect x={150} y={128} width={106} height={16} fill={HILL} />
      <rect x={162} y={120} width={94}  height={8}  fill={HILL} />
      <rect x={176} y={112} width={80}  height={8}  fill={HILL} />
      <rect x={192} y={104} width={64}  height={8}  fill={HILL} />
      <rect x={208} y={96}  width={48}  height={8}  fill={HILL} />
      <rect x={220} y={88}  width={36}  height={56} fill={HILL} />
      {/* Dark left-edge pixels for depth */}
      <rect x={150} y={128} width={4}   height={16} fill={HILL_DK} />
      <rect x={162} y={120} width={4}   height={8}  fill={HILL_DK} />
      <rect x={176} y={112} width={4}   height={8}  fill={HILL_DK} />
      <rect x={192} y={104} width={4}   height={8}  fill={HILL_DK} />
      <rect x={208} y={96}  width={4}   height={8}  fill={HILL_DK} />
      <rect x={220} y={88}  width={4}   height={8}  fill={HILL_DK} />

      {/* ── House on hill ── */}
      <rect x={224} y={64}  width={28} height={28} fill={HOUSE_WL} />
      {/* Roof (stepped pyramid) */}
      <rect x={222} y={56}  width={32} height={8}  fill={HOUSE_RF} />
      <rect x={226} y={48}  width={24} height={8}  fill={HOUSE_RF} />
      <rect x={230} y={40}  width={16} height={8}  fill={HOUSE_RF} />
      <rect x={234} y={32}  width={8}  height={8}  fill={HOUSE_RF} />
      {/* Windows */}
      <rect x={226} y={68}  width={8}  height={8}  fill={HOUSE_WN} />
      <rect x={240} y={68}  width={8}  height={8}  fill={HOUSE_WN} />
      {/* Door */}
      <rect x={234} y={76}  width={8}  height={16} fill={HOUSE_RF} />
    </svg>
  )
}

// ── NES Foreground Trees (rendered in front of ducks) ─────────────────────────
// Higher z-index than ducks so birds can partially hide in the canopy.
// Trunks extend all the way to y=144 (the ground) — no floating.

/** NES foreground trees — drawn on top of ducks so birds can hide in them */
function NesForegroundTrees() {
  const TREE_DK  = '#006800'  // dark outline / trunk
  const TREE_LT  = '#00A800'  // lighter canopy fill

  return (
    <svg
      className="dh-nes-scenery dh-nes-foreground-trees"
      width="100%"
      height="100%"
      viewBox="0 0 256 144"
      preserveAspectRatio="none"
      aria-hidden
      shapeRendering="crispEdges"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 8 }}
    >
      {/* ── Tree A — tall, ~x=32, firmly grounded ── */}
      {/* Trunk to ground */}
      <rect x={28}  y={108} width={8}  height={36} fill={TREE_DK} />
      {/* Canopy tiers (wide at bottom, narrowing upward) */}
      <rect x={10}  y={100} width={44} height={8}  fill={TREE_DK} />
      <rect x={12}  y={100} width={40} height={8}  fill={TREE_LT} />
      <rect x={12}  y={92}  width={40} height={8}  fill={TREE_DK} />
      <rect x={14}  y={92}  width={36} height={8}  fill={TREE_LT} />
      <rect x={14}  y={84}  width={36} height={8}  fill={TREE_DK} />
      <rect x={16}  y={84}  width={32} height={8}  fill={TREE_LT} />
      <rect x={16}  y={76}  width={32} height={8}  fill={TREE_DK} />
      <rect x={18}  y={76}  width={28} height={8}  fill={TREE_LT} />
      <rect x={20}  y={68}  width={24} height={8}  fill={TREE_DK} />
      <rect x={22}  y={68}  width={20} height={8}  fill={TREE_LT} />
      <rect x={24}  y={60}  width={16} height={8}  fill={TREE_DK} />
      <rect x={26}  y={60}  width={12} height={8}  fill={TREE_LT} />
      {/* Top knob */}
      <rect x={28}  y={52}  width={8}  height={8}  fill={TREE_LT} />

      {/* ── Tree B — medium, ~x=96, firmly grounded ── */}
      {/* Trunk */}
      <rect x={92}  y={112} width={8}  height={32} fill={TREE_DK} />
      {/* Canopy tiers */}
      <rect x={76}  y={104} width={40} height={8}  fill={TREE_DK} />
      <rect x={78}  y={104} width={36} height={8}  fill={TREE_LT} />
      <rect x={78}  y={96}  width={36} height={8}  fill={TREE_DK} />
      <rect x={80}  y={96}  width={32} height={8}  fill={TREE_LT} />
      <rect x={80}  y={88}  width={32} height={8}  fill={TREE_DK} />
      <rect x={82}  y={88}  width={28} height={8}  fill={TREE_LT} />
      <rect x={84}  y={80}  width={24} height={8}  fill={TREE_DK} />
      <rect x={86}  y={80}  width={20} height={8}  fill={TREE_LT} />
      <rect x={88}  y={72}  width={16} height={8}  fill={TREE_DK} />
      <rect x={90}  y={72}  width={12} height={8}  fill={TREE_LT} />
      {/* Top knob */}
      <rect x={92}  y={64}  width={8}  height={8}  fill={TREE_LT} />
    </svg>
  )
}

/** NES pixel-art bush — stacked SVG rects in two green tones */
function NesBush({ style }: { style?: React.CSSProperties }) {
  const G1 = '#00A800'  // bright green (top)
  const G2 = '#006800'  // dark green (bottom / shadow)
  const S  = 6          // px per pixel
  return (
    <svg
      className="dh-nes-bush"
      style={style}
      width={S * 12}
      height={S * 7}
      viewBox={`0 0 ${S * 12} ${S * 7}`}
      aria-hidden
      shapeRendering="crispEdges"
    >
      {/* Row 0: top knob */}
      <rect x={S * 4}  y={0}      width={S * 4}  height={S} fill={G1} />
      {/* Row 1 */}
      <rect x={S * 2}  y={S}      width={S * 8}  height={S} fill={G1} />
      {/* Row 2 */}
      <rect x={S}      y={S * 2}  width={S * 10} height={S} fill={G1} />
      {/* Row 3 — widest */}
      <rect x={0}      y={S * 3}  width={S * 12} height={S} fill={G1} />
      {/* Row 4 — shadow starts */}
      <rect x={0}      y={S * 4}  width={S * 12} height={S} fill={G2} />
      {/* Row 5 */}
      <rect x={S}      y={S * 5}  width={S * 10} height={S} fill={G2} />
      {/* Row 6 — base */}
      <rect x={S * 2}  y={S * 6}  width={S * 8}  height={S} fill={G2} />
    </svg>
  )
}

// ── Mode Select Screen ────────────────────────────────────────────────────────

function ModeSelectScreen({ onSelect }: { onSelect: (mode: GameMode) => void }) {
  return (
    <div className="dh-mode-select">
      <div className="dh-mode-select__box">
        {/* Pixel-art duck instead of emoji */}
        <div className="dh-mode-select__duck">
          <NesDuckSprite facing="right" wingFrame={1} variant={0} />
        </div>
        <div className="dh-mode-select__title">DUCK HUNT</div>
        <div className="dh-mode-select__subtitle">Select Game Mode</div>
        <div className="dh-mode-select__buttons">
          <button className="dh-mode-select__btn dh-mode-select__btn--1p" onClick={() => onSelect('A')}>
            <span className="dh-mode-select__btn-icon dh-mode-select__btn-icon--pixel">
              <NesDuckSprite facing="right" wingFrame={0} variant={0} />
            </span>
            <span className="dh-mode-select__btn-label">GAME A</span>
            <span className="dh-mode-select__btn-desc">1 duck · 3 shots per duck · 10 ducks/round</span>
          </button>
          <button className="dh-mode-select__btn dh-mode-select__btn--2p" onClick={() => onSelect('B')}>
            <span className="dh-mode-select__btn-icon dh-mode-select__btn-icon--pixel">
              <NesDuckSprite facing="right" wingFrame={0} variant={0} />
              <NesDuckSprite facing="left"  wingFrame={0} variant={1} />
            </span>
            <span className="dh-mode-select__btn-label">GAME B</span>
            <span className="dh-mode-select__btn-desc">2 ducks · 3 shots each · 10 ducks/round</span>
          </button>
          <button className="dh-mode-select__btn dh-mode-select__btn--clay" onClick={() => onSelect('C')}>
            <span className="dh-mode-select__btn-icon">🥏🥏</span>
            <span className="dh-mode-select__btn-label">GAME C</span>
            <span className="dh-mode-select__btn-desc">Clay pigeons · Fast discs · 10 pairs/round</span>
          </button>
        </div>
      </div>
    </div>
  )
}

/** Spinning clay pigeon disc */
function ClaySvg({ angle }: { angle: number }) {
  return (
    <svg viewBox="0 0 52 52" width={DUCK_SIZE} height={DUCK_SIZE} aria-hidden
      style={{ transform: `rotate(${angle}deg)` }}>
      <ellipse cx="26" cy="26" rx="20" ry="9" fill="#f97316" />
      <ellipse cx="26" cy="26" rx="16" ry="5" fill="#fb923c" />
      <ellipse cx="26" cy="26" rx="7"  ry="3" fill="#fdba74" />
    </svg>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DuckHuntGame() {
  // ── Settings ────────────────────────────────────────────────────────────────
  const [gameMode, setGameMode] = useState<GameMode>('A')

  // ── Game state ─────────────────────────────────────────────────────────────
  const [phase, setPhase]           = useState<GamePhase>('modeSelect')
  const [round, setRound]           = useState(1)
  const [score, setScore]           = useState(0)
  const [hiScore, setHiScore]       = useState(9900)
  const [shotsLeft, setShotsLeft]   = useState(SHOTS_PER_BIRD)
  const [birdsHit, setBirdsHit]     = useState(0)    // ducks hit this round
  const [birdsTotal, setBirdsTotal] = useState(0)    // birds released so far this round
  const [paused, setPaused]         = useState(false)
  const [ducks, setDucks]           = useState<Duck[]>([])
  const [crosshair, setCrosshair]   = useState<{ x: number; y: number } | null>(null)
  const [handMode, setHandMode]     = useState(false)
  const [shotEffects, setShotEffects] = useState<ShotEffect[]>([])
  const [firing, setFiring]           = useState(false)
  const firingTimerRef                = useRef<ReturnType<typeof setTimeout> | null>(null)

  // birdResult sub-state
  const [lastBirdHit, setLastBirdHit] = useState(false)
  const [dogVisible, setDogVisible]   = useState(false)
  const [clayAngle, setClayAngle]     = useState(0)

  // ── Refs (rAF loop) ────────────────────────────────────────────────────────
  const skyRef           = useRef<HTMLDivElement>(null)
  const phaseRef         = useRef<GamePhase>('modeSelect')
  const pausedRef        = useRef(false)
  const roundRef         = useRef(1)
  const scoreRef         = useRef(0)
  const hiScoreRef       = useRef(9900)
  const shotsRef         = useRef(SHOTS_PER_BIRD)
  const birdsHitRef      = useRef(0)
  const birdsTotalRef    = useRef(0)
  const ducksRef         = useRef<Duck[]>([])
  const rafRef           = useRef<number | null>(null)
  const gameModeRef      = useRef<GameMode>('A')
  const tickCountRef     = useRef(0)

  // Hand tracking refs
  const fireDwellRef  = useRef(0)
  const lastFireRef   = useRef(0)
  const handModeRef   = useRef(false)

  // Keep refs in sync with state
  useEffect(() => { phaseRef.current      = phase      }, [phase])
  useEffect(() => { pausedRef.current     = paused     }, [paused])
  useEffect(() => { roundRef.current      = round      }, [round])
  useEffect(() => { scoreRef.current      = score      }, [score])
  useEffect(() => { hiScoreRef.current    = hiScore    }, [hiScore])
  useEffect(() => { shotsRef.current      = shotsLeft  }, [shotsLeft])
  useEffect(() => { birdsHitRef.current   = birdsHit   }, [birdsHit])
  useEffect(() => { birdsTotalRef.current = birdsTotal }, [birdsTotal])
  useEffect(() => { ducksRef.current      = ducks      }, [ducks])
  useEffect(() => { gameModeRef.current   = gameMode   }, [gameMode])
  useEffect(() => { handModeRef.current   = handMode   }, [handMode])

  // ── Spawn a wave ────────────────────────────────────────────────────────────

  const spawnWave = useCallback((skyW: number, skyH: number, r: number, mode: GameMode) => {
    const count    = DUCKS_IN_FLIGHT[mode]
    const newDucks = Array.from({ length: count }, (_, i) =>
      mode === 'C' ? makeClay(skyW, skyH, r, i) : makeDuck(skyW, skyH, r)
    )
    setDucks(newDucks)
    ducksRef.current = newDucks
  }, [])

  const resetShotsForBird = useCallback(() => {
    setShotsLeft(SHOTS_PER_BIRD)
    shotsRef.current = SHOTS_PER_BIRD
  }, [])

  // ── Advance to next wave after birdResult ──────────────────────────────────

  const advanceToNextWave = useCallback(() => {
    const alreadyReleased = birdsTotalRef.current
    if (alreadyReleased >= BIRDS_PER_ROUND) {
      // End of round
      if (birdsHitRef.current >= MIN_DUCKS_PASS) {
        setPhase('roundOver')
        phaseRef.current = 'roundOver'
      } else {
        setPhase('roundFail')
        phaseRef.current = 'roundFail'
      }
      return
    }
    // Spawn next wave
    resetShotsForBird()
    const sky = skyRef.current
    const W   = sky ? sky.clientWidth  : 800
    const H   = sky ? sky.clientHeight : 500
    spawnWave(W, H, roundRef.current, gameModeRef.current)
    setPhase('playing')
    phaseRef.current = 'playing'
  }, [resetShotsForBird, spawnWave])

  // ── Finish a wave (either hit or missed) ───────────────────────────────────

  const handleWaveDone = useCallback((anyHit: boolean) => {
    if (phaseRef.current !== 'playing') return
    setPhase('birdResult')
    phaseRef.current = 'birdResult'
    setLastBirdHit(anyHit)
    setDogVisible(!anyHit)
  }, [])

  // ── Fire (shoot) ───────────────────────────────────────────────────────────

  const fire = useCallback((px: number, py: number) => {
    if (phaseRef.current !== 'playing') return
    if (pausedRef.current) return
    if (shotsRef.current <= 0) return

    const now = performance.now()
    if (now - lastFireRef.current < 300) return
    lastFireRef.current = now

    const newShots = shotsRef.current - 1
    setShotsLeft(newShots)
    shotsRef.current = newShots

    // Muzzle flash
    setFiring(true)
    if (firingTimerRef.current) clearTimeout(firingTimerRef.current)
    firingTimerRef.current = setTimeout(() => setFiring(false), 180)

    const hitIdx = ducksRef.current.findIndex(d => {
      if (!d.alive || d.hit) return false
      const r = DUCK_SIZE / 2 + 10
      return Math.abs(d.x - px) < r && Math.abs(d.y - py) < r
    })

    if (hitIdx >= 0) {
      // Hit!
      const updated = ducksRef.current.map((d, i) =>
        i === hitIdx ? { ...d, alive: false, hit: true, vy: -3 } : d
      )
      setDucks(updated)
      ducksRef.current = updated

      const hitEffect: ShotEffect = { id: ++shotEffectIdCounter, x: px, y: py, kind: 'hit' }
      setShotEffects(prev => [...prev, hitEffect])
      setTimeout(() => setShotEffects(prev => prev.filter(e => e.id !== hitEffect.id)), 700)

      const roundBonus = roundRef.current * 100
      const newScore   = scoreRef.current + POINTS_PER_DUCK + roundBonus
      setScore(newScore)
      scoreRef.current = newScore

      const newHit = birdsHitRef.current + 1
      setBirdsHit(newHit)
      birdsHitRef.current = newHit

      if (newScore > hiScoreRef.current) {
        setHiScore(newScore)
        hiScoreRef.current = newScore
      }

      // Check if all ducks in this wave are resolved
      const allResolved = updated.every(d => d.hit || d.escaped || !d.alive)
      if (allResolved) {
        setTimeout(() => handleWaveDone(true), 800)
      }
      return
    }

    // Miss ripple
    const missEffect: ShotEffect = { id: ++shotEffectIdCounter, x: px, y: py, kind: 'miss' }
    setShotEffects(prev => [...prev, missEffect])
    setTimeout(() => setShotEffects(prev => prev.filter(e => e.id !== missEffect.id)), 500)

    // Out of shots → mark remaining ducks as escaped and trigger birdResult
    if (newShots <= 0) {
      const anyAlive = ducksRef.current.some(d => d.alive && !d.hit)
      if (anyAlive) {
        const escaped = ducksRef.current.map(d =>
          d.alive && !d.hit ? { ...d, escaped: true } : d
        )
        setDucks(escaped)
        ducksRef.current = escaped
        setTimeout(() => handleWaveDone(false), 400)
      }
    }
  }, [handleWaveDone])

  // ── rAF animation loop ─────────────────────────────────────────────────────

  const tick = useCallback(() => {
    if (!pausedRef.current && phaseRef.current === 'playing') {
      tickCountRef.current += 1
      const sky = skyRef.current
      if (sky) {
        const W = sky.clientWidth
        const H = sky.clientHeight

        setDucks(prev => {
          const next = prev.map(d => {
            if (!d.visible) return d

            // Tumbling duck falls straight down
            if (d.hit) {
              const ny  = d.y + (d.vy + 2)
              const nvy = d.vy + 0.5   // gravity
              return { ...d, y: ny, vy: nvy, visible: ny < H + DUCK_SIZE * 2 }
            }

            // Escaped duck flies off screen quickly
            if (d.escaped) {
              const nx = d.x + d.vx * 2
              const ny = d.y - 5
              const vis = ny > -DUCK_SIZE * 4 && nx > -DUCK_SIZE * 4 && nx < W + DUCK_SIZE * 4
              return { ...d, x: nx, y: ny, visible: vis }
            }

            if (!d.alive) return d

            // 3-frame wing-flap
            const wingFrame = Math.floor(tickCountRef.current / WING_ANIM_TICKS) % 3

            // Direction change at fixed engine ticks (zigzag)
            let { vx, vy, dirTimer } = d
            dirTimer -= 1
            if (dirTimer <= 0) {
              dirTimer = DIR_CHANGE_TICKS
              vx = -vx               // horizontal flip
              if (vy > 0) vy = -Math.abs(vy) * 0.5  // keep flying up
            }

            let nx = d.x + vx
            let ny = d.y + vy

            vy += 0.05   // gentle gravity arc

            // Bounce off sky ceiling
            if (ny < DUCK_SIZE) {
              ny = DUCK_SIZE
              vy = Math.abs(vy) * 0.6
            }
            // Keep in upper 75% of sky
            if (ny > H * 0.75) {
              ny = H * 0.75
              vy = -Math.abs(vy)
            }

            // Bounce off left and right walls so ducks traverse the full screen width
            if (nx < 0) {
              nx = 0
              vx = Math.abs(vx)
            } else if (nx > W - DUCK_SIZE) {
              nx = W - DUCK_SIZE
              vx = -Math.abs(vx)
            }

            const visible = nx > -DUCK_SIZE * 4 && nx < W + DUCK_SIZE * 4 && ny > -DUCK_SIZE * 4

            return { ...d, x: nx, y: ny, vx, vy, dirTimer, visible, wingFrame }
          })

          // Detect ducks that flew off screen
          const anyFlownOff = next.some(d => d.alive && !d.hit && !d.escaped && !d.visible)
          if (anyFlownOff && phaseRef.current === 'playing') {
            const withEscaped = next.map(d =>
              d.alive && !d.hit && !d.escaped && !d.visible ? { ...d, escaped: true } : d
            )
            const allResolved = withEscaped.every(d => d.hit || d.escaped || !d.alive)
            if (allResolved) {
              setTimeout(() => handleWaveDone(false), 100)
            }
            ducksRef.current = withEscaped
            return withEscaped
          }

          ducksRef.current = next
          return next
        })

        // Clay pigeon spin
        setClayAngle(a => a + 8)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [handleWaveDone])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
  }, [tick])

  // ── Game control ───────────────────────────────────────────────────────────

  const startRound = useCallback((r: number, mode: GameMode) => {
    setBirdsHit(0)
    birdsHitRef.current = 0
    const firstWave = DUCKS_IN_FLIGHT[mode]
    setBirdsTotal(firstWave)
    birdsTotalRef.current = firstWave
    resetShotsForBird()
    setDogVisible(false)
    setPhase('playing')
    phaseRef.current = 'playing'
    setPaused(false)
    pausedRef.current = false
    tickCountRef.current = 0

    const sky = skyRef.current
    const W = sky ? sky.clientWidth  : 800
    const H = sky ? sky.clientHeight : 500
    spawnWave(W, H, r, mode)
  }, [resetShotsForBird, spawnWave])

  const startGame = useCallback((mode: GameMode) => {
    setGameMode(mode)
    gameModeRef.current = mode
    setRound(1)
    roundRef.current = 1
    setScore(0)
    scoreRef.current = 0
    startRound(1, mode)
  }, [startRound])

  const goToNextRound = useCallback(() => {
    const r = roundRef.current + 1
    setRound(r)
    roundRef.current = r
    startRound(r, gameModeRef.current)
  }, [startRound])

  // Phase transition effects
  useEffect(() => {
    if (phase === 'birdResult') {
      const t = setTimeout(() => {
        setDogVisible(false)
        // Increment birds-released counter, then advance
        const count    = DUCKS_IN_FLIGHT[gameModeRef.current]
        const newTotal = birdsTotalRef.current + count
        setBirdsTotal(newTotal)
        birdsTotalRef.current = newTotal
        advanceToNextWave()
      }, BIRD_RESULT_MS)
      return () => clearTimeout(t)
    }
    if (phase === 'roundOver') {
      const t = setTimeout(goToNextRound, ROUND_OVER_MS)
      return () => clearTimeout(t)
    }
    if (phase === 'roundFail') {
      const t = setTimeout(() => {
        setPhase('gameOver')
        phaseRef.current = 'gameOver'
      }, ROUND_FAIL_MS)
      return () => clearTimeout(t)
    }
  }, [phase, advanceToNextWave, goToNextRound])

  // ── Mouse / touch aiming ───────────────────────────────────────────────────

  const getSkyPos = useCallback((clientX: number, clientY: number) => {
    const sky = skyRef.current
    if (!sky) return null
    const rect = sky.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }, [])

  const handleSkyMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (handMode) return
    setCrosshair(getSkyPos(e.clientX, e.clientY))
  }, [handMode, getSkyPos])

  const handleSkyMouseLeave = useCallback(() => {
    if (handMode) return
    setCrosshair(null)
  }, [handMode])

  const handleSkyClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (handMode) return
    const pos = getSkyPos(e.clientX, e.clientY)
    if (!pos) return
    fire(pos.x, pos.y)
  }, [handMode, getSkyPos, fire])

  const handleSkyTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (handMode) return
    const t = e.touches[0]
    const pos = getSkyPos(t.clientX, t.clientY)
    if (!pos) return
    setCrosshair(pos)
    fire(pos.x, pos.y)
  }, [handMode, getSkyPos, fire])

  // ── Hand tracking ──────────────────────────────────────────────────────────

  const handleHandData = useCallback((data: HandData) => {
    const sky = skyRef.current
    if (!sky || !handModeRef.current) return

    if (data.hands.length === 0) {
      fireDwellRef.current = 0
      return
    }

    const hand       = data.hands[0]
    const { indexTip, gesture } = hand
    const mirroredX  = 1 - indexTip.x
    const rect       = sky.getBoundingClientRect()
    const px         = mirroredX * rect.width
    const py         = indexTip.y * rect.height

    setCrosshair({ x: px, y: py })

    if (gesture === GESTURE_FIST) {
      fireDwellRef.current += 1
    } else if (gesture === GESTURE_NONE) {
      fireDwellRef.current = Math.max(0, fireDwellRef.current - 1)
    } else {
      fireDwellRef.current = 0
    }

    if (fireDwellRef.current >= FIRE_DWELL_FRAMES) {
      fireDwellRef.current = 0
      fire(px, py)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fire])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && phaseRef.current === 'playing') {
        setPaused(p => { pausedRef.current = !p; return !p })
      }
      if ((e.key === ' ' || e.key === 'Enter') && phaseRef.current === 'gameOver') {
        setPhase('modeSelect')
        phaseRef.current = 'modeSelect'
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Derived display values ─────────────────────────────────────────────────

  const waveCount   = DUCKS_IN_FLIGHT[gameMode]
  const currentBird = Math.min(
    Math.ceil(birdsTotal / waveCount),
    BIRDS_PER_ROUND / waveCount,
  )

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="dh-container">

      {/* ── Mode Select ─────────────────────────────────────────── */}
      {phase === 'modeSelect' && (
        <div className="dh-mode-select-overlay">
          <ModeSelectScreen onSelect={startGame} />
        </div>
      )}

      {/* ── Control bar ──────────────────────────────────────────── */}
      <div className="dh-control-bar">
        <span className="dh-control-bar__label">Aim:</span>
        <button
          className={`dh-mode-btn${!handMode ? ' dh-mode-btn--active' : ''}`}
          onClick={() => setHandMode(false)}
        >
          🖱️ Mouse
        </button>
        <button
          className={`dh-mode-btn${handMode ? ' dh-mode-btn--active' : ''}`}
          onClick={() => setHandMode(true)}
        >
          ✋ Hand
        </button>

        {(phase === 'gameOver' || phase === 'modeSelect') && (
          <button
            className="dh-start-btn"
            onClick={() => { setPhase('modeSelect'); phaseRef.current = 'modeSelect' }}
          >
            {phase === 'gameOver' ? '🔄 Play Again' : '🎮 Start Game'}
          </button>
        )}
        {phase === 'playing' && (
          <button
            className={`dh-pause-btn-sm${paused ? ' dh-pause-btn-sm--active' : ''}`}
            onClick={() => setPaused(p => { pausedRef.current = !p; return !p })}
          >
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
        )}

        <span className="dh-control-bar__mode-label">
          GAME {gameMode}
        </span>
      </div>

      {/* ── Hand panel – outside sky so it never blocks gameplay ──── */}
      {handMode && (
        <div className="dh-hand-overlay">
          <HandRecognitionPanel onHandData={handleHandData} autoStart defaultCollapsed={false} />
          <div className="dh-hand-hint">
            <strong>Point</strong> index finger to aim ·{' '}
            <strong>Close fist</strong> to shoot (~0.3 s dwell)
          </div>
        </div>
      )}

      {/* ── Sky / Game Canvas ─────────────────────────────────────── */}
      <div
        ref={skyRef}
        className={`dh-sky${paused ? ' dh-sky--paused' : ''}`}
        onMouseMove={handleSkyMouseMove}
        onMouseLeave={handleSkyMouseLeave}
        onClick={handleSkyClick}
        onTouchStart={handleSkyTouchStart}
      >
        {/* NES pixel-art clouds at classic Duck Hunt positions */}
        <NesCloud x="8%"  y="10%" scale={1.1} />
        <NesCloud x="46%" y="18%" scale={0.9} />
        <NesCloud x="72%" y="7%"  scale={1.0} />

        {/* NES background: hill + house, behind ducks */}
        <NesBackground />

        {/* NES foreground trees: on top of ducks so birds can hide in canopy */}
        <NesForegroundTrees />

        {/* Pause overlay */}
        {paused && phase === 'playing' && (
          <div className="dh-overlay">
            <div className="dh-overlay__box">
              <div className="dh-overlay__title">⏸ PAUSED</div>
              <div className="dh-overlay__sub">Press P or click Resume</div>
            </div>
          </div>
        )}

        {/* Game Over */}
        {phase === 'gameOver' && (
          <div className="dh-overlay">
            <div className="dh-overlay__box dh-overlay__box--gameover">
              <div className="dh-overlay__title dh-overlay__title--gameover">GAME OVER</div>
              <div className="dh-gameover-dog"><NesDog state="laugh" scale={4} /></div>
              <div className="dh-overlay__sub">
                Score: {score}
                {score >= hiScore && score > 0 ? ' 🏆 NEW HI-SCORE!' : ''}
              </div>
              <button
                className="dh-btn dh-btn--play-again"
                onClick={() => { setPhase('modeSelect'); phaseRef.current = 'modeSelect' }}
              >
                Play Again
              </button>
            </div>
          </div>
        )}

        {/* Round Failed */}
        {phase === 'roundFail' && (
          <div className="dh-overlay">
            <div className="dh-overlay__box dh-overlay__box--gameover">
              <div className="dh-overlay__title dh-overlay__title--gameover">ROUND FAILED</div>
              <div className="dh-gameover-dog"><NesDog state="laugh" scale={4} /></div>
              <div className="dh-overlay__sub">
                Hit {birdsHit}/{BIRDS_PER_ROUND} — need {MIN_DUCKS_PASS} to pass
              </div>
              <div className="dh-overlay__sub">Score: {score}</div>
            </div>
          </div>
        )}

        {/* Round clear */}
        {phase === 'roundOver' && (
          <div className="dh-round-clear">
            <div className="dh-round-clear__emoji">🎉</div>
            <div className="dh-round-clear__text">Round {round} Clear!</div>
            <div className="dh-round-clear__sub">Hit {birdsHit}/{BIRDS_PER_ROUND} ducks</div>
          </div>
        )}

        {/* Per-bird result (dog laugh or hit confirmation) */}
        {phase === 'birdResult' && (
          <div className={`dh-bird-result${!lastBirdHit ? ' dh-bird-result--miss' : ' dh-bird-result--hit'}`}>
            {!lastBirdHit ? (
              <>
                <div className="dh-missed-dog"><NesDog state="laugh" scale={3} /></div>
                <div className="dh-missed-text">HA HA HA!</div>
              </>
            ) : (
              <div className="dh-hit-text">✓ HIT!</div>
            )}
          </div>
        )}

        {/* Dog rising from grass when duck escapes */}
        {dogVisible && <div className="dh-dog-rising" aria-hidden><NesDog state="sniff" scale={3} /></div>}

        {/* Animated ducks / clay pigeons */}
        {ducks.map(duck => {
          if (!duck.visible) return null
          const facing: 'left' | 'right' = duck.vx >= 0 ? 'right' : 'left'
          return (
            <div
              key={duck.id}
              className={[
                'dh-duck-sprite',
                duck.hit     ? 'dh-duck-sprite--falling' : '',
                duck.escaped ? 'dh-duck-sprite--escaped'  : '',
              ].filter(Boolean).join(' ')}
              style={{ left: duck.x, top: duck.y }}
              aria-hidden
            >
              {gameMode === 'C'
                ? <ClaySvg angle={clayAngle} />
                : <NesDuckSprite
                    facing={facing}
                    wingFrame={duck.wingFrame as 0|1|2}
                    variant={gameMode === 'B' ? (ducks.indexOf(duck) % 2 === 1 ? 1 : 0) as DuckVariant : 0}
                    falling={duck.hit}
                  />
              }
            </div>
          )
        })}

        {/* Crosshair + muzzle flash */}
        {crosshair && phase === 'playing' && !paused && (
          <div
            className={`dh-crosshair${firing ? ' dh-crosshair--firing' : ''}`}
            style={{ left: crosshair.x, top: crosshair.y }}
            aria-hidden
          >
            <svg viewBox="0 0 36 36" width="36" height="36">
              <circle cx="18" cy="18" r="13" fill="none"    stroke="#ef4444" strokeWidth="2.5" />
              <circle cx="18" cy="18" r="2"  fill="#ef4444" />
              <line x1="18" y1="0"  x2="18" y2="9"  stroke="#ef4444" strokeWidth="2.5" />
              <line x1="18" y1="27" x2="18" y2="36" stroke="#ef4444" strokeWidth="2.5" />
              <line x1="0"  y1="18" x2="9"  y2="18" stroke="#ef4444" strokeWidth="2.5" />
              <line x1="27" y1="18" x2="36" y2="18" stroke="#ef4444" strokeWidth="2.5" />
            </svg>
            {firing && <div className="dh-muzzle-flash" aria-hidden />}
          </div>
        )}

        {/* Shot effects (hit explosions + miss ripples) */}
        {shotEffects.map(effect => (
          <div
            key={effect.id}
            className={`dh-shot-effect dh-shot-effect--${effect.kind}`}
            style={{ left: effect.x, top: effect.y }}
            aria-hidden
          />
        ))}

        {/* No shots left notice */}
        {shotsLeft <= 0 && phase === 'playing' && (
          <div className="dh-shot-counter" aria-live="polite">No shots left!</div>
        )}
      </div>

      {/* ── Ground / Grass strip ─────────────────────────────────────── */}
      <div className="dh-ground">
        {/* NES pixel-art bushes at classic fixed positions */}
        <NesBush style={{ position: 'absolute', bottom: '4px', left: '2%',  transform: 'translateX(-50%)' }} />
        <NesBush style={{ position: 'absolute', bottom: '4px', left: '14%', transform: 'translateX(-50%)' }} />
        <NesBush style={{ position: 'absolute', bottom: '4px', left: '75%', transform: 'translateX(-50%)' }} />
        <NesBush style={{ position: 'absolute', bottom: '4px', left: '88%', transform: 'translateX(-50%)' }} />
      </div>

      {/* ── HUD bar ──────────────────────────────────────────────────── */}
      <div className="dh-hud">
        <div className="dh-hud-cell">
          <span className="dh-hud-cell__label">SCORE</span>
          <span className="dh-hud-cell__value">{score.toString().padStart(6, '0')}</span>
        </div>

        <div className="dh-hud-cell">
          <span className="dh-hud-cell__label">HI-SCORE</span>
          <span className="dh-hud-cell__value">{hiScore.toString().padStart(6, '0')}</span>
        </div>

        <div className="dh-hud-cell">
          <span className="dh-hud-cell__label">ROUND</span>
          <span className="dh-hud-cell__value">{round}</span>
        </div>

        {/* 3 shots per duck — resets for each new bird */}
        <div className="dh-hud-cell">
          <span className="dh-hud-cell__label">SHOTS</span>
          <span className="dh-hud-cell__ammo" aria-label={`${shotsLeft} shots left`}>
            {Array.from({ length: SHOTS_PER_BIRD }).map((_, i) => (
              <span
                key={i}
                className={`dh-ammo-bullet${i < shotsLeft ? '' : ' dh-ammo-bullet--spent'}`}
                aria-hidden
              />
            ))}
          </span>
        </div>

        <div className="dh-hud-cell">
          <span className="dh-hud-cell__label">HIT</span>
          <span className="dh-hud-cell__value">{birdsHit}/{BIRDS_PER_ROUND}</span>
        </div>

        <div className="dh-hud-cell">
          <span className="dh-hud-cell__label">BIRD</span>
          <span className="dh-hud-cell__value">
            {currentBird}/{BIRDS_PER_ROUND / waveCount}
          </span>
        </div>
      </div>
    </div>
  )
}
