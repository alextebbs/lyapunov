import { useState } from 'react'
import { SequenceEditor } from './SequenceEditor'
import { GradientEditor } from './GradientEditor'
import { ShareButton } from './ShareButton'
import { useAppState } from '../state/context'

export function Toolbar() {
  const [open, setOpen] = useState(true)
  const { center, zoom } = useAppState()

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(!open)}
        className="absolute top-3 right-3 z-20 w-8 h-8 rounded bg-black/50 backdrop-blur border border-white/20 text-white/80 hover:bg-black/70 flex items-center justify-center text-sm transition-colors"
        title={open ? 'Hide controls' : 'Show controls'}
      >
        {open ? '\u2715' : '\u2699'}
      </button>

      {/* Panel */}
      <div
        className={`absolute top-0 right-0 z-10 h-full w-72 bg-black/70 backdrop-blur-lg border-l border-white/10 transform transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="p-4 pt-14 space-y-6 overflow-y-auto h-full">
          {/* Title */}
          <div>
            <h1 className="text-sm font-semibold text-white">Lyapunov Explorer</h1>
            <p className="text-xs text-white/40 mt-1 font-mono">
              ({center[0].toFixed(6)}, {center[1].toFixed(6)}) z:{zoom.toFixed(2)}
            </p>
          </div>

          <SequenceEditor />
          <GradientEditor />

          <div className="border-t border-white/10 pt-4">
            <ShareButton />
          </div>

          {/* Gesture hints */}
          <div className="text-xs text-white/30 space-y-1">
            <p>Drag: Pan</p>
            <p>Scroll / Pinch: Zoom</p>
          </div>
        </div>
      </div>
    </>
  )
}
