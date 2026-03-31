import type { Tile, TileKey } from './types'

const MAX_CACHED_TILES = 128

/**
 * Manages a pool of tile framebuffers with LRU eviction.
 */
export class TileCache {
  private cache = new Map<string, Tile>()
  private gl: WebGL2RenderingContext
  readonly tileSize: number

  constructor(gl: WebGL2RenderingContext, tileSize: number) {
    this.gl = gl
    this.tileSize = tileSize
  }

  private keyString(key: TileKey): string {
    return `${key.col},${key.row},${key.zoom}`
  }

  get(key: TileKey): Tile | undefined {
    const k = this.keyString(key)
    const tile = this.cache.get(k)
    if (tile) {
      tile.lastUsed = performance.now()
    }
    return tile
  }

  create(key: TileKey): Tile {
    const k = this.keyString(key)
    const existing = this.cache.get(k)
    if (existing) {
      existing.lastUsed = performance.now()
      return existing
    }

    // Evict if over capacity
    if (this.cache.size >= MAX_CACHED_TILES) {
      this.evictLRU()
    }

    const gl = this.gl
    const framebuffer = gl.createFramebuffer()!
    const texture = gl.createTexture()!

    // Set up the tile's render texture
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      this.tileSize,
      this.tileSize,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    )
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    // Attach texture to framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.bindTexture(gl.TEXTURE_2D, null)

    const tile: Tile = {
      key,
      framebuffer,
      texture,
      pass: 0,
      maxPass: 4,
      dirty: true,
      lastUsed: performance.now(),
    }

    this.cache.set(k, tile)
    return tile
  }

  /** Mark all tiles as dirty (e.g. when sequence or gradient changes). */
  invalidateAll() {
    for (const tile of this.cache.values()) {
      tile.dirty = true
      tile.pass = 0
    }
  }

  /** Mark tiles dirty but keep existing renders for visual continuity. */
  markAllDirty() {
    for (const tile of this.cache.values()) {
      tile.dirty = true
    }
  }

  private evictLRU() {
    let oldest: string | null = null
    let oldestTime = Infinity

    for (const [k, tile] of this.cache) {
      if (tile.lastUsed < oldestTime) {
        oldestTime = tile.lastUsed
        oldest = k
      }
    }

    if (oldest) {
      const tile = this.cache.get(oldest)!
      this.gl.deleteTexture(tile.texture)
      this.gl.deleteFramebuffer(tile.framebuffer)
      this.cache.delete(oldest)
    }
  }

  destroy() {
    for (const tile of this.cache.values()) {
      this.gl.deleteTexture(tile.texture)
      this.gl.deleteFramebuffer(tile.framebuffer)
    }
    this.cache.clear()
  }

  /** Get all cached tiles. */
  all(): Tile[] {
    return Array.from(this.cache.values())
  }
}

/**
 * Iteration counts for each progressive pass.
 * Pass 0 = fast preview, Pass 3 = full quality.
 */
export const PASS_ITERATIONS = [32, 128, 512, 2048]

/**
 * Determine which tile grid cells are visible for the current viewport.
 */
export function getVisibleTiles(
  _centerX: number,
  _centerY: number,
  zoom: number,
  canvasWidth: number,
  canvasHeight: number,
  tileSize: number,
): TileKey[] {
  const cols = Math.ceil(canvasWidth / tileSize)
  const rows = Math.ceil(canvasHeight / tileSize)

  // Quantized zoom level for tile caching
  const zoomLevel = Math.round(Math.log2(zoom) * 4) // quarter-stop increments

  const tiles: TileKey[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      tiles.push({ col, row, zoom: zoomLevel })
    }
  }

  // Sort by distance from center (center tiles render first)
  const midCol = (cols - 1) / 2
  const midRow = (rows - 1) / 2
  tiles.sort((a, b) => {
    const distA = (a.col - midCol) ** 2 + (a.row - midRow) ** 2
    const distB = (b.col - midCol) ** 2 + (b.row - midRow) ** 2
    return distA - distB
  })

  return tiles
}
