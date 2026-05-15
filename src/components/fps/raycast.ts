/**
 * raycast.ts — Pure raycasting math for the FPS game.
 *
 * Implements Lode's Raycasting Tutorial DDA (Digital Differential Analysis)
 * algorithm. No DOM, no React — pure TypeScript math only.
 *
 * Reference: https://lodev.org/cgtutor/raycasting.html
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** State object passed to castRays; describes the player's position/orientation. */
export interface PlayerState {
  /** Player world position X (float, in tile units). */
  posX: number;
  /** Player world position Y (float, in tile units). */
  posY: number;
  /** Normalised direction vector X. */
  dirX: number;
  /** Normalised direction vector Y. */
  dirY: number;
  /**
   * Camera-plane vector X (perpendicular to dir).
   * Its magnitude controls the horizontal FOV:
   *   FOV = 2 * atan(|plane| / |dir|)
   * For a 66 degree FOV use |plane| approx 0.66 with |dir| = 1.
   */
  planeX: number;
  /** Camera-plane vector Y (perpendicular to dir). */
  planeY: number;
  /**
   * 2-D tile grid. 0 = empty space; any positive integer = wall type.
   * map[row][col]  ->  map[y][x]
   */
  map: number[][];
}

/** Per-column result returned by castRays. */
export interface RayHit {
  /** Perpendicular wall distance (fisheye-corrected, always > 0). */
  distance: number;
  /**
   * Fractional hit position on the wall face (0-1).
   * Can be used as the U texture coordinate.
   */
  wallX: number;
  /**
   * Which axis was hit last by DDA:
   *   0 = X-axis step (N/S wall face)
   *   1 = Y-axis step (E/W wall face)
   */
  side: 0 | 1;
  /** Map column (X) of the tile that was hit. */
  mapX: number;
  /** Map row (Y) of the tile that was hit. */
  mapY: number;
  /** The map value at the hit tile (1, 2, 3 ... for different wall colours). */
  tileType: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Fallback tile type when a ray escapes the map bounds. */
const OUT_OF_BOUNDS_TILE = 1;

/** Maximum DDA steps before we give up and treat ray as hitting a wall. */
const MAX_DDA_STEPS = 256;

/**
 * Returns the map tile at (x, y), or OUT_OF_BOUNDS_TILE when out of range.
 */
function getTile(map: number[][], x: number, y: number): number {
  if (y < 0 || y >= map.length) return OUT_OF_BOUNDS_TILE;
  const row = map[y];
  if (x < 0 || x >= row.length) return OUT_OF_BOUNDS_TILE;
  return row[x];
}

// ---------------------------------------------------------------------------
// Core export
// ---------------------------------------------------------------------------

/**
 * Cast `numRays` rays across the screen for the given player state.
 *
 * @param state    Player position, direction, camera plane, and tile map.
 * @param numRays  Number of ray columns to cast (typically the canvas width).
 * @returns        Array of `numRays` RayHit objects, one per screen column.
 */
export function castRays(state: PlayerState, numRays: number): RayHit[] {
  const { posX, posY, dirX, dirY, planeX, planeY, map } = state;
  const hits: RayHit[] = [];

  for (let col = 0; col < numRays; col++) {
    // -----------------------------------------------------------------------
    // 1. Compute ray direction for this screen column.
    //    cameraX ranges from -1 (left edge) to +1 (right edge).
    // -----------------------------------------------------------------------
    const cameraX = (2 * col) / numRays - 1; // [-1, 1]
    const rayDirX = dirX + planeX * cameraX;
    const rayDirY = dirY + planeY * cameraX;

    // Current map tile the player is standing on.
    let mapX = Math.floor(posX);
    let mapY = Math.floor(posY);

    // -----------------------------------------------------------------------
    // 2. Delta distances:
    //    How far the ray must travel in world-space to cross one tile boundary
    //    along each axis.  Guard against divide-by-zero with Infinity.
    // -----------------------------------------------------------------------
    const deltaDistX = rayDirX === 0 ? Infinity : Math.abs(1 / rayDirX);
    const deltaDistY = rayDirY === 0 ? Infinity : Math.abs(1 / rayDirY);

    // -----------------------------------------------------------------------
    // 3. Initial side distances and step directions.
    //    sideDistX/Y = distance from the player position to the first
    //    tile boundary in that axis direction.
    // -----------------------------------------------------------------------
    let sideDistX: number;
    let sideDistY: number;
    let stepX: number; // +1 or -1
    let stepY: number; // +1 or -1

    if (rayDirX < 0) {
      stepX = -1;
      sideDistX = (posX - mapX) * deltaDistX;
    } else {
      stepX = 1;
      sideDistX = (mapX + 1.0 - posX) * deltaDistX;
    }

    if (rayDirY < 0) {
      stepY = -1;
      sideDistY = (posY - mapY) * deltaDistY;
    } else {
      stepY = 1;
      sideDistY = (mapY + 1.0 - posY) * deltaDistY;
    }

    // -----------------------------------------------------------------------
    // 4. DDA loop: advance ray one tile boundary at a time until we hit a
    //    wall or exceed MAX_DDA_STEPS (treat out-of-bounds as a wall).
    // -----------------------------------------------------------------------
    let side: 0 | 1 = 0;
    let tileType = 0;

    for (let step = 0; step < MAX_DDA_STEPS; step++) {
      // Advance to the next tile boundary (whichever axis is closer).
      if (sideDistX < sideDistY) {
        sideDistX += deltaDistX;
        mapX += stepX;
        side = 0; // stepped in X -> hit a N/S wall face
      } else {
        sideDistY += deltaDistY;
        mapY += stepY;
        side = 1; // stepped in Y -> hit a E/W wall face
      }

      tileType = getTile(map, mapX, mapY);
      if (tileType !== 0) break; // wall hit
    }

    // If somehow we never found a wall (shouldn't happen with bounded maps
    // and the out-of-bounds fallback), synthesise a distant hit.
    if (tileType === 0) {
      tileType = OUT_OF_BOUNDS_TILE;
    }

    // -----------------------------------------------------------------------
    // 5. Perpendicular wall distance (avoids fisheye distortion).
    //    We back-calculate from the accumulated side-distances rather than
    //    using the Euclidean distance between player and hit point.
    // -----------------------------------------------------------------------
    let perpWallDist: number;
    if (side === 0) {
      perpWallDist = sideDistX - deltaDistX;
    } else {
      perpWallDist = sideDistY - deltaDistY;
    }

    // Clamp to a small positive value to avoid division-by-zero in the
    // renderer when the player is standing exactly on a wall boundary.
    if (perpWallDist < 0.0001) perpWallDist = 0.0001;

    // -----------------------------------------------------------------------
    // 6. Fractional hit position on the wall face (texture U coordinate).
    // -----------------------------------------------------------------------
    let wallX: number;
    if (side === 0) {
      // X-step: hit position along Y axis of the wall face.
      wallX = posY + perpWallDist * rayDirY;
    } else {
      // Y-step: hit position along X axis of the wall face.
      wallX = posX + perpWallDist * rayDirX;
    }
    wallX -= Math.floor(wallX); // keep only the fractional part [0, 1)

    // -----------------------------------------------------------------------
    // 7. Record the result for this column.
    // -----------------------------------------------------------------------
    hits.push({
      distance: perpWallDist,
      wallX,
      side,
      mapX,
      mapY,
      tileType,
    });
  }

  return hits;
}
