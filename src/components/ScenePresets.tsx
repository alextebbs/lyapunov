import { useAppState } from '../state/context'
import type { RendererState } from '../renderer/types'

/**
 * Curated scene presets — each sets sequence, gradient, center, and zoom
 * to show a particularly beautiful region of the Lyapunov fractal.
 */
const SCENES: { label: string; description: string; state: RendererState }[] = [
  {
    label: 'Zircon Zity',
    description: 'Classic arch pattern',
    state: {
      sequence: [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0], // BBBBBBAAAAAA
      center: [3.7, 2.95],
      zoom: 3.5,
      gradientStops: [
        { position: 0, color: [10, 5, 0] },
        { position: 0.35, color: [200, 170, 0] },
        { position: 0.48, color: [255, 220, 50] },
        { position: 0.5, color: [0, 0, 0] },
        { position: 0.52, color: [0, 20, 80] },
        { position: 0.65, color: [0, 50, 180] },
        { position: 1, color: [0, 0, 60] },
      ],
    },
  },
  {
    label: 'Full Parameter Space',
    description: 'AB over [0,4]x[0,4]',
    state: {
      sequence: [0, 1], // AB
      center: [2.0, 2.0],
      zoom: 1.0,
      gradientStops: [
        { position: 0, color: [0, 0, 0] },
        { position: 0.25, color: [80, 0, 120] },
        { position: 0.45, color: [200, 50, 0] },
        { position: 0.5, color: [255, 255, 200] },
        { position: 0.55, color: [0, 100, 50] },
        { position: 0.75, color: [0, 30, 120] },
        { position: 1, color: [0, 0, 20] },
      ],
    },
  },
  {
    label: 'Coral Reef',
    description: 'AABAB with warm tones',
    state: {
      sequence: [0, 0, 1, 0, 1], // AABAB
      center: [3.4, 3.4],
      zoom: 5.0,
      gradientStops: [
        { position: 0, color: [5, 0, 10] },
        { position: 0.2, color: [120, 20, 60] },
        { position: 0.4, color: [220, 80, 20] },
        { position: 0.5, color: [255, 240, 200] },
        { position: 0.6, color: [20, 120, 100] },
        { position: 0.8, color: [10, 40, 80] },
        { position: 1, color: [0, 5, 20] },
      ],
    },
  },
  {
    label: 'Stained Glass',
    description: 'ABBAAB complex symmetry',
    state: {
      sequence: [0, 1, 1, 0, 0, 1], // ABBAAB
      center: [3.5, 3.5],
      zoom: 4.0,
      gradientStops: [
        { position: 0, color: [10, 0, 30] },
        { position: 0.15, color: [80, 0, 140] },
        { position: 0.3, color: [200, 30, 80] },
        { position: 0.48, color: [255, 200, 50] },
        { position: 0.5, color: [240, 240, 240] },
        { position: 0.52, color: [50, 200, 100] },
        { position: 0.7, color: [0, 80, 180] },
        { position: 0.85, color: [0, 20, 100] },
        { position: 1, color: [5, 0, 20] },
      ],
    },
  },
  {
    label: 'Dendrite',
    description: 'BBAABA branching filaments',
    state: {
      sequence: [1, 1, 0, 0, 1, 0], // BBAABA
      center: [3.6, 3.2],
      zoom: 6.0,
      gradientStops: [
        { position: 0, color: [0, 0, 0] },
        { position: 0.3, color: [0, 80, 60] },
        { position: 0.48, color: [100, 255, 180] },
        { position: 0.5, color: [255, 255, 255] },
        { position: 0.52, color: [255, 200, 100] },
        { position: 0.7, color: [120, 40, 0] },
        { position: 1, color: [20, 5, 0] },
      ],
    },
  },
  {
    label: 'Deep Zoom',
    description: 'Zoomed into Zircon Zity',
    state: {
      sequence: [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0], // BBBBBBAAAAAA
      center: [3.564, 3.020],
      zoom: 50.0,
      gradientStops: [
        { position: 0, color: [0, 0, 0] },
        { position: 0.15, color: [40, 0, 60] },
        { position: 0.3, color: [160, 20, 80] },
        { position: 0.48, color: [255, 180, 50] },
        { position: 0.5, color: [255, 255, 255] },
        { position: 0.52, color: [50, 180, 255] },
        { position: 0.7, color: [0, 40, 120] },
        { position: 1, color: [0, 0, 20] },
      ],
    },
  },
  {
    label: 'Long Sequence',
    description: 'AAABBBAAABBB intricate',
    state: {
      sequence: [0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1], // AAABBBAAABBB
      center: [3.5, 3.0],
      zoom: 4.0,
      gradientStops: [
        { position: 0, color: [5, 5, 15] },
        { position: 0.2, color: [20, 60, 140] },
        { position: 0.4, color: [60, 160, 200] },
        { position: 0.5, color: [200, 200, 200] },
        { position: 0.6, color: [200, 160, 60] },
        { position: 0.8, color: [140, 40, 10] },
        { position: 1, color: [30, 5, 0] },
      ],
    },
  },
  {
    label: 'Neon',
    description: 'ABAB electric colors',
    state: {
      sequence: [0, 1, 0, 1], // ABAB
      center: [3.2, 3.2],
      zoom: 3.0,
      gradientStops: [
        { position: 0, color: [0, 0, 0] },
        { position: 0.25, color: [255, 0, 100] },
        { position: 0.48, color: [255, 255, 0] },
        { position: 0.5, color: [255, 255, 255] },
        { position: 0.52, color: [0, 255, 255] },
        { position: 0.75, color: [100, 0, 255] },
        { position: 1, color: [0, 0, 0] },
      ],
    },
  },
]

export function ScenePresets() {
  const { setCenter, setZoom, setSequence, setGradientStops, rendererRef } = useAppState()

  const applyScene = (scene: RendererState) => {
    // Set all state at once via renderer (avoids multiple re-renders)
    rendererRef.current?.setState(scene)

    // Sync React state
    setSequence(scene.sequence)
    setGradientStops(scene.gradientStops)
    setCenter(scene.center[0], scene.center[1])
    setZoom(scene.zoom)
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-white/60 uppercase tracking-wider">
        Scene Presets
      </label>
      <div className="grid grid-cols-2 gap-1.5">
        {SCENES.map(scene => (
          <button
            key={scene.label}
            onClick={() => applyScene(scene.state)}
            className="text-left px-2 py-1.5 rounded bg-white/5 hover:bg-white/10 transition-colors group"
          >
            <div className="text-xs font-medium text-white/80 group-hover:text-white">
              {scene.label}
            </div>
            <div className="text-[10px] text-white/40">{scene.description}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
