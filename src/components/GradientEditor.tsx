import { useState, useCallback, useRef } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { useAppState } from '../state/context'
import type { GradientStop } from '../renderer/types'

const PRESETS: { label: string; stops: GradientStop[] }[] = [
  {
    label: 'Classic',
    stops: [
      { position: 0, color: [0, 0, 40] },
      { position: 0.35, color: [0, 80, 200] },
      { position: 0.5, color: [255, 255, 255] },
      { position: 0.65, color: [255, 200, 0] },
      { position: 1, color: [128, 0, 0] },
    ],
  },
  {
    label: 'Fire',
    stops: [
      { position: 0, color: [0, 0, 0] },
      { position: 0.33, color: [180, 30, 0] },
      { position: 0.66, color: [255, 180, 0] },
      { position: 1, color: [255, 255, 200] },
    ],
  },
  {
    label: 'Ocean',
    stops: [
      { position: 0, color: [0, 0, 30] },
      { position: 0.5, color: [0, 100, 180] },
      { position: 1, color: [200, 255, 255] },
    ],
  },
  {
    label: 'Mono',
    stops: [
      { position: 0, color: [0, 0, 0] },
      { position: 1, color: [255, 255, 255] },
    ],
  },
]

function colorToHex(c: [number, number, number]): string {
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('')
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function gradientToCSS(stops: GradientStop[]): string {
  const sorted = [...stops].sort((a, b) => a.position - b.position)
  const parts = sorted.map(s => `rgb(${s.color.join(',')}) ${(s.position * 100).toFixed(1)}%`)
  return `linear-gradient(to right, ${parts.join(', ')})`
}

export function GradientEditor() {
  const { gradientStops, setGradientStops } = useAppState()
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<number | null>(null)

  const updateStop = useCallback(
    (index: number, updates: Partial<GradientStop>) => {
      const next = gradientStops.map((s, i) =>
        i === index ? { ...s, ...updates } : s,
      )
      setGradientStops(next)
    },
    [gradientStops, setGradientStops],
  )

  const addStop = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!barRef.current) return
      const rect = barRef.current.getBoundingClientRect()
      const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))

      // Interpolate color at this position
      const sorted = [...gradientStops].sort((a, b) => a.position - b.position)
      let color: [number, number, number] = [128, 128, 128]
      for (let i = 0; i < sorted.length - 1; i++) {
        if (position >= sorted[i]!.position && position <= sorted[i + 1]!.position) {
          const t =
            (position - sorted[i]!.position) / (sorted[i + 1]!.position - sorted[i]!.position)
          color = sorted[i]!.color.map((c, j) =>
            Math.round(c + (sorted[i + 1]!.color[j]! - c) * t),
          ) as [number, number, number]
          break
        }
      }

      setGradientStops([...gradientStops, { position, color }])
      setSelectedIndex(gradientStops.length)
    },
    [gradientStops, setGradientStops],
  )

  const removeStop = useCallback(
    (index: number) => {
      if (gradientStops.length <= 2) return
      setGradientStops(gradientStops.filter((_, i) => i !== index))
      setSelectedIndex(null)
    },
    [gradientStops, setGradientStops],
  )

  const handleStopDrag = useCallback(
    (e: React.PointerEvent, index: number) => {
      e.stopPropagation()
      e.preventDefault()
      draggingRef.current = index
      setSelectedIndex(index)

      const onMove = (me: PointerEvent) => {
        if (draggingRef.current === null || !barRef.current) return
        const rect = barRef.current.getBoundingClientRect()
        const position = Math.max(0, Math.min(1, (me.clientX - rect.left) / rect.width))
        updateStop(draggingRef.current, { position })
      }

      const onUp = () => {
        draggingRef.current = null
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [updateStop],
  )

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-white/60 uppercase tracking-wider">
        Color Gradient
      </label>

      {/* Gradient bar */}
      <div
        ref={barRef}
        className="relative h-6 rounded cursor-crosshair border border-white/20"
        style={{ background: gradientToCSS(gradientStops) }}
        onClick={addStop}
      >
        {/* Stops */}
        {gradientStops.map((stop, i) => (
          <Popover.Root key={i} open={selectedIndex === i} onOpenChange={open => !open && setSelectedIndex(null)}>
            <Popover.Trigger asChild>
              <div
                className={`absolute top-0 w-3 h-full cursor-grab active:cursor-grabbing ${
                  selectedIndex === i ? 'ring-1 ring-white' : ''
                }`}
                style={{
                  left: `calc(${stop.position * 100}% - 6px)`,
                  background: colorToHex(stop.color),
                  borderRadius: 2,
                  border: '1px solid rgba(255,255,255,0.5)',
                }}
                onPointerDown={e => handleStopDrag(e, i)}
                onClick={e => {
                  e.stopPropagation()
                  setSelectedIndex(selectedIndex === i ? null : i)
                }}
              />
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className="bg-gray-900 border border-white/20 rounded-lg p-3 shadow-xl z-50"
                sideOffset={8}
              >
                <div className="space-y-2">
                  <input
                    type="color"
                    value={colorToHex(stop.color)}
                    onChange={e => updateStop(i, { color: hexToRgb(e.target.value) })}
                    className="w-full h-8 cursor-pointer rounded"
                  />
                  {gradientStops.length > 2 && (
                    <button
                      onClick={() => removeStop(i)}
                      className="w-full text-xs text-red-400 hover:text-red-300 py-1"
                    >
                      Remove stop
                    </button>
                  )}
                </div>
                <Popover.Arrow className="fill-gray-900" />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        ))}
      </div>

      {/* Presets */}
      <div className="flex gap-1 flex-wrap">
        {PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => setGradientStops(p.stops)}
            className="px-2 py-0.5 rounded text-xs bg-white/5 text-white/50 hover:bg-white/10 transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}
