// ─── platformerLevels.ts ──────────────────────────────────────────────────────
// 50 levels across 5 worlds for the Pip / Golden Seed platformer.
// Each world has 10 levels; difficulty ramps up per world.
//
// World 1  – Sunny Meadow        (easy, tutorial)
// World 2  – Mushroom Forest     (more vertical, bouncers)
// World 3  – Gloom King's Mines  (tight tunnels, fast enemies)
// World 4  – Corrupted Clouds    (sky platforms, flyers)
// World 5  – Crumbling Tower     (boss, timed collapse)

export const LEVEL_W  = 3200
export const LEVEL_H  = 480
export const GROUND_Y = 400   // y-coordinate of the ground top
export const TOTAL_LEVELS = 50

export const WORLD_NAMES = [
  'Sunny Meadow',
  'Mushroom Forest',
  "Gloom King's Mines",
  'Corrupted Clouds',
  "Gloom King's Tower",
]

export const WORLD_COLORS: Record<number, { sky: string; ground: string }> = {
  0: { sky: '#87CEEB', ground: '#8B5E3C' },
  1: { sky: '#5E8B3C', ground: '#3C5E1F' },
  2: { sky: '#1A1A2E', ground: '#4A3728' },
  3: { sky: '#6A0572', ground: '#1C1C3E' },
  4: { sky: '#2D0000', ground: '#5A1A1A' },
}

export type PlatformKind = 'ground' | 'brick' | 'cloud' | 'pipe' | 'mushroom' | 'mine' | 'cloud-fade' | 'crumble'

export interface LevelPlatform {
  x: number; y: number; w: number; h: number
  kind: PlatformKind
}

export interface LevelCoin {
  x: number; y: number
}

export type EnemyKind = 'walker' | 'bouncer' | 'fast' | 'flyer' | 'boss'

export interface LevelEnemy {
  x: number; y: number
  kind: EnemyKind
  speed: number
}

export interface LevelDef {
  world: number   // 0-indexed
  levelInWorld: number  // 0-indexed within world
  storyTitle: string
  storyText: string
  goalX: number
  platforms: LevelPlatform[]
  coins: LevelCoin[]
  enemies: LevelEnemy[]
}

// ── helpers ───────────────────────────────────────────────────────────────────

function gnd(x: number, w: number): LevelPlatform {
  return { x, y: GROUND_Y, w, h: 80, kind: 'ground' }
}
function brick(x: number, y: number, w = 96, h = 24): LevelPlatform {
  return { x, y, w, h, kind: 'brick' }
}
function cloud(x: number, y: number, w = 128, h = 24): LevelPlatform {
  return { x, y, w, h, kind: 'cloud' }
}
function pipe(x: number, h = 72): LevelPlatform {
  return { x, y: GROUND_Y - h, w: 48, h, kind: 'pipe' }
}
function mushroom(x: number, y: number, w = 128): LevelPlatform {
  return { x, y, w, h: 24, kind: 'mushroom' }
}
function mine(x: number, y: number, w = 96): LevelPlatform {
  return { x, y, w, h: 24, kind: 'mine' }
}
function cloudFade(x: number, y: number, w = 112): LevelPlatform {
  return { x, y, w, h: 24, kind: 'cloud-fade' }
}
function crumble(x: number, y: number, w = 96): LevelPlatform {
  return { x, y, w, h: 24, kind: 'crumble' }
}
function walker(x: number, speed = 1.2): LevelEnemy {
  return { x, y: GROUND_Y - 36, kind: 'walker', speed }
}
function bouncer(x: number, speed = 1.5): LevelEnemy {
  return { x, y: GROUND_Y - 36, kind: 'bouncer', speed }
}
function fast(x: number, speed = 2.5): LevelEnemy {
  return { x, y: GROUND_Y - 36, kind: 'fast', speed }
}
function flyer(x: number, y: number, speed = 1.8): LevelEnemy {
  return { x, y, kind: 'flyer', speed }
}
function boss(x: number): LevelEnemy {
  return { x, y: GROUND_Y - 60, kind: 'boss', speed: 1.0 }
}
function coin(x: number, y: number): LevelCoin { return { x, y } }

// Row of coins
function coinRow(startX: number, y: number, count: number, step = 40): LevelCoin[] {
  return Array.from({ length: count }, (_, i) => coin(startX + i * step, y))
}

// ─────────────────────────────────────────────────────────────────────────────
// WORLD 1 – Sunny Meadow
// ─────────────────────────────────────────────────────────────────────────────

const W1_STORY = [
  { title: 'World 1-1: A New Adventure', text: "Pip steps out of the mushroom farm. The meadow sparkles in morning light. The Golden Seed must be reclaimed!" },
  { title: 'World 1-2: Rolling Hills',   text: 'Gentle hills stretch ahead. Pip hops across mossy stones while Gloomy Grubs block the path.' },
  { title: 'World 1-3: Flower Fields',   text: 'Wildflowers sway in the breeze. But the Gloom King\'s minions trample them underfoot!' },
  { title: 'World 1-4: Sunflower Pass',  text: 'Giant sunflowers form a natural staircase. Pip climbs higher, closer to the forest.' },
  { title: 'World 1-5: Meadow Ruins',    text: 'Old stone walls from a forgotten kingdom. Coins are scattered among the rubble.' },
  { title: 'World 1-6: Breeze Bluffs',   text: 'Gusty cliffs overlook the valley below. One wrong step means a long fall!' },
  { title: 'World 1-7: Sunny Caves',     text: 'Short underground burrows lit by glowing mosses. The first sign of the Mines beyond.' },
  { title: 'World 1-8: Petal Plains',    text: 'The final stretch of the meadow. Enemies grow bolder as Pip nears the forest edge.' },
  { title: 'World 1-9: Meadow Fortress', text: 'A small fort built by the Gloom King\'s scouts. Pip must sneak through!' },
  { title: 'World 1-10: Gateway to the Forest', text: 'The Meadow Gate stands tall. Beyond it, darkness looms. Pip takes a deep breath.' },
]

function makeW1(idx: number): LevelDef {
  const li = idx   // 0-9
  const enemyCount = 2 + li
  const coinCount  = 18 - li

  const platforms: LevelPlatform[] = [
    gnd(0, 600), gnd(700, 400), gnd(1200, 500), gnd(1800, 600), gnd(2500, 700),
    brick(300, 300), brick(500, 250), brick(700, 200), brick(950, 280),
    brick(1100, 230, 128), brick(1400, 260), brick(1600, 200),
    brick(1900, 240), brick(2100, 280), brick(2300, 220),
    cloud(400, 180), cloud(800, 160), cloud(1300, 150),
    cloud(1700, 170), cloud(2200, 140),
    pipe(600), pipe(1050, 56), pipe(1550, 80 + li * 4), pipe(2400, 64),
  ]

  const enemies: LevelEnemy[] = Array.from({ length: enemyCount }, (_, i) =>
    walker(400 + i * Math.floor(2600 / enemyCount), 1.0 + li * 0.1)
  )

  const coins: LevelCoin[] = [
    ...coinRow(200, 270, Math.ceil(coinCount / 3)),
    ...coinRow(900, 250, Math.ceil(coinCount / 3)),
    ...coinRow(1800, 220, Math.ceil(coinCount / 3)),
  ]

  return {
    world: 0,
    levelInWorld: li,
    storyTitle: W1_STORY[li].title,
    storyText:  W1_STORY[li].text,
    goalX: 3050,
    platforms,
    coins,
    enemies,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WORLD 2 – Mushroom Forest
// ─────────────────────────────────────────────────────────────────────────────

const W2_STORY = [
  { title: 'World 2-1: Into the Forest', text: 'Enormous mushrooms tower over Pip. Everything smells of damp soil and magic.' },
  { title: 'World 2-2: Fungal Canopy',   text: 'The mushroom caps form platforms in the sky. But some are rotten and crumble!' },
  { title: 'World 2-3: Spore Storm',     text: 'Glowing spores fill the air. Bouncing Bouncers ricochet off every surface.' },
  { title: 'World 2-4: Tangled Roots',   text: 'Huge roots crisscross the ground, forcing Pip to leap and duck constantly.' },
  { title: 'World 2-5: Mushroom Towers', text: 'Stacked mushroom stems reach the clouds. Careful — the top ones sway!' },
  { title: 'World 2-6: Mycelium Maze',   text: 'Underground mycelium tunnels glow faintly. Bouncers appear from every direction.' },
  { title: 'World 2-7: Glow Grove',      text: 'Bioluminescent fungi light the path. It would be beautiful if it weren\'t so dangerous.' },
  { title: 'World 2-8: Shroomfall',      text: 'The forest tilts downhill. Mushroom caps become ramps Pip slides across.' },
  { title: 'World 2-9: Poisonwood',      text: 'Purple-capped mushrooms release toxic clouds. Stay on the move, Pip!' },
  { title: 'World 2-10: Forest Keep',    text: 'The heart of the forest holds a Gloom King outpost. Break through to reach the Mines!' },
]

function makeW2(idx: number): LevelDef {
  const li = idx
  const platforms: LevelPlatform[] = [
    gnd(0, 500), gnd(600, 300), gnd(1000, 400), gnd(1500, 500), gnd(2300, 600),
    mushroom(250,  320 - li * 5),
    mushroom(450,  260 - li * 4),
    mushroom(700,  200 - li * 3),
    mushroom(950,  280),
    mushroom(1150, 220),
    mushroom(1400, 160),
    mushroom(1650, 240),
    mushroom(1900, 200),
    mushroom(2100, 270 - li * 4),
    mushroom(2350, 210),
    brick(300,  340), brick(600, 300), brick(900, 260),
    brick(1200, 280), brick(1600, 200), brick(2000, 240),
    pipe(500), pipe(1100, 80), pipe(1700, 96), pipe(2600, 72),
  ]

  const enemies: LevelEnemy[] = [
    bouncer(400, 1.4 + li * 0.15),
    bouncer(800, 1.4 + li * 0.15),
    bouncer(1200, 1.6 + li * 0.15),
    walker(1600, 1.2 + li * 0.1),
    bouncer(2000, 1.8 + li * 0.15),
    bouncer(2400, 1.8 + li * 0.15),
  ].slice(0, 3 + li)

  const coins: LevelCoin[] = [
    ...coinRow(300, 290, 5),
    ...coinRow(700, 170, 5),
    ...coinRow(1200, 190, 5),
    ...coinRow(1700, 170, 5),
    ...coinRow(2100, 240, 4),
  ]

  return {
    world: 1,
    levelInWorld: li,
    storyTitle: W2_STORY[li].title,
    storyText:  W2_STORY[li].text,
    goalX: 3050,
    platforms,
    coins,
    enemies,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WORLD 3 – Gloom King's Mines
// ─────────────────────────────────────────────────────────────────────────────

const W3_STORY = [
  { title: "World 3-1: Into the Dark",      text: "The mines swallow all light. Pip grips a glowing coin for courage." },
  { title: "World 3-2: Pickaxe Corridor",   text: "Rusted pickaxes hang from the ceiling. One wrong move and they swing!" },
  { title: "World 3-3: Cart Tracks",        text: "Old mine carts block the path. Fast Shadlings dart through the darkness." },
  { title: "World 3-4: Crystal Cavern",     text: "Crystal pillars refract strange light. It's beautiful — and deadly." },
  { title: "World 3-5: Lava Veins",         text: "Cracks in the floor glow with molten rock. The heat is almost unbearable." },
  { title: "World 3-6: Deep Shaft",         text: "The shaft plunges hundreds of metres. Pip clings to mine-beam platforms." },
  { title: "World 3-7: Ore Tunnels",        text: "Narrow ore tunnels force Pip to crawl. Enemies are everywhere." },
  { title: "World 3-8: Echo Chamber",       text: "Sounds echo strangely here. Pip can't tell which direction enemies are coming from." },
  { title: "World 3-9: Smelting Hall",      text: "A giant furnace fills the hall with smoke. Pip must dash through quickly!" },
  { title: "World 3-10: Mine Gate",         text: "The mine's exit is blocked by a massive iron gate. Only speed will get Pip through!" },
]

function makeW3(idx: number): LevelDef {
  const li = idx
  const ceilY = 60 + li * 5  // ceiling gets lower
  const platforms: LevelPlatform[] = [
    gnd(0, 600), gnd(700, 400), gnd(1200, 500), gnd(1900, 600), gnd(2600, 500),
    // ceiling mine beams
    mine(0,   ceilY, 400),
    mine(450, ceilY, 300),
    mine(800, ceilY, 350),
    mine(1200, ceilY, 300),
    mine(1600, ceilY, 400),
    mine(2100, ceilY, 350),
    mine(2550, ceilY, 400),
    // floor platforms
    mine(300, 340), mine(600, 300, 64), mine(900, 260),
    mine(1300, 280), mine(1700, 300), mine(2000, 260),
    mine(2400, 300),
    pipe(500, 56 + li * 4), pipe(1100, 64), pipe(1800, 72), pipe(2700, 80),
  ]

  const fastCount = 2 + Math.floor(li * 0.8)
  const enemies: LevelEnemy[] = Array.from({ length: fastCount }, (_, i) =>
    fast(350 + i * Math.floor(2700 / fastCount), 2.0 + li * 0.2)
  )

  // Coins hidden on platforms (no floating rows in mines)
  const coins: LevelCoin[] = [
    coin(310, 310), coin(360, 310), coin(620, 270), coin(670, 270),
    coin(920, 230), coin(970, 230), coin(1320, 250), coin(1370, 250),
    coin(1720, 270), coin(1770, 270), coin(2020, 230), coin(2070, 230),
    coin(2420, 270), coin(2470, 270), coin(2520, 270),
  ]

  return {
    world: 2,
    levelInWorld: li,
    storyTitle: W3_STORY[li].title,
    storyText:  W3_STORY[li].text,
    goalX: 3050,
    platforms,
    coins,
    enemies,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WORLD 4 – Corrupted Clouds
// ─────────────────────────────────────────────────────────────────────────────

const W4_STORY = [
  { title: "World 4-1: Sky Entry",         text: "Pip bursts out of the mines into the corrupted sky. Purple clouds stretch endlessly." },
  { title: "World 4-2: Phantom Winds",     text: "Invisible wind pushes Pip sideways. The cloud platforms drift unpredictably." },
  { title: "World 4-3: Lightning Spires",  text: "Crackling spires jut from clouds. Flyers dodge between lightning bolts." },
  { title: "World 4-4: The Void Gap",      text: "A chasm with no bottom. Only fading cloud bridges connect the two sides." },
  { title: "World 4-5: Storm Citadel",     text: "A fortress of frozen cloud. The Gloom King's aerial guards patrol every ledge." },
  { title: "World 4-6: Hail Gauntlet",     text: "Balls of hail rain down. Pip ducks and weaves through the barrage." },
  { title: "World 4-7: Aurora Bridge",     text: "A shimmering aurora forms a bridge — beautiful but unstable." },
  { title: "World 4-8: Tempest Pass",      text: "A raging storm narrows the path to a thin strip of cloud. Don't look down!" },
  { title: "World 4-9: Cloud Bastion",     text: "The largest fortress in the sky. Flyers swarm from every window." },
  { title: "World 4-10: Gate of Gloom",    text: "One last sky barrier before the Tower. Pip can see it in the distance — almost there." },
]

function makeW4(idx: number): LevelDef {
  const li = idx
  const platforms: LevelPlatform[] = [
    gnd(0, 300),
    // no continuous ground — cloud chains only
    cloudFade(200,  340 - li * 5, 120),
    cloudFade(400,  300, 100),
    cloudFade(600,  260, 120),
    cloudFade(850,  320, 100),
    cloudFade(1050, 280, 110),
    cloudFade(1280, 240, 120),
    cloudFade(1500, 300, 100),
    cloudFade(1720, 260, 110),
    cloudFade(1950, 220, 120),
    cloudFade(2200, 280, 100),
    cloudFade(2450, 240, 110),
    cloudFade(2680, 300, 120),
    cloudFade(2900, 260, 100 + li * 8),
    brick(350, 360), brick(700, 340), brick(1100, 300),
    brick(1600, 280), brick(2100, 320), brick(2600, 300),
  ]

  const flyerCount = 3 + li
  const enemies: LevelEnemy[] = Array.from({ length: flyerCount }, (_, i) =>
    flyer(300 + i * Math.floor(2700 / flyerCount), 180 + (i % 3) * 40, 1.8 + li * 0.15)
  )

  const coins: LevelCoin[] = [
    ...coinRow(210, 310, 4, 36),
    ...coinRow(610, 230, 4, 36),
    ...coinRow(1060, 250, 4, 36),
    ...coinRow(1510, 270, 4, 36),
    ...coinRow(1960, 190, 4, 36),
    ...coinRow(2460, 210, 3, 36),
  ]

  return {
    world: 3,
    levelInWorld: li,
    storyTitle: W4_STORY[li].title,
    storyText:  W4_STORY[li].text,
    goalX: 3050,
    platforms,
    coins,
    enemies,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WORLD 5 – Gloom King's Tower
// ─────────────────────────────────────────────────────────────────────────────

const W5_STORY = [
  { title: "World 5-1: Tower Base",        text: "The Crumbling Tower looms above. Every step forward sends debris raining down." },
  { title: "World 5-2: Shattered Halls",   text: "The lower halls are half-collapsed. Crumbling bricks fall as Pip passes." },
  { title: "World 5-3: Flame Corridors",   text: "Torches line the walls, but the walls themselves are falling apart." },
  { title: "World 5-4: Guard Barracks",    text: "The Gloom King's elite guards patrol here. Fast, strong, and numerous." },
  { title: "World 5-5: Archive Ruins",     text: "Shelves of stolen knowledge tumble around Pip. Dodge and dash!" },
  { title: "World 5-6: Throne Approach",   text: "The grandest hall, now a ruin. The Golden Seed pulses faintly ahead." },
  { title: "World 5-7: Collapsing Spire",  text: "The spire above the throne is collapsing floor by floor. Move fast!" },
  { title: "World 5-8: Shadow Veil",       text: "Darkness is almost total. Pip navigates by the faint golden glow." },
  { title: "World 5-9: Antechamber",       text: "Just one room away from the Gloom King. The floor crumbles with each step." },
  { title: "World 5-10: The Gloom King!",  text: "The Gloom King stands between Pip and the Golden Seed. This is it — the final battle!" },
]

function makeW5(idx: number): LevelDef {
  const li = idx
  const isBoss = li === 9
  const platforms: LevelPlatform[] = [
    gnd(0, 400), gnd(700, 200), gnd(1100, 300), gnd(1600, 200), gnd(2200, 300),
    crumble(200, 340, 100 + li * 4),
    crumble(400, 300, 96),
    crumble(650, 260, 100 + li * 4),
    crumble(900, 220, 96),
    crumble(1150, 280, 100 + li * 4),
    crumble(1400, 240, 96),
    crumble(1700, 200, 100 + li * 4),
    crumble(1950, 260, 96),
    crumble(2200, 220, 100 + li * 4),
    crumble(2500, 280, 120),
    crumble(2750, 240, 96),
    brick(300, 360), brick(800, 320), brick(1300, 300),
    brick(1800, 280), brick(2300, 300), brick(2700, 260),
    pipe(500, 80 + li * 4), pipe(1200, 96), pipe(1900, 88), pipe(2600, 80),
  ]

  const enemies: LevelEnemy[] = isBoss
    ? [
        boss(1600),
        fast(800,  2.5),
        fast(2200, 2.5),
        walker(400, 1.5),
        walker(2800, 1.5),
      ]
    : [
        fast(400,  2.0 + li * 0.2),
        fast(900,  2.2 + li * 0.2),
        fast(1400, 2.0 + li * 0.2),
        fast(1900, 2.4 + li * 0.2),
        fast(2400, 2.2 + li * 0.2),
        walker(600, 1.8 + li * 0.1),
        walker(1100, 1.8 + li * 0.1),
      ].slice(0, 4 + Math.floor(li * 0.5))

  const coins: LevelCoin[] = isBoss
    ? [
        // Golden Seed coins ring
        ...coinRow(1500, 200, 6, 30),
        ...coinRow(1500, 160, 6, 30),
      ]
    : [
        ...coinRow(210, 310, 4, 32),
        ...coinRow(660, 230, 4, 32),
        ...coinRow(1160, 250, 4, 32),
        ...coinRow(1710, 170, 4, 32),
        ...coinRow(2210, 190, 4, 32),
      ]

  return {
    world: 4,
    levelInWorld: li,
    storyTitle: W5_STORY[li].title,
    storyText:  W5_STORY[li].text,
    goalX: isBoss ? 2800 : 3050,
    platforms,
    coins,
    enemies,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Assemble all 50 levels
// ─────────────────────────────────────────────────────────────────────────────

export const ALL_LEVELS: LevelDef[] = [
  ...Array.from({ length: 10 }, (_, i) => makeW1(i)),
  ...Array.from({ length: 10 }, (_, i) => makeW2(i)),
  ...Array.from({ length: 10 }, (_, i) => makeW3(i)),
  ...Array.from({ length: 10 }, (_, i) => makeW4(i)),
  ...Array.from({ length: 10 }, (_, i) => makeW5(i)),
]
