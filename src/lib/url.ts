import type { GradientStop, RendererState } from '../renderer/types'

const DEFAULT_STATE: RendererState = {
  // Zircon Zity: BBBBBBAAAAAA in region (A,B) in [3.4, 4.0] × [2.5, 3.4]
  // Center of that region: A=3.7, B=2.95
  center: [3.7, 2.95],
  zoom: 3.5,
  sequence: [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0], // BBBBBBAAAAAA
  gradientStops: [
    { position: 0, color: [10, 5, 0] },
    { position: 0.35, color: [200, 170, 0] },
    { position: 0.48, color: [255, 220, 50] },
    { position: 0.5, color: [0, 0, 0] },
    { position: 0.52, color: [0, 20, 80] },
    { position: 0.65, color: [0, 50, 180] },
    { position: 1, color: [0, 0, 60] },
  ],
  lambdaRange: [-0.5, 0.5],
  x0: 0.5,
}

function sequenceToString(seq: number[]): string {
  return seq.map(v => (v === 0 ? 'A' : 'B')).join('')
}

function stringToSequence(s: string): number[] {
  return s
    .toUpperCase()
    .split('')
    .filter(c => c === 'A' || c === 'B')
    .map(c => (c === 'A' ? 0 : 1))
}

function colorToHex(c: [number, number, number]): string {
  return c.map(v => v.toString(16).padStart(2, '0')).join('')
}

function hexToColor(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return [
    isNaN(r) ? 0 : r,
    isNaN(g) ? 0 : g,
    isNaN(b) ? 0 : b,
  ]
}

function encodeGradient(stops: GradientStop[]): string {
  return stops.map(s => `${s.position.toFixed(3)}:${colorToHex(s.color)}`).join('-')
}

function decodeGradient(str: string): GradientStop[] | null {
  try {
    const stops = str.split('-').map(part => {
      const [pos, hex] = part.split(':')
      return {
        position: parseFloat(pos!),
        color: hexToColor(hex!),
      }
    })
    if (stops.length < 2) return null
    return stops
  } catch {
    return null
  }
}

export function serializeState(state: RendererState): string {
  const params = new URLSearchParams()
  params.set('c', `${state.center[0].toPrecision(15)},${state.center[1].toPrecision(15)}`)
  params.set('z', state.zoom.toPrecision(10))
  params.set('s', sequenceToString(state.sequence))
  params.set('g', encodeGradient(state.gradientStops))
  if (state.lambdaRange[0] !== -0.5 || state.lambdaRange[1] !== 0.5) {
    params.set('lr', `${state.lambdaRange[0].toFixed(3)},${state.lambdaRange[1].toFixed(3)}`)
  }
  if (state.x0 !== 0.5) {
    params.set('x0', state.x0.toFixed(4))
  }
  return '#' + params.toString()
}

export function deserializeState(hash: string): RendererState {
  if (!hash || hash === '#') return { ...DEFAULT_STATE }

  try {
    const params = new URLSearchParams(hash.replace(/^#/, ''))

    const center = params.get('c')?.split(',').map(Number) as [number, number] | undefined
    const zoom = params.get('z') ? parseFloat(params.get('z')!) : undefined
    const seq = params.get('s') ? stringToSequence(params.get('s')!) : undefined
    const grad = params.get('g') ? decodeGradient(params.get('g')!) : undefined
    const lr = params.get('lr')?.split(',').map(Number) as [number, number] | undefined
    const x0 = params.get('x0') ? parseFloat(params.get('x0')!) : undefined

    return {
      center: center && center.length === 2 && center.every(isFinite) ? center : DEFAULT_STATE.center,
      zoom: zoom && isFinite(zoom) && zoom > 0 ? zoom : DEFAULT_STATE.zoom,
      sequence: seq && seq.length > 0 ? seq : DEFAULT_STATE.sequence,
      gradientStops: grad ?? DEFAULT_STATE.gradientStops,
      lambdaRange: lr && lr.length === 2 && lr.every(isFinite) ? lr : DEFAULT_STATE.lambdaRange,
      x0: x0 && isFinite(x0) && x0 > 0 && x0 < 1 ? x0 : DEFAULT_STATE.x0,
    }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

export function sequenceToDisplayString(seq: number[]): string {
  return sequenceToString(seq)
}

export function displayStringToSequence(s: string): number[] {
  return stringToSequence(s)
}

export { DEFAULT_STATE }
