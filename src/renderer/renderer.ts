import type { GradientStop, RendererState } from './types'
import { createWebGL2Context, createFullscreenQuad, resizeCanvas } from './context'
import { createProgram, getUniformLocations } from './shader'
import { createGradientTexture, uploadGradientTexture } from './gradient'
import { splitDouble, DOUBLE_EMULATION_THRESHOLD } from './double'
import { TileCache, PASS_ITERATIONS } from './tile'
import vertSource from '../shaders/lyapunov.vert'
import fragSource from '../shaders/lyapunov.frag'

const TILE_SIZE = 256
const FRAME_BUDGET_MS = 10 // max ms per frame for tile rendering

export class LyapunovRenderer {
  private canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext
  private program: WebGLProgram
  private uniforms: ReturnType<typeof getUniformLocations>
  private quad: { vao: WebGLVertexArrayObject; vbo: WebGLBuffer }
  private gradientTexture: WebGLTexture
  private tileCache: TileCache
  private animFrameId = 0
  private compositeProgram: WebGLProgram
  private compositeUniforms: ReturnType<typeof getUniformLocations>

  // State
  private _center: [number, number] = [2.5, 3.5]
  private _zoom = 1
  private _sequence: number[] = [0, 1] // AB
  private _gradientStops: GradientStop[] = [
    { position: 0, color: [0, 0, 40] },
    { position: 0.35, color: [0, 80, 200] },
    { position: 0.5, color: [255, 255, 255] },
    { position: 0.65, color: [255, 200, 0] },
    { position: 1, color: [128, 0, 0] },
  ]

  // Interaction state
  private isDragging = false
  private lastPointer: [number, number] = [0, 0]
  private velocity: [number, number] = [0, 0]
  private targetZoom = 1
  private animatedZoom = 1

  // Multi-touch state
  private isPinching = false
  private lastPinchDist = 0
  private lastPinchCenter: [number, number] = [0, 0]

  // Rendering state
  private settled = false
  private interacting = false
  private interactionTimeout: ReturnType<typeof setTimeout> | null = null
  private needsRecompute = true
  private lambdaMin = -2
  private lambdaMax = 2

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.gl = createWebGL2Context(canvas)
    this.quad = createFullscreenQuad(this.gl)

    // Compile shader programs
    this.program = createProgram(this.gl, vertSource, fragSource)
    this.uniforms = getUniformLocations(this.gl, this.program, [
      'uCenterHigh', 'uCenterLow', 'uZoom', 'uResolution',
      'uTileOffset', 'uTileSize',
      'uSequence', 'uSequenceLength', 'uIterations',
      'uGradient', 'uLambdaMin', 'uLambdaMax', 'uUseDouble',
    ])

    // Composite shader (draws tile textures to screen)
    this.compositeProgram = createProgram(this.gl, COMPOSITE_VERT, COMPOSITE_FRAG)
    this.compositeUniforms = getUniformLocations(this.gl, this.compositeProgram, [
      'uTexture', 'uOffset', 'uScale',
    ])

    this.gradientTexture = createGradientTexture(this.gl, this._gradientStops)
    this.tileCache = new TileCache(this.gl, TILE_SIZE)

    this.addEventListeners()
    resizeCanvas(this.canvas)
    this.start()
  }

  // -- Public API --

  get state(): RendererState {
    return {
      center: [...this._center],
      zoom: this._zoom,
      sequence: [...this._sequence],
      gradientStops: this._gradientStops.map(s => ({
        ...s,
        color: [...s.color] as [number, number, number],
      })),
    }
  }

  setCenter(x: number, y: number) {
    this._center = [x, y]
    this.needsRecompute = true
    this.tileCache.markAllDirty()
  }

  setZoom(zoom: number) {
    this._zoom = zoom
    this.targetZoom = zoom
    this.animatedZoom = zoom
    this.needsRecompute = true
    this.tileCache.markAllDirty()
  }

  setSequence(seq: number[]) {
    this._sequence = seq
    this.needsRecompute = true
    this.tileCache.invalidateAll()
  }

  setGradientStops(stops: GradientStop[]) {
    this._gradientStops = stops
    uploadGradientTexture(this.gl, this.gradientTexture, stops)
    // Gradient changes don't need fractal recompute — just re-composite
    this.settled = false
  }

  setState(state: Partial<RendererState>) {
    if (state.center) this._center = state.center
    if (state.zoom !== undefined) {
      this._zoom = state.zoom
      this.targetZoom = state.zoom
      this.animatedZoom = state.zoom
    }
    if (state.sequence) this._sequence = state.sequence
    if (state.gradientStops) {
      this._gradientStops = state.gradientStops
      uploadGradientTexture(this.gl, this.gradientTexture, state.gradientStops)
    }
    this.needsRecompute = true
    this.tileCache.invalidateAll()
  }

  private _onStateChange: ((state: RendererState) => void) | null = null

  onStateChange(cb: (state: RendererState) => void) {
    this._onStateChange = cb
  }

  private notifyStateChange() {
    this._onStateChange?.(this.state)
  }

  // -- Render Loop --

  private start() {
    const loop = () => {
      this.animFrameId = requestAnimationFrame(loop)
      this.frame()
    }
    this.animFrameId = requestAnimationFrame(loop)
  }

  private frame() {
    // Handle resize
    if (resizeCanvas(this.canvas)) {
      this.needsRecompute = true
      this.tileCache.markAllDirty()
    }

    // Animate zoom smoothly
    if (Math.abs(this.animatedZoom - this.targetZoom) > 0.001) {
      this.animatedZoom += (this.targetZoom - this.animatedZoom) * 0.15
      this.needsRecompute = true
      this.tileCache.markAllDirty()
    } else {
      this.animatedZoom = this.targetZoom
    }
    this._zoom = this.animatedZoom

    // Apply momentum/inertia for panning
    if (!this.isDragging && (Math.abs(this.velocity[0]) > 0.0001 || Math.abs(this.velocity[1]) > 0.0001)) {
      const viewWidth = 4 / this._zoom
      this._center[0] -= this.velocity[0] * viewWidth / this.canvas.width
      this._center[1] += this.velocity[1] * viewWidth / this.canvas.width
      this.velocity[0] *= 0.92
      this.velocity[1] *= 0.92
      this.needsRecompute = true
      this.tileCache.markAllDirty()
      this.notifyStateChange()
    }

    if (!this.needsRecompute && this.settled) return

    // Determine visible tile grid
    const cols = Math.ceil(this.canvas.width / TILE_SIZE)
    const rows = Math.ceil(this.canvas.height / TILE_SIZE)
    const useDouble = this._zoom > DOUBLE_EMULATION_THRESHOLD

    // Render tiles with frame budget
    const startTime = performance.now()
    let tilesRenderedThisFrame = 0
    const maxPassThisFrame = this.interacting ? 2 : PASS_ITERATIONS.length

    // Quantized zoom for tile keys
    const zoomLevel = Math.round(Math.log2(this._zoom) * 4)

    let allSettled = true

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (performance.now() - startTime > FRAME_BUDGET_MS) {
          allSettled = false
          break
        }

        const key = { col, row, zoom: zoomLevel }
        const tile = this.tileCache.create(key)

        if (tile.pass >= maxPassThisFrame && !tile.dirty) continue
        if (tile.pass >= PASS_ITERATIONS.length) continue

        allSettled = false

        // Determine iteration count for this pass
        const passIdx = Math.min(tile.pass, PASS_ITERATIONS.length - 1)
        const iterations = PASS_ITERATIONS[passIdx]!

        // Render to tile FBO
        this.renderTile(tile, col, row, cols, rows, iterations, useDouble)
        tile.pass++
        tile.dirty = false
        tilesRenderedThisFrame++
      }
      if (performance.now() - startTime > FRAME_BUDGET_MS) break
    }

    // Composite all tiles to screen
    this.composite(cols, rows, zoomLevel)

    this.settled = allSettled
    if (allSettled) {
      this.needsRecompute = false
    }
  }

  private renderTile(
    tile: { framebuffer: WebGLFramebuffer },
    col: number,
    row: number,
    totalCols: number,
    totalRows: number,
    iterations: number,
    useDouble: boolean,
  ) {
    const gl = this.gl

    gl.bindFramebuffer(gl.FRAMEBUFFER, tile.framebuffer)
    gl.viewport(0, 0, TILE_SIZE, TILE_SIZE)
    gl.useProgram(this.program)

    // View uniforms
    const [highX, lowX] = splitDouble(this._center[0])
    const [highY, lowY] = splitDouble(this._center[1])
    gl.uniform2f(this.uniforms.uCenterHigh!, highX, highY)
    gl.uniform2f(this.uniforms.uCenterLow!, lowX, lowY)
    gl.uniform1f(this.uniforms.uZoom!, this._zoom)
    gl.uniform2f(this.uniforms.uResolution!, this.canvas.width, this.canvas.height)

    // Tile position within viewport
    gl.uniform2f(this.uniforms.uTileOffset!, col / totalCols, row / totalRows)
    gl.uniform2f(this.uniforms.uTileSize!, 1 / totalCols, 1 / totalRows)

    // Fractal uniforms
    const seqArray = new Int32Array(64)
    for (let i = 0; i < Math.min(this._sequence.length, 64); i++) {
      seqArray[i] = this._sequence[i]!
    }
    gl.uniform1iv(this.uniforms.uSequence!, seqArray)
    gl.uniform1i(this.uniforms.uSequenceLength!, this._sequence.length)
    gl.uniform1i(this.uniforms.uIterations!, iterations)

    // Gradient
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.gradientTexture)
    gl.uniform1i(this.uniforms.uGradient!, 0)
    gl.uniform1f(this.uniforms.uLambdaMin!, this.lambdaMin)
    gl.uniform1f(this.uniforms.uLambdaMax!, this.lambdaMax)

    // Double emulation
    gl.uniform1i(this.uniforms.uUseDouble as WebGLUniformLocation, useDouble ? 1 : 0)

    // Draw
    gl.bindVertexArray(this.quad.vao)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    gl.bindVertexArray(null)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  private composite(cols: number, rows: number, zoomLevel: number) {
    const gl = this.gl

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.useProgram(this.compositeProgram)

    gl.bindVertexArray(this.quad.vao)

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const key = { col, row, zoom: zoomLevel }
        const tile = this.tileCache.get(key)
        if (!tile || tile.pass === 0) continue

        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, tile.texture)
        gl.uniform1i(this.compositeUniforms.uTexture!, 0)

        // Map tile to its screen position in clip space
        const x = (col / cols) * 2 - 1
        const y = (row / rows) * 2 - 1
        const w = (1 / cols) * 2
        const h = (1 / rows) * 2
        gl.uniform2f(this.compositeUniforms.uOffset!, x, y)
        gl.uniform2f(this.compositeUniforms.uScale!, w, h)

        gl.drawArrays(gl.TRIANGLES, 0, 6)
      }
    }

    gl.bindVertexArray(null)
  }

  // -- Event Handling --
  //
  // Strategy: touch events handle ALL touch interaction (1-finger pan,
  // 2-finger pinch+pan). Pointer events ONLY handle mouse (pointerType==='mouse').
  // This avoids the dual-firing problem where both touch and pointer events
  // fire for the same finger on mobile.

  private addEventListeners() {
    // Mouse only — pointer events filtered to mouse in handlers
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointermove', this.onPointerMove)
    this.canvas.addEventListener('pointerup', this.onPointerUp)
    this.canvas.addEventListener('pointercancel', this.onPointerUp)

    // Touch — handles ALL touch interaction
    this.canvas.addEventListener('touchstart', this.onTouchStart, { passive: false })
    this.canvas.addEventListener('touchmove', this.onTouchMove, { passive: false })
    this.canvas.addEventListener('touchend', this.onTouchEnd, { passive: false })
    this.canvas.addEventListener('touchcancel', this.onTouchEnd, { passive: false })

    // Mouse wheel zoom (desktop)
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false })

    // Prevent Safari proprietary gesture events
    this.canvas.addEventListener('gesturestart', preventDefault, { passive: false })
    this.canvas.addEventListener('gesturechange', preventDefault, { passive: false })
    this.canvas.addEventListener('gestureend', preventDefault, { passive: false })

    // Prevent pull-to-refresh and overscroll globally
    document.addEventListener('touchmove', preventDefaultIfCanvas, { passive: false })
  }

  removeEventListeners() {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointercancel', this.onPointerUp)
    this.canvas.removeEventListener('touchstart', this.onTouchStart)
    this.canvas.removeEventListener('touchmove', this.onTouchMove)
    this.canvas.removeEventListener('touchend', this.onTouchEnd)
    this.canvas.removeEventListener('touchcancel', this.onTouchEnd)
    this.canvas.removeEventListener('wheel', this.onWheel)
    this.canvas.removeEventListener('gesturestart', preventDefault)
    this.canvas.removeEventListener('gesturechange', preventDefault)
    this.canvas.removeEventListener('gestureend', preventDefault)
    document.removeEventListener('touchmove', preventDefaultIfCanvas)
  }

  // -- Pointer events (MOUSE ONLY) --

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    this.isDragging = true
    this.lastPointer = [e.clientX, e.clientY]
    this.velocity = [0, 0]
    this.canvas.setPointerCapture(e.pointerId)
    this.markInteracting()
  }

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || !this.isDragging) return

    const dx = e.clientX - this.lastPointer[0]
    const dy = e.clientY - this.lastPointer[1]

    this.velocity = [dx, dy]
    this.panBy(dx, dy)
    this.lastPointer = [e.clientX, e.clientY]
  }

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    this.isDragging = false
    this.markInteractionEnd()
  }

  // -- Touch events (ALL touch interaction) --

  private onTouchStart = (e: TouchEvent) => {
    e.preventDefault()
    this.markInteracting()

    if (e.touches.length === 1) {
      // Single finger — start drag
      this.isDragging = true
      this.isPinching = false
      this.lastPointer = [e.touches[0]!.clientX, e.touches[0]!.clientY]
      this.velocity = [0, 0]
    } else if (e.touches.length === 2) {
      // Two fingers — start pinch
      this.isPinching = true
      this.isDragging = false
      this.velocity = [0, 0]

      const [t0, t1] = [e.touches[0]!, e.touches[1]!]
      this.lastPinchDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY)
      this.lastPinchCenter = [
        (t0.clientX + t1.clientX) / 2,
        (t0.clientY + t1.clientY) / 2,
      ]
    }
  }

  private onTouchMove = (e: TouchEvent) => {
    e.preventDefault()

    if (e.touches.length === 1 && this.isDragging && !this.isPinching) {
      // Single finger drag
      const t = e.touches[0]!
      const dx = t.clientX - this.lastPointer[0]
      const dy = t.clientY - this.lastPointer[1]

      this.velocity = [dx, dy]
      this.panBy(dx, dy)
      this.lastPointer = [t.clientX, t.clientY]
    } else if (e.touches.length === 2 && this.isPinching) {
      // Two finger pinch + pan
      const [t0, t1] = [e.touches[0]!, e.touches[1]!]

      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY)
      const centerX = (t0.clientX + t1.clientX) / 2
      const centerY = (t0.clientY + t1.clientY) / 2

      // Zoom — applied directly (no animation) for instant response
      if (this.lastPinchDist > 0) {
        const scale = dist / this.lastPinchDist
        this.zoomAtDirect(centerX, centerY, scale)
      }

      // Pan from midpoint movement
      const dx = centerX - this.lastPinchCenter[0]
      const dy = centerY - this.lastPinchCenter[1]
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        this.panBy(dx, dy)
      }

      this.lastPinchDist = dist
      this.lastPinchCenter = [centerX, centerY]
      this.markInteracting()
    }
  }

  private onTouchEnd = (e: TouchEvent) => {
    e.preventDefault()

    if (e.touches.length === 0) {
      // All fingers lifted
      this.isDragging = false
      this.isPinching = false
      this.markInteractionEnd()
    } else if (e.touches.length === 1) {
      // Went from pinch to single finger — transition to drag
      this.isPinching = false
      this.lastPinchDist = 0
      this.isDragging = true
      this.lastPointer = [e.touches[0]!.clientX, e.touches[0]!.clientY]
      this.velocity = [0, 0]
    }
  }

  // -- Shared pan/zoom helpers --

  private panBy(dx: number, dy: number) {
    const viewWidth = 4 / this._zoom
    const fractalDx = (dx / this.canvas.clientWidth) * viewWidth
    const fractalDy = (dy / this.canvas.clientHeight) * (viewWidth * this.canvas.height / this.canvas.width)

    this._center[0] -= fractalDx
    this._center[1] += fractalDy

    this.needsRecompute = true
    this.tileCache.markAllDirty()
    this.notifyStateChange()
    this.markInteracting()
  }

  /**
   * Zoom with animation (for mouse wheel — small discrete steps feel better animated).
   */
  private zoomAt(clientX: number, clientY: number, scaleFactor: number) {
    const rect = this.canvas.getBoundingClientRect()
    const cursorX = (clientX - rect.left) / rect.width
    const cursorY = 1 - (clientY - rect.top) / rect.height

    const viewWidth = 4 / this._zoom
    const aspect = this.canvas.width / this.canvas.height
    const viewHeight = viewWidth / aspect

    const fracX = this._center[0] + (cursorX - 0.5) * viewWidth
    const fracY = this._center[1] + (cursorY - 0.5) * viewHeight

    this.targetZoom *= scaleFactor

    const newViewWidth = 4 / this.targetZoom
    const newViewHeight = newViewWidth / aspect
    this._center[0] = fracX - (cursorX - 0.5) * newViewWidth
    this._center[1] = fracY - (cursorY - 0.5) * newViewHeight

    this.needsRecompute = true
    this.tileCache.markAllDirty()
    this.notifyStateChange()
  }

  /**
   * Zoom applied instantly (for pinch — fingers ARE the animation,
   * any lerp/delay feels laggy and wrong).
   */
  private zoomAtDirect(clientX: number, clientY: number, scaleFactor: number) {
    const rect = this.canvas.getBoundingClientRect()
    const cursorX = (clientX - rect.left) / rect.width
    const cursorY = 1 - (clientY - rect.top) / rect.height

    const viewWidth = 4 / this._zoom
    const aspect = this.canvas.width / this.canvas.height
    const viewHeight = viewWidth / aspect

    const fracX = this._center[0] + (cursorX - 0.5) * viewWidth
    const fracY = this._center[1] + (cursorY - 0.5) * viewHeight

    // Apply directly to all zoom values — no animation
    const newZoom = this._zoom * scaleFactor
    this._zoom = newZoom
    this.targetZoom = newZoom
    this.animatedZoom = newZoom

    const newViewWidth = 4 / newZoom
    const newViewHeight = newViewWidth / aspect
    this._center[0] = fracX - (cursorX - 0.5) * newViewWidth
    this._center[1] = fracY - (cursorY - 0.5) * newViewHeight

    this.needsRecompute = true
    this.tileCache.markAllDirty()
    this.notifyStateChange()
  }

  // -- Mouse wheel (desktop) --

  private onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1
    this.zoomAt(e.clientX, e.clientY, zoomDelta)
    this.markInteracting()
    this.markInteractionEnd()
  }

  private markInteracting() {
    this.interacting = true
    this.settled = false
    if (this.interactionTimeout) clearTimeout(this.interactionTimeout)
  }

  private markInteractionEnd() {
    if (this.interactionTimeout) clearTimeout(this.interactionTimeout)
    this.interactionTimeout = setTimeout(() => {
      this.interacting = false
      this.settled = false
      for (const tile of this.tileCache.all()) {
        if (tile.pass < PASS_ITERATIONS.length) {
          tile.dirty = true
        }
      }
    }, 150)
  }

  destroy() {
    cancelAnimationFrame(this.animFrameId)
    this.removeEventListeners()
    this.tileCache.destroy()
    this.gl.deleteProgram(this.program)
    this.gl.deleteProgram(this.compositeProgram)
    this.gl.deleteTexture(this.gradientTexture)
    this.gl.deleteBuffer(this.quad.vbo)
    this.gl.deleteVertexArray(this.quad.vao)
    this.gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}

// -- Helpers for preventing default touch behaviors --

function preventDefault(e: Event) {
  e.preventDefault()
}

function preventDefaultIfCanvas(e: Event) {
  if (e.target instanceof HTMLCanvasElement) {
    e.preventDefault()
  }
}

// -- Composite shader (blits tile textures to screen) --

const COMPOSITE_VERT = `#version 300 es
layout(location = 0) in vec2 aPosition;
uniform vec2 uOffset;
uniform vec2 uScale;
out vec2 vUV;
void main() {
  vUV = aPosition * 0.5 + 0.5;
  vec2 pos = uOffset + (aPosition * 0.5 + 0.5) * uScale;
  gl_Position = vec4(pos, 0.0, 1.0);
}
`

const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uTexture;
void main() {
  fragColor = texture(uTexture, vUV);
}
`
