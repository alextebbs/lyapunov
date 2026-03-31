import type { GradientStop } from './types'

const GRADIENT_TEXTURE_WIDTH = 512

/**
 * Rasterize gradient stops into a 512x1 RGBA Uint8Array.
 */
export function rasterizeGradient(stops: GradientStop[]): Uint8Array {
  const data = new Uint8Array(GRADIENT_TEXTURE_WIDTH * 4)

  if (stops.length === 0) return data

  // Sort stops by position
  const sorted = [...stops].sort((a, b) => a.position - b.position)

  for (let i = 0; i < GRADIENT_TEXTURE_WIDTH; i++) {
    const t = i / (GRADIENT_TEXTURE_WIDTH - 1)

    // Find surrounding stops
    let left = sorted[0]!
    let right = sorted[sorted.length - 1]!

    for (let j = 0; j < sorted.length - 1; j++) {
      if (t >= sorted[j]!.position && t <= sorted[j + 1]!.position) {
        left = sorted[j]!
        right = sorted[j + 1]!
        break
      }
    }

    // Interpolate
    const range = right.position - left.position
    const localT = range === 0 ? 0 : (t - left.position) / range

    const idx = i * 4
    data[idx] = Math.round(left.color[0] + (right.color[0] - left.color[0]) * localT)
    data[idx + 1] = Math.round(left.color[1] + (right.color[1] - left.color[1]) * localT)
    data[idx + 2] = Math.round(left.color[2] + (right.color[2] - left.color[2]) * localT)
    data[idx + 3] = 255
  }

  return data
}

/**
 * Upload a gradient to a WebGL 1D texture (512x1).
 */
export function uploadGradientTexture(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  stops: GradientStop[],
) {
  const data = rasterizeGradient(stops)

  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    GRADIENT_TEXTURE_WIDTH,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    data,
  )
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.bindTexture(gl.TEXTURE_2D, null)
}

export function createGradientTexture(
  gl: WebGL2RenderingContext,
  stops: GradientStop[],
): WebGLTexture {
  const texture = gl.createTexture()
  if (!texture) throw new Error('Failed to create gradient texture')
  uploadGradientTexture(gl, texture, stops)
  return texture
}
