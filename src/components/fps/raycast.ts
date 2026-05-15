// ─── FPS Game – Raycasting ────────────────────────────────────────────────────
// Pure TypeScript DDA (Digital Differential Analysis) raycaster.
// No React, no canvas — this module is pure math and is easily unit-testable.
//
// Coordinate system (classic Wolfenstein / Lode's Raycaster convention):
//   • map[row][col]  →  row = Y axis, col = X axis
//   • angle = 0 points along the positive X axis (east)
//   • angles increase counter-clockwise (standard math convention)
//
// side convention (per acceptance criteria):
//   • side = 0  →  ray hit a N/S wall face (horizontal grid line crossed)
//   • side = 1  →  ray hit an E/W wall face (vertical grid line crossed)
//
// FOV / camera-plane convention:
//   • camera plane is perpendicular to the look direction
//   • magnitude 0.66 gives ≈66° horizontal FOV (classic Wolfenstein ratio)
//   • each column maps to a cameraX value in [-1, +1]

import type { FpsPlayer, FpsMap, RayHit } from './types'

// Re-export RayHit so downstream tasks can import it from either module.
export type { RayHit } from './types'

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Cast one ray per screen column using the DDA algorithm and return an array
 * of {@link RayHit} objects describing the first solid tile each ray strikes.
 *
 * @param player      Current player state (position + angle).
 * @param map         2-D tile array.  map[row][col]; 0 = walkable, 1+ = wall.
 * @param screenWidth Number of screen columns (= number of rays).
 * @param fov         Full horizontal field-of-view in radians.
 *                    Omit to use the default 0.66-unit camera-plane magnitude.
 * @returns           Array of exactly `screenWidth` {@link RayHit} objects.
 */
export function castRays(
  player: FpsPlayer,
  map: FpsMap,
  screenWidth: number,
  fov: number = 2 * Math.atan(0.66),
): RayHit[] {
  const dirX = Math.cos(player.angle)
  const dirY = Math.sin(player.angle)

  const planeMag = Math.tan(fov / 2)
  const planeX = -dirY * planeMag
  const planeY = dirX * planeMag

  const hits: RayHit[] = new Array(screenWidth)

  const mapHeight = map.length
  const mapWidth = map[0]?.length ?? 0

  for (let col = 0; col < screenWidth; col++) {
    const cameraX = (2 * col) / (screenWidth - 1) - 1

    const rayDirX = dirX + planeX * cameraX
    const rayDirY = dirY + planeY * cameraX

    let mapX = Math.floor(player.x)
    let mapY = Math.floor(player.y)

    const deltaDistX = rayDirX === 0 ? Infinity : Math.abs(1 / rayDirX)
    const deltaDistY = rayDirY === 0 ? Infinity : Math.abs(1 / rayDirY)

    let stepX: number
    let stepY: number
    let sideDistX: number
    let sideDistY: number

    if (rayDirX < 0) {
      stepX = -1
      sideDistX = (player.x - mapX) * deltaDistX
    } else {
      stepX = 1
      sideDistX = (mapX + 1 - player.x) * deltaDistX
    }

    if (rayDirY < 0) {
      stepY = -1
      sideDistY = (player.y - mapY) * deltaDistY
    } else {
      stepY = 1
      sideDistY = (mapY + 1 - player.y) * deltaDistY
    }

    let side: 0 | 1 = 0

    while (true) {
      if (sideDistX < sideDistY) {
        sideDistX += deltaDistX
        mapX += stepX
        side = 1
      } else {
        sideDistY += deltaDistY
        mapY += stepY
        side = 0
      }

      if (mapX < 0 || mapY < 0 || mapX >= mapWidth || mapY >= mapHeight) {
        const perpWallDist =
          side === 1
            ? (mapX - player.x + (1 - stepX) / 2) / rayDirX
            : (mapY - player.y + (1 - stepY) / 2) / rayDirY
        hits[col] = { distance: Math.max(perpWallDist, 0.001), side, tileType: 1, wallX: 0.5 }
        break
      }

      const tileType = map[mapY][mapX]
      if (tileType !== 0) {
        const perpWallDist =
          side === 1
            ? (mapX - player.x + (1 - stepX) / 2) / rayDirX
            : (mapY - player.y + (1 - stepY) / 2) / rayDirY

        let wallX: number
        if (side === 1) {
          wallX = player.y + perpWallDist * rayDirY
        } else {
          wallX = player.x + perpWallDist * rayDirX
        }
        wallX -= Math.floor(wallX)

        hits[col] = { distance: Math.max(perpWallDist, 0.001), side, tileType, wallX }
        break
      }
    }
  }

  return hits
}

// ─── Legacy single-ray API (kept for backwards compatibility) ─────────────────

/** Options for the original single-ray cast helper. */
export interface CastRayOptions {
  /** World-space origin X */
  originX: number
  /** World-space origin Y */
  originY: number
  /** Ray direction angle in radians */
  angle: number
  /** Maximum ray travel distance in world units */
  maxDistance: number
  /** The map to test against */
  map: FpsMap
  /** Screen column this ray represents */
  column: number
}

/**
 * Cast a single ray through the tile map using DDA and return information
 * about the first solid tile it intersects, or `null` if it travels beyond
 * `maxDistance` without hitting anything.
 *
 * @deprecated Prefer {@link castRays} for full-screen casting.
 */
export function castRay(options: CastRayOptions): RayHit | null {
  const { originX, originY, angle, maxDistance, map } = options

  const rayDirX = Math.cos(angle)
  const rayDirY = Math.sin(angle)

  let mapX = Math.floor(originX)
  let mapY = Math.floor(originY)

  const deltaDistX = rayDirX === 0 ? Infinity : Math.abs(1 / rayDirX)
  const deltaDistY = rayDirY === 0 ? Infinity : Math.abs(1 / rayDirY)

  let stepX: number
  let stepY: number
  let sideDistX: number
  let sideDistY: number

  if (rayDirX < 0) {
    stepX = -1
    sideDistX = (originX - mapX) * deltaDistX
  } else {
    stepX = 1
    sideDistX = (mapX + 1 - originX) * deltaDistX
  }

  if (rayDirY < 0) {
    stepY = -1
    sideDistY = (originY - mapY) * deltaDistY
  } else {
    stepY = 1
    sideDistY = (mapY + 1 - originY) * deltaDistY
  }

  const mapHeight = map.length
  const mapWidth = map[0]?.length ?? 0

  let side: 0 | 1 = 0

  while (true) {
    if (sideDistX < sideDistY) {
      sideDistX += deltaDistX
      mapX += stepX
      side = 1
    } else {
      sideDistY += deltaDistY
      mapY += stepY
      side = 0
    }

    if (mapX < 0 || mapY < 0 || mapX >= mapWidth || mapY >= mapHeight) {
      return null
    }

    const perpWallDist =
      side === 1
        ? (mapX - originX + (1 - stepX) / 2) / rayDirX
        : (mapY - originY + (1 - stepY) / 2) / rayDirY

    if (perpWallDist > maxDistance) return null

    const tileType = map[mapY][mapX]
    if (tileType !== 0) {
      let wallX: number
      if (side === 1) {
        wallX = originY + perpWallDist * rayDirY
      } else {
        wallX = originX + perpWallDist * rayDirX
      }
      wallX -= Math.floor(wallX)

      return { distance: Math.max(perpWallDist, 0.001), side, tileType, wallX }
    }
  }
}
