import { createContext, useContext, useCallback, useRef, useEffect, useState, type ReactNode } from 'react'
import type { GradientStop, RendererState } from '../renderer/types'
import { LyapunovRenderer } from '../renderer/renderer'
import { serializeState, deserializeState } from '../lib/url'

interface AppState extends RendererState {
  setCenter: (x: number, y: number) => void
  setZoom: (z: number) => void
  setSequence: (seq: number[]) => void
  setGradientStops: (stops: GradientStop[]) => void
  rendererRef: React.MutableRefObject<LyapunovRenderer | null>
}

const AppContext = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const rendererRef = useRef<LyapunovRenderer | null>(null)
  const urlUpdateTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Initialize from URL
  const initial = deserializeState(window.location.hash)
  const [center, setCenterState] = useState<[number, number]>(initial.center)
  const [zoom, setZoomState] = useState(initial.zoom)
  const [sequence, setSequenceState] = useState(initial.sequence)
  const [gradientStops, setGradientStopsState] = useState(initial.gradientStops)

  const updateUrl = useCallback((state: RendererState) => {
    if (urlUpdateTimer.current) clearTimeout(urlUpdateTimer.current)
    urlUpdateTimer.current = setTimeout(() => {
      const hash = serializeState(state)
      window.history.replaceState(null, '', hash)
    }, 500)
  }, [])

  const setCenter = useCallback((x: number, y: number) => {
    setCenterState([x, y])
    rendererRef.current?.setCenter(x, y)
    updateUrl({ center: [x, y], zoom, sequence, gradientStops })
  }, [zoom, sequence, gradientStops, updateUrl])

  const setZoom = useCallback((z: number) => {
    setZoomState(z)
    rendererRef.current?.setZoom(z)
    updateUrl({ center, zoom: z, sequence, gradientStops })
  }, [center, sequence, gradientStops, updateUrl])

  const setSequence = useCallback((seq: number[]) => {
    setSequenceState(seq)
    rendererRef.current?.setSequence(seq)
    updateUrl({ center, zoom, sequence: seq, gradientStops })
  }, [center, zoom, gradientStops, updateUrl])

  const setGradientStops = useCallback((stops: GradientStop[]) => {
    setGradientStopsState(stops)
    rendererRef.current?.setGradientStops(stops)
    updateUrl({ center, zoom, sequence, gradientStops: stops })
  }, [center, zoom, sequence, updateUrl])

  // Listen for renderer state changes (from direct interaction like panning)
  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) return
    renderer.onStateChange((state) => {
      setCenterState(state.center)
      setZoomState(state.zoom)
      updateUrl(state)
    })
  }, [updateUrl])

  // Listen for hash changes (back/forward navigation)
  useEffect(() => {
    const handler = () => {
      const state = deserializeState(window.location.hash)
      setCenterState(state.center)
      setZoomState(state.zoom)
      setSequenceState(state.sequence)
      setGradientStopsState(state.gradientStops)
      rendererRef.current?.setState(state)
    }
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  return (
    <AppContext.Provider
      value={{
        center,
        zoom,
        sequence,
        gradientStops,
        setCenter,
        setZoom,
        setSequence,
        setGradientStops,
        rendererRef,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useAppState() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppState must be used within AppProvider')
  return ctx
}
