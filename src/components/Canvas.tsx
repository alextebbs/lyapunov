import { useEffect, useRef } from 'react'
import { LyapunovRenderer } from '../renderer/renderer'
import { useAppState } from '../state/context'

export function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { rendererRef, center, zoom, sequence, gradientStops } = useAppState()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = new LyapunovRenderer(canvas)
    rendererRef.current = renderer

    // Apply initial state from URL
    renderer.setState({ center, zoom, sequence, gradientStops })

    return () => {
      renderer.destroy()
      rendererRef.current = null
    }
    // Only run on mount/unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
    />
  )
}
