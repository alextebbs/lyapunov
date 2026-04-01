import { useAppState } from '../state/context'
import type { RendererState } from '../renderer/types'

// Helper: convert "ABBAAB" string to number array
const seq = (s: string) => s.split('').map(c => (c === 'A' ? 0 : 1))

// Helper: build a full RendererState with defaults for optional fields
function scene(partial: Pick<RendererState, 'sequence' | 'center' | 'zoom' | 'gradientStops'> & Partial<RendererState>): RendererState {
  return {
    lambdaRange: [-0.5, 0.5],
    x0: 0.5,
    mapFunction: 0,
    exponent: 1.0,
    cValue: 3.0,
    ...partial,
  }
}

export interface Scene {
  label: string
  seq: string
  state: RendererState
}

// ── Gradient palettes ────────────────────────────────────────────────
// Reusable gradient definitions so scenes can mix & match

const G = {
  zirconZity: [
    { position: 0, color: [10, 5, 0] as [number, number, number] },
    { position: 0.35, color: [200, 170, 0] as [number, number, number] },
    { position: 0.48, color: [255, 220, 50] as [number, number, number] },
    { position: 0.5, color: [0, 0, 0] as [number, number, number] },
    { position: 0.52, color: [0, 20, 80] as [number, number, number] },
    { position: 0.65, color: [0, 50, 180] as [number, number, number] },
    { position: 1, color: [0, 0, 60] as [number, number, number] },
  ],
  ember: [
    { position: 0, color: [0, 0, 0] as [number, number, number] },
    { position: 0.2, color: [60, 0, 0] as [number, number, number] },
    { position: 0.4, color: [200, 40, 0] as [number, number, number] },
    { position: 0.5, color: [255, 200, 50] as [number, number, number] },
    { position: 0.6, color: [255, 255, 200] as [number, number, number] },
    { position: 0.8, color: [200, 100, 0] as [number, number, number] },
    { position: 1, color: [40, 5, 0] as [number, number, number] },
  ],
  arctic: [
    { position: 0, color: [0, 0, 10] as [number, number, number] },
    { position: 0.2, color: [0, 30, 80] as [number, number, number] },
    { position: 0.4, color: [40, 130, 200] as [number, number, number] },
    { position: 0.5, color: [220, 240, 255] as [number, number, number] },
    { position: 0.6, color: [180, 220, 255] as [number, number, number] },
    { position: 0.8, color: [20, 60, 120] as [number, number, number] },
    { position: 1, color: [0, 5, 20] as [number, number, number] },
  ],
  jungle: [
    { position: 0, color: [0, 5, 0] as [number, number, number] },
    { position: 0.2, color: [10, 40, 5] as [number, number, number] },
    { position: 0.4, color: [40, 140, 20] as [number, number, number] },
    { position: 0.5, color: [200, 255, 100] as [number, number, number] },
    { position: 0.6, color: [100, 180, 40] as [number, number, number] },
    { position: 0.8, color: [30, 60, 10] as [number, number, number] },
    { position: 1, color: [5, 10, 0] as [number, number, number] },
  ],
  ultraviolet: [
    { position: 0, color: [0, 0, 0] as [number, number, number] },
    { position: 0.2, color: [40, 0, 80] as [number, number, number] },
    { position: 0.35, color: [120, 0, 200] as [number, number, number] },
    { position: 0.5, color: [255, 100, 255] as [number, number, number] },
    { position: 0.65, color: [200, 0, 120] as [number, number, number] },
    { position: 0.8, color: [80, 0, 40] as [number, number, number] },
    { position: 1, color: [10, 0, 5] as [number, number, number] },
  ],
  sunset: [
    { position: 0, color: [10, 0, 20] as [number, number, number] },
    { position: 0.15, color: [60, 0, 80] as [number, number, number] },
    { position: 0.3, color: [180, 30, 60] as [number, number, number] },
    { position: 0.45, color: [255, 120, 30] as [number, number, number] },
    { position: 0.5, color: [255, 220, 100] as [number, number, number] },
    { position: 0.6, color: [255, 160, 50] as [number, number, number] },
    { position: 0.75, color: [120, 20, 60] as [number, number, number] },
    { position: 1, color: [15, 0, 20] as [number, number, number] },
  ],
  neon: [
    { position: 0, color: [0, 0, 0] as [number, number, number] },
    { position: 0.2, color: [255, 0, 80] as [number, number, number] },
    { position: 0.4, color: [255, 255, 0] as [number, number, number] },
    { position: 0.5, color: [255, 255, 255] as [number, number, number] },
    { position: 0.6, color: [0, 255, 200] as [number, number, number] },
    { position: 0.8, color: [80, 0, 255] as [number, number, number] },
    { position: 1, color: [0, 0, 0] as [number, number, number] },
  ],
  monochrome: [
    { position: 0, color: [0, 0, 0] as [number, number, number] },
    { position: 0.48, color: [180, 180, 180] as [number, number, number] },
    { position: 0.5, color: [255, 255, 255] as [number, number, number] },
    { position: 0.52, color: [180, 180, 180] as [number, number, number] },
    { position: 1, color: [0, 0, 0] as [number, number, number] },
  ],
  copper: [
    { position: 0, color: [0, 0, 0] as [number, number, number] },
    { position: 0.2, color: [40, 15, 5] as [number, number, number] },
    { position: 0.4, color: [160, 80, 30] as [number, number, number] },
    { position: 0.5, color: [220, 160, 80] as [number, number, number] },
    { position: 0.6, color: [180, 120, 50] as [number, number, number] },
    { position: 0.8, color: [80, 30, 10] as [number, number, number] },
    { position: 1, color: [10, 2, 0] as [number, number, number] },
  ],
  stainedGlass: [
    { position: 0, color: [10, 0, 30] as [number, number, number] },
    { position: 0.12, color: [80, 0, 140] as [number, number, number] },
    { position: 0.25, color: [200, 30, 80] as [number, number, number] },
    { position: 0.38, color: [255, 160, 0] as [number, number, number] },
    { position: 0.5, color: [255, 255, 220] as [number, number, number] },
    { position: 0.62, color: [0, 200, 100] as [number, number, number] },
    { position: 0.75, color: [0, 80, 200] as [number, number, number] },
    { position: 0.88, color: [40, 0, 120] as [number, number, number] },
    { position: 1, color: [5, 0, 15] as [number, number, number] },
  ],
  plasma: [
    { position: 0, color: [10, 0, 30] as [number, number, number] },
    { position: 0.25, color: [120, 0, 180] as [number, number, number] },
    { position: 0.5, color: [240, 80, 40] as [number, number, number] },
    { position: 0.75, color: [255, 230, 60] as [number, number, number] },
    { position: 1, color: [240, 250, 220] as [number, number, number] },
  ],
  ocean: [
    { position: 0, color: [0, 0, 10] as [number, number, number] },
    { position: 0.15, color: [0, 10, 40] as [number, number, number] },
    { position: 0.35, color: [0, 60, 120] as [number, number, number] },
    { position: 0.5, color: [0, 180, 200] as [number, number, number] },
    { position: 0.65, color: [100, 220, 220] as [number, number, number] },
    { position: 0.8, color: [200, 250, 255] as [number, number, number] },
    { position: 1, color: [240, 255, 255] as [number, number, number] },
  ],
  rose: [
    { position: 0, color: [10, 0, 5] as [number, number, number] },
    { position: 0.2, color: [80, 10, 30] as [number, number, number] },
    { position: 0.4, color: [200, 50, 80] as [number, number, number] },
    { position: 0.5, color: [255, 180, 200] as [number, number, number] },
    { position: 0.6, color: [255, 220, 230] as [number, number, number] },
    { position: 0.8, color: [160, 40, 60] as [number, number, number] },
    { position: 1, color: [20, 0, 5] as [number, number, number] },
  ],
  thermal: [
    { position: 0, color: [0, 0, 0] as [number, number, number] },
    { position: 0.15, color: [0, 0, 80] as [number, number, number] },
    { position: 0.3, color: [80, 0, 160] as [number, number, number] },
    { position: 0.45, color: [200, 0, 80] as [number, number, number] },
    { position: 0.6, color: [255, 80, 0] as [number, number, number] },
    { position: 0.75, color: [255, 200, 0] as [number, number, number] },
    { position: 0.9, color: [255, 255, 150] as [number, number, number] },
    { position: 1, color: [255, 255, 255] as [number, number, number] },
  ],
  // Smooth two-tone gradients for tessellation patterns
  goldBlack: [
    { position: 0, color: [20, 15, 0] as [number, number, number] },
    { position: 0.2, color: [60, 45, 0] as [number, number, number] },
    { position: 0.4, color: [160, 130, 10] as [number, number, number] },
    { position: 0.5, color: [220, 190, 30] as [number, number, number] },
    { position: 0.6, color: [255, 230, 60] as [number, number, number] },
    { position: 0.8, color: [255, 245, 140] as [number, number, number] },
    { position: 1, color: [255, 250, 200] as [number, number, number] },
  ],
  redBlack: [
    { position: 0, color: [15, 0, 0] as [number, number, number] },
    { position: 0.2, color: [60, 5, 0] as [number, number, number] },
    { position: 0.4, color: [160, 20, 10] as [number, number, number] },
    { position: 0.5, color: [220, 40, 15] as [number, number, number] },
    { position: 0.6, color: [255, 80, 30] as [number, number, number] },
    { position: 0.8, color: [255, 140, 80] as [number, number, number] },
    { position: 1, color: [255, 200, 160] as [number, number, number] },
  ],
  greenBlack: [
    { position: 0, color: [0, 10, 0] as [number, number, number] },
    { position: 0.2, color: [0, 40, 5] as [number, number, number] },
    { position: 0.4, color: [10, 120, 20] as [number, number, number] },
    { position: 0.5, color: [30, 180, 40] as [number, number, number] },
    { position: 0.6, color: [60, 220, 70] as [number, number, number] },
    { position: 0.8, color: [140, 245, 140] as [number, number, number] },
    { position: 1, color: [200, 255, 210] as [number, number, number] },
  ],
  cyanBlack: [
    { position: 0, color: [0, 5, 10] as [number, number, number] },
    { position: 0.2, color: [0, 30, 50] as [number, number, number] },
    { position: 0.4, color: [0, 100, 150] as [number, number, number] },
    { position: 0.5, color: [0, 160, 210] as [number, number, number] },
    { position: 0.6, color: [40, 200, 240] as [number, number, number] },
    { position: 0.8, color: [140, 230, 250] as [number, number, number] },
    { position: 1, color: [210, 250, 255] as [number, number, number] },
  ],
  bwSmooth: [
    { position: 0, color: [0, 0, 0] as [number, number, number] },
    { position: 0.3, color: [60, 60, 60] as [number, number, number] },
    { position: 0.5, color: [140, 140, 140] as [number, number, number] },
    { position: 0.7, color: [210, 210, 210] as [number, number, number] },
    { position: 1, color: [255, 255, 255] as [number, number, number] },
  ],
}

// ── Scenes ───────────────────────────────────────────────────────────

export const SCENES: Scene[] = [
  // ─── Classics ───
  {
    label: 'Zircon Zity',
    seq: 'BBBBBBAAAAAA',
    state: scene({
      sequence: seq('BBBBBBAAAAAA'),
      center: [3.7, 2.95],
      zoom: 3.5,
      gradientStops: G.zirconZity,
    }),
  },
  {
    label: 'Zircon Zity II',
    seq: 'BBBBBBAAAAAA',
    state: scene({
      sequence: seq('BBBBBBAAAAAA'),
      center: [3.7, 2.95],
      zoom: 3.5,
      gradientStops: G.sunset,
    }),
  },
  {
    label: 'Zircon Deep',
    seq: 'BBBBBBAAAAAA',
    state: scene({
      sequence: seq('BBBBBBAAAAAA'),
      center: [3.564, 3.020],
      zoom: 50.0,
      gradientStops: G.thermal,
    }),
  },

  // ─── AB basic ───
  {
    label: 'Origin',
    seq: 'AB',
    state: scene({
      sequence: seq('AB'),
      center: [2.0, 2.0],
      zoom: 1.0,
      gradientStops: G.plasma,
    }),
  },
  {
    label: 'AB Ember',
    seq: 'AB',
    state: scene({
      sequence: seq('AB'),
      center: [3.3, 3.3],
      zoom: 4.0,
      gradientStops: G.ember,
    }),
  },
  {
    label: 'AB Neon',
    seq: 'AB',
    state: scene({
      sequence: seq('AB'),
      center: [3.5, 3.5],
      zoom: 6.0,
      gradientStops: G.neon,
    }),
  },

  // ─── AABAB ───
  {
    label: 'Coral Reef',
    seq: 'AABAB',
    state: scene({
      sequence: seq('AABAB'),
      center: [3.4, 3.4],
      zoom: 5.0,
      gradientStops: G.sunset,
    }),
  },
  {
    label: 'Coral Arctic',
    seq: 'AABAB',
    state: scene({
      sequence: seq('AABAB'),
      center: [3.6, 3.1],
      zoom: 8.0,
      gradientStops: G.arctic,
    }),
  },

  // ─── ABBA family ───
  {
    label: 'ABBA Classic',
    seq: 'ABBA',
    state: scene({
      sequence: seq('ABBA'),
      center: [3.5, 3.5],
      zoom: 4.0,
      gradientStops: G.stainedGlass,
    }),
  },
  {
    label: 'ABBA Rose',
    seq: 'ABBA',
    state: scene({
      sequence: seq('ABBA'),
      center: [3.7, 3.3],
      zoom: 8.0,
      gradientStops: G.rose,
    }),
  },
  {
    label: 'ABBA Thermal',
    seq: 'ABBA',
    state: scene({
      sequence: seq('ABBA'),
      center: [3.45, 3.55],
      zoom: 12.0,
      gradientStops: G.thermal,
    }),
  },

  // ─── ABBAAB ───
  {
    label: 'Stained Glass',
    seq: 'ABBAAB',
    state: scene({
      sequence: seq('ABBAAB'),
      center: [3.5, 3.5],
      zoom: 4.0,
      gradientStops: G.stainedGlass,
    }),
  },
  {
    label: 'ABBAAB UV',
    seq: 'ABBAAB',
    state: scene({
      sequence: seq('ABBAAB'),
      center: [3.6, 3.2],
      zoom: 6.0,
      gradientStops: G.ultraviolet,
    }),
  },

  // ─── BBAABA ───
  {
    label: 'Dendrite',
    seq: 'BBAABA',
    state: scene({
      sequence: seq('BBAABA'),
      center: [3.6, 3.2],
      zoom: 6.0,
      gradientStops: G.jungle,
    }),
  },
  {
    label: 'BBAABA Copper',
    seq: 'BBAABA',
    state: scene({
      sequence: seq('BBAABA'),
      center: [3.55, 3.35],
      zoom: 10.0,
      gradientStops: G.copper,
    }),
  },

  // ─── AABB family ───
  {
    label: 'AABB Ocean',
    seq: 'AABB',
    state: scene({
      sequence: seq('AABB'),
      center: [3.4, 3.4],
      zoom: 5.0,
      gradientStops: G.ocean,
    }),
  },
  {
    label: 'AABB Plasma',
    seq: 'AABB',
    state: scene({
      sequence: seq('AABB'),
      center: [3.6, 3.0],
      zoom: 8.0,
      gradientStops: G.plasma,
    }),
  },

  // ─── AABBAABB ───
  {
    label: 'AABBAABB Weave',
    seq: 'AABBAABB',
    state: scene({
      sequence: seq('AABBAABB'),
      center: [3.5, 3.2],
      zoom: 5.0,
      gradientStops: G.stainedGlass,
    }),
  },

  // ─── Long sequences ───
  {
    label: 'Triple Wave',
    seq: 'AAABBBAAABBB',
    state: scene({
      sequence: seq('AAABBBAAABBB'),
      center: [3.5, 3.0],
      zoom: 4.0,
      gradientStops: G.arctic,
    }),
  },
  {
    label: 'Triple Fire',
    seq: 'AAABBB',
    state: scene({
      sequence: seq('AAABBB'),
      center: [3.6, 3.1],
      zoom: 6.0,
      gradientStops: G.ember,
    }),
  },
  {
    label: 'Cascade',
    seq: 'AABBBA',
    state: scene({
      sequence: seq('AABBBA'),
      center: [3.5, 3.3],
      zoom: 5.0,
      gradientStops: G.ocean,
    }),
  },

  // ─── Asymmetric sequences ───
  {
    label: 'ABBB Sunset',
    seq: 'ABBB',
    state: scene({
      sequence: seq('ABBB'),
      center: [3.5, 3.5],
      zoom: 4.0,
      gradientStops: G.sunset,
    }),
  },
  {
    label: 'AAAB Jungle',
    seq: 'AAAB',
    state: scene({
      sequence: seq('AAAB'),
      center: [3.4, 3.6],
      zoom: 5.0,
      gradientStops: G.jungle,
    }),
  },
  {
    label: 'ABBBBA Rose',
    seq: 'ABBBBA',
    state: scene({
      sequence: seq('ABBBBA'),
      center: [3.5, 3.3],
      zoom: 6.0,
      gradientStops: G.rose,
    }),
  },

  // ─── Complex long sequences ───
  {
    label: 'Tapestry',
    seq: 'ABBAABBA',
    state: scene({
      sequence: seq('ABBAABBA'),
      center: [3.5, 3.3],
      zoom: 5.0,
      gradientStops: G.copper,
    }),
  },
  {
    label: 'Labyrinth',
    seq: 'AABABABB',
    state: scene({
      sequence: seq('AABABABB'),
      center: [3.5, 3.4],
      zoom: 6.0,
      gradientStops: G.ultraviolet,
    }),
  },
  {
    label: 'Filaments',
    seq: 'ABBABBA',
    state: scene({
      sequence: seq('ABBABBA'),
      center: [3.55, 3.25],
      zoom: 8.0,
      gradientStops: G.neon,
    }),
  },
  {
    label: 'Cathedral',
    seq: 'AABBAAB',
    state: scene({
      sequence: seq('AABBAAB'),
      center: [3.5, 3.5],
      zoom: 5.0,
      gradientStops: G.stainedGlass,
    }),
  },
  {
    label: 'Nebula',
    seq: 'ABABABAB',
    state: scene({
      sequence: seq('ABABABAB'),
      center: [3.4, 3.4],
      zoom: 4.0,
      gradientStops: G.plasma,
    }),
  },
  {
    label: 'Mono ABBA',
    seq: 'ABBA',
    state: scene({
      sequence: seq('ABBA'),
      center: [3.5, 3.5],
      zoom: 4.0,
      gradientStops: G.monochrome,
    }),
  },

  // ─── Tessellation / Long sequence patterns ───
  {
    label: 'Tessellation I',
    seq: 'AABBAABBAABBAABBAABBAABBAABBAABB',
    state: scene({
      sequence: seq('AABBAABBAABBAABBAABBAABBAABBAABB'),
      center: [3.2, 3.2],
      zoom: 1.5,
      gradientStops: G.goldBlack,
    }),
  },
  {
    label: 'Tessellation II',
    seq: 'ABBBABBBABBBABBBABBBABBBABBBABBB',
    state: scene({
      sequence: seq('ABBBABBBABBBABBBABBBABBBABBBABBB'),
      center: [3.0, 3.0],
      zoom: 1.2,
      gradientStops: G.goldBlack,
    }),
  },
  {
    label: 'Tessellation III',
    seq: 'AAABBBAAABBBAAABBBAAABBBAAABBBAAABBBAAABBBAAABBB',
    state: scene({
      sequence: seq('AAABBBAAABBBAAABBBAAABBBAAABBBAAABBBAAABBBAAABBB'),
      center: [3.0, 3.0],
      zoom: 1.2,
      gradientStops: G.goldBlack,
    }),
  },
  {
    label: 'Gold Weave',
    seq: 'ABBAABBAABBAABBAABBAABBAABBAABBAABBAABBAABBAABBA',
    state: scene({
      sequence: seq('ABBAABBAABBAABBAABBAABBAABBAABBAABBAABBAABBAABBA'),
      center: [3.3, 3.3],
      zoom: 1.8,
      gradientStops: G.goldBlack,
    }),
  },
  {
    label: 'Red Lattice',
    seq: 'AABBBAABBBAABBBAABBBAABBBAABBBAABBBAABBBAABBBAAB',
    state: scene({
      sequence: seq('AABBBAABBBAABBBAABBBAABBBAABBBAABBBAABBBAABBBAAB'),
      center: [3.2, 3.0],
      zoom: 1.5,
      gradientStops: G.redBlack,
    }),
  },
  {
    label: 'Green Circuit',
    seq: 'ABABABABABABABABABABABABABABABABABABABABABABABABABABABABABABABABABAB',
    state: scene({
      sequence: seq('ABABABABABABABABABABABABABABABABABABABABABABABABABABABABABABABABABAB'),
      center: [3.0, 3.0],
      zoom: 1.0,
      gradientStops: G.greenBlack,
    }),
  },
  {
    label: 'Cyan Grid',
    seq: 'AAAABBBBAAAABBBBAAAABBBBAAAABBBBAAAABBBBAAAABBBB',
    state: scene({
      sequence: seq('AAAABBBBAAAABBBBAAAABBBBAAAABBBBAAAABBBBAAAABBBB'),
      center: [3.0, 3.0],
      zoom: 1.2,
      gradientStops: G.cyanBlack,
    }),
  },
  {
    label: 'Interference',
    seq: 'AABABABBAABABABBAABABABBAABABABBAABABABBAABABABB',
    state: scene({
      sequence: seq('AABABABBAABABABBAABABABBAABABABBAABABABBAABABABB'),
      center: [3.2, 3.2],
      zoom: 1.5,
      gradientStops: G.goldBlack,
    }),
  },
  {
    label: 'Moiré',
    seq: 'ABBBBBABBBBBABBBBBABBBBBABBBBBABBBBBABBBBBABBBBB',
    state: scene({
      sequence: seq('ABBBBBABBBBBABBBBBABBBBBABBBBBABBBBBABBBBBABBBBB'),
      center: [3.0, 2.8],
      zoom: 1.3,
      gradientStops: G.bwSmooth,
    }),
  },
  {
    label: 'Fibonacci',
    seq: 'ABAABABAABAABABAABABAABAABABAABAABABAABABAABAABAB',
    state: scene({
      sequence: seq('ABAABABAABAABABAABABAABAABABAABAABABAABABAABAABAB'),
      center: [3.2, 3.0],
      zoom: 1.4,
      gradientStops: G.goldBlack,
    }),
  },
  {
    label: 'Cascade 64',
    seq: 'AAAAAAAABBBBBBBBBBBBBBBBAAAAAAAABBBBBBBBBBBBBBBBAAAAAAAABBBBBBBBBB',
    state: scene({
      sequence: seq('AAAAAAAABBBBBBBBBBBBBBBBAAAAAAAABBBBBBBBBBBBBBBBAAAAAAAABBBBBBBBBB'),
      center: [3.0, 3.0],
      zoom: 1.0,
      gradientStops: G.goldBlack,
    }),
  },
  {
    label: 'Zigzag',
    seq: 'ABBABAABABBABAABABBABAABABBABAABABBABAABABBABAAB',
    state: scene({
      sequence: seq('ABBABAABABBABAABABBABAABABBABAABABBABAABABBABAAB'),
      center: [3.3, 3.1],
      zoom: 1.5,
      gradientStops: G.redBlack,
    }),
  },
  {
    label: 'Pulse',
    seq: 'ABBBBBBBBBBBABBBBBBBBBBBABBBBBBBBBBBABBBBBBBBBBB',
    state: scene({
      sequence: seq('ABBBBBBBBBBBABBBBBBBBBBBABBBBBBBBBBBABBBBBBBBBBB'),
      center: [3.0, 3.0],
      zoom: 1.2,
      gradientStops: G.cyanBlack,
    }),
  },
  {
    label: 'Diamond',
    seq: 'AABBBBAAAABBBBAAAABBBBAAAABBBBAAAABBBBAAAABBBBAA',
    state: scene({
      sequence: seq('AABBBBAAAABBBBAAAABBBBAAAABBBBAAAABBBBAAAABBBBAA'),
      center: [3.2, 3.2],
      zoom: 1.4,
      gradientStops: G.greenBlack,
    }),
  },
  {
    label: 'Woven Gold',
    seq: 'AAABBAAABBAAABBAAABBAAABBAAABBAAABBAAABBAAABBAAA',
    state: scene({
      sequence: seq('AAABBAAABBAAABBAAABBAAABBAAABBAAABBAAABBAAABBAAA'),
      center: [3.4, 3.0],
      zoom: 1.6,
      gradientStops: G.goldBlack,
    }),
  },
  {
    label: 'Storm',
    seq: 'ABBABBABBABBABBABBABBABBABBABBABBABBABBABBABBABB',
    state: scene({
      sequence: seq('ABBABBABBABBABBABBABBABBABBABBABBABBABBABBABBABB'),
      center: [3.2, 3.0],
      zoom: 1.3,
      gradientStops: G.bwSmooth,
    }),
  },
]

export function ScenePresets() {
  const {
    setCenter, setZoom, setSequence, setGradientStops,
    setLambdaRange, setX0, setMapFunction, setExponent, setCValue, rendererRef,
  } = useAppState()

  const applyScene = (s: RendererState) => {
    rendererRef.current?.setState(s)
    setSequence(s.sequence)
    setGradientStops(s.gradientStops)
    setLambdaRange(s.lambdaRange)
    setX0(s.x0)
    setMapFunction(s.mapFunction)
    setExponent(s.exponent)
    setCValue(s.cValue)
    setCenter(s.center[0], s.center[1])
    setZoom(s.zoom)
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        {SCENES.map(scene => (
          <button
            key={scene.label}
            onClick={() => applyScene(scene.state)}
            className="text-left px-2 py-1.5 rounded bg-white/5 hover:bg-white/15 transition-colors group"
          >
            <div className="text-xs font-medium text-white/80 group-hover:text-white truncate">
              {scene.label}
            </div>
            <div className="text-[10px] text-white/35 font-mono truncate">
              {scene.seq}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
