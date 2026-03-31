import type { GradientStop, RendererState } from '../renderer/types'

const DEFAULT_STATE: RendererState = {
  center: [2.5, 3.5],
  zoom: 1,
  sequence: [0, 1], // AB
  gradientStops: [
    { position: 0, color: [0, 0, 40] },
    { position: 0.35, color: [0, 80, 200] },
    { position: 0.5, color: [255, 255, 255] },
    { position: 0.65, color: [255, 200, 0] },
    { position: 1, color: [128, 0, 0] },
  ],
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

    return {
      center: center && center.length === 2 && center.every(isFinite) ? center : DEFAULT_STATE.center,
      zoom: zoom && isFinite(zoom) && zoom > 0 ? zoom : DEFAULT_STATE.zoom,
      sequence: seq && seq.length > 0 ? seq : DEFAULT_STATE.sequence,
      gradientStops: grad ?? DEFAULT_STATE.gradientStops,
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
