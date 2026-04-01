export interface GradientStop {
  position: number // 0..1
  color: [number, number, number] // RGB 0..255
}

export interface ViewState {
  centerX: number
  centerY: number
  zoom: number // log2 scale, 0 = default view
}

export interface TileKey {
  col: number
  row: number
  zoom: number // discrete zoom level
}

export interface Tile {
  key: TileKey
  framebuffer: WebGLFramebuffer
  texture: WebGLTexture
  pass: number // current refinement pass (0 = not started)
  maxPass: number
  dirty: boolean
  lastUsed: number // timestamp for LRU
}

export interface RendererState {
  center: [number, number]
  zoom: number
  sequence: number[] // 0 = A, 1 = B, 2 = C
  gradientStops: GradientStop[]
  lambdaRange: [number, number] // [min, max] for exponent mapping
  x0: number // initial condition for orbit
  mapFunction: number // 0=logistic, 1=sine, 2=cubic, 3=gaussian
  exponent: number // generalized map exponent (1.0 = standard)
  cValue: number // r-value for third sequence symbol C
}

/** Double-float representation: [high, low] where value = high + low */
export type DoublePair = [number, number]
