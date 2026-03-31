/**
 * Double-float emulation on the JS side.
 * Splits a high-precision number into two 32-bit floats
 * such that value = high + low, with high carrying the significant bits.
 */

import type { DoublePair } from './types'

/**
 * Split a 64-bit JS number into two 32-bit floats.
 * The high part is the float32 approximation, the low part is the remainder.
 */
export function splitDouble(value: number): DoublePair {
  const high = Math.fround(value)
  const low = Math.fround(value - high)
  return [high, low]
}

/**
 * Threshold zoom level beyond which we switch to double-float emulation.
 * At zoom ~1e5, single float32 precision starts showing artifacts.
 */
export const DOUBLE_EMULATION_THRESHOLD = 1e5
