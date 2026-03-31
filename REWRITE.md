# Lyapunov Explorer — Rewrite Plan

## Vision

A browser-based, infinitely zoomable Lyapunov fractal explorer. Navigation should feel like Google Earth — fluid panning, smooth zooming, crisp detail at every scale. The fractal sequence and color palette are fully configurable, and the entire view state is shareable via URL.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime / Package Manager | Bun |
| Build | Vite |
| Language | TypeScript (strict) |
| UI Framework | React 18 |
| Styling | Tailwind CSS 4 |
| UI Components | Radix UI / shadcn/ui |
| Rendering | Custom WebGL 2 renderer (no dependencies) |
| Shaders | GLSL 300 es (via vite-plugin-glsl) |

**Removed:** `react-shaders` dependency — replaced entirely by our own renderer.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│  React UI Layer                                  │
│  ┌───────────┐ ┌────────────┐ ┌───────────────┐ │
│  │ Sequence   │ │ Gradient   │ │ Share / URL   │ │
│  │ Editor     │ │ Editor     │ │ Sync          │ │
│  └─────┬─────┘ └─────┬──────┘ └──────┬────────┘ │
│        │              │               │          │
│        ▼              ▼               ▼          │
│  ┌──────────────────────────────────────────┐    │
│  │          State Manager (React context)   │    │
│  │  sequence, gradient, center, zoom, tiles │    │
│  └─────────────────┬────────────────────────┘    │
│                    │                             │
│        ┌───────────▼────────────┐                │
│        │   <Canvas> component   │                │
│        │   (manages WebGL ctx)  │                │
│        └───────────┬────────────┘                │
└────────────────────│────────────────────────────┘
                     │
        ┌────────────▼────────────────┐
        │      Tile Renderer          │
        │  ┌──────┐ ┌──────┐ ┌─────┐ │
        │  │Tile 0│ │Tile 1│ │ ... │ │
        │  └──────┘ └──────┘ └─────┘ │
        │                             │
        │  - tile shader program      │
        │  - gradient 1D texture      │
        │  - per-tile uniforms        │
        │  - tile cache (LRU)         │
        └─────────────────────────────┘
```

---

## Phase 1: Project Scaffolding

- [ ] Remove `react-shaders` dependency
- [ ] Install Tailwind CSS 4, Radix UI primitives, shadcn/ui
- [ ] Switch to Bun as package manager (`bun install`, `bunx` for scripts)
- [ ] Set up Tailwind config, global styles
- [ ] Verify Vite + Bun dev server works
- [ ] Clean out old `src/shader/` directory (texture.ts, uniforms.ts, logging.ts, old index.tsx)
- [ ] Create new directory structure:
  ```
  src/
    renderer/          # WebGL renderer (zero React knowledge)
      context.ts       # WebGL context setup + helpers
      shader.ts        # Compile/link shader programs
      tile.ts          # Tile lifecycle: create, render, cache, evict
      gradient.ts      # Rasterize gradient stops → 1D texture
      double.ts        # Double-float emulation math (ds_add, ds_mul, etc.)
      types.ts         # Shared types
    shaders/
      lyapunov.frag    # Fragment shader — Lyapunov computation + gradient lookup
      lyapunov.vert    # Vertex shader — fullscreen quad with tile offset
      double.glsl      # GLSL double-float library (included via #pragma)
    components/
      Canvas.tsx        # Owns <canvas>, WebGL lifecycle, rAF loop
      SequenceEditor.tsx
      GradientEditor.tsx
      Toolbar.tsx
      ShareButton.tsx
    hooks/
      useViewState.ts   # Center, zoom, derived tile coords
      useUrlSync.ts     # Bidirectional URL ↔ state sync
      useGradient.ts    # Gradient stops state + 1D texture generation
      useSequence.ts    # AB sequence state
    state/
      context.tsx       # React context provider combining all state
    lib/
      url.ts            # URL serialization/deserialization
      math.ts           # Viewport ↔ fractal coordinate math
    App.tsx
    main.tsx
    index.css
  ```

---

## Phase 2: Core Renderer

### 2a. WebGL Bootstrapping (`renderer/context.ts`, `renderer/shader.ts`)

- [ ] Create WebGL 2 context with appropriate attributes (antialias off for perf, alpha off)
- [ ] Shader compilation + linking helpers with error reporting
- [ ] Fullscreen quad geometry (single triangle strip, reused for all tiles)
- [ ] Clean teardown on unmount (delete program, lose context)

### 2b. Lyapunov Fragment Shader (`shaders/lyapunov.frag`)

The shader computes the Lyapunov exponent λ for each pixel:

```
For each pixel (a, b) in parameter space:
  x = 0.5
  λ = 0
  For n iterations:
    r = sequence[n % seqLength] == 0 ? a : b   // A→a, B→b
    x = r * x * (1 - x)                         // logistic map
    λ += log(abs(r * (1 - 2*x)))                // exponent accumulation
  λ /= totalIterations
  color = texture(gradientTex, remap(λ))         // gradient lookup
```

Key uniforms:
```glsl
uniform vec2  uCenterHigh;      // high bits of center (double emulation)
uniform vec2  uCenterLow;       // low bits of center
uniform float uZoom;            // current zoom level
uniform vec2  uTileOffset;      // this tile's offset from center
uniform vec2  uResolution;      // canvas resolution
uniform int   uSequence[64];    // AB sequence (0 = A, 1 = B)
uniform int   uSequenceLength;  // actual length
uniform int   uIterations;      // iteration count (scales with zoom)
uniform sampler2D uGradient;    // 1D gradient texture
uniform float uLambdaMin;       // exponent range for gradient mapping
uniform float uLambdaMax;
```

- [ ] Implement basic Lyapunov computation (single precision first)
- [ ] Gradient texture sampling with configurable exponent range remapping
- [ ] Verify correctness against known Lyapunov images for "AB" sequence

### 2c. Double-Float Emulation (`renderer/double.ts`, `shaders/double.glsl`)

When zoom exceeds ~10^5, 32-bit floats lose enough precision that the fractal becomes blocky. Double-float emulation represents each number as the unevaluated sum of two floats (a "high" and "low" part), giving ~48 bits of mantissa (~14 decimal digits).

GLSL library (`double.glsl`):
```glsl
// A double-float is stored as vec2(high, low) where value = high + low
vec2 ds_set(float a);                    // float → double-float
vec2 ds_add(vec2 a, vec2 b);             // addition
vec2 ds_mul(vec2 a, vec2 b);             // multiplication
vec2 ds_sub(vec2 a, vec2 b);             // subtraction
float ds_compare(vec2 a, vec2 b);        // comparison
```

Implementation uses Dekker's algorithm for error-free transformations:
- `TwoSum` for addition
- `TwoProd` (via `fma` where available, Dekker split otherwise) for multiplication

- [ ] Implement GLSL double-float library
- [ ] Implement JS-side double-float splitting for uniform upload
- [ ] Shader automatically uses double-float path when zoom > threshold
- [ ] Verify precision: fractal detail should remain crisp at extreme zoom levels

---

## Phase 3: Tile System — The Key to Fluid Navigation

This is the most critical system. The goal: **zero perceived lag** when panning or zooming.

### 3a. Tile Grid & Coordinate System (`renderer/tile.ts`)

The visible viewport is divided into a grid of tiles (e.g., 4x4 or 8x8). Each tile is a region of fractal parameter space rendered to a portion of the canvas.

```
Viewport (canvas)
┌──────┬──────┬──────┬──────┐
│ T(0,0)│T(1,0)│T(2,0)│T(3,0)│
├──────┼──────┼──────┼──────┤
│ T(0,1)│T(1,1)│T(2,1)│T(3,1)│
├──────┼──────┼──────┼──────┤
│ T(0,2)│T(1,2)│T(2,2)│T(3,2)│
├──────┼──────┼──────┼──────┤
│ T(0,3)│T(1,3)│T(2,3)│T(3,3)│
└──────┴──────┴──────┴──────┘
```

Each tile knows:
- Its fractal-space bounding box (center + extent)
- Its zoom level
- Its render state: `pending | rendering | done`
- Its framebuffer / texture (rendered result)

### 3b. Progressive Rendering

Each tile renders in multiple passes with increasing iteration counts:

| Pass | Iterations | Purpose |
|------|-----------|---------|
| 1 | 32 | Instant preview — something on screen within one frame |
| 2 | 128 | Decent detail — visually "close enough" for most areas |
| 3 | 512 | High quality — fine structure visible |
| 4 | 2048+ | Final — full detail at current zoom (scales with zoom depth) |

Implementation:
- [ ] Each tile renders to its own framebuffer/texture (FBO)
- [ ] Passes are spread across frames — render one pass per tile per frame, round-robin
- [ ] A compositing pass blits all tile textures to the screen each frame
- [ ] During interaction (pan/zoom), only passes 1-2 run. Full refinement happens when idle.
- [ ] A "dirty" flag system marks which tiles need re-rendering after view changes

### 3c. Tile Cache (LRU)

- [ ] Cache rendered tile textures keyed by `(centerX, centerY, zoom, sequence, gradientHash)`
- [ ] LRU eviction — keep ~64-128 tiles in GPU memory
- [ ] When panning, previously-rendered tiles that scroll back into view are instant
- [ ] When zooming out, cached parent tiles provide immediate low-res coverage

### 3d. Smooth Pan & Zoom Interaction

This is where the "Google Earth" feel comes from. Every interaction must produce immediate visual feedback, even before new tiles are computed.

**Panning:**
- [ ] Mouse drag / touch drag translates the viewport
- [ ] On drag, the existing rendered tiles are **shifted on screen via CSS transform or viewport uniform offset** — zero GPU re-rendering needed for the shift itself
- [ ] New tiles entering the viewport are queued for rendering (preview pass first)
- [ ] Momentum/inertia: on release, velocity decays smoothly (ease-out) so panning feels physical

**Zooming:**
- [ ] Scroll wheel / pinch-to-zoom
- [ ] Zoom targets the cursor position (not center of screen)
- [ ] On zoom, the existing rendered image is **scaled via CSS transform** as an instant preview
- [ ] New tiles at the target zoom level are computed in the background
- [ ] Smooth animated zoom transitions (interpolate zoom level over ~200ms)
- [ ] The CSS-transformed preview is replaced tile-by-tile as higher-res tiles complete
- [ ] Minimum frame budget: never let tile computation block the compositor. If a frame takes >12ms, defer remaining tiles to next frame.

**Zoom Level Quantization:**
- [ ] Internally, zoom snaps to discrete levels (like map zoom levels) for tile caching
- [ ] Between discrete levels, CSS transform scaling provides smooth visual interpolation
- [ ] This means tiles are only re-computed at zoom level boundaries, not every frame

**Keyboard Navigation:**
- [ ] Arrow keys for panning
- [ ] +/- for zooming
- [ ] Home to reset to default view

### 3e. Render Loop (`Canvas.tsx`)

```
requestAnimationFrame loop:
  1. Apply CSS transform for pending pan/zoom offset (INSTANT)
  2. Determine which tiles are visible at current zoom level
  3. For each visible tile (priority: center-out):
     a. If cached at current zoom → use cached
     b. If cached at lower zoom → display scaled-up as placeholder
     c. If not cached → queue for rendering
  4. Render up to N tile passes this frame (budget: ~8ms)
  5. Composite all tile textures → screen
  6. If all visible tiles are fully rendered → mark view as "settled"
```

- [ ] Implement render loop with frame budget enforcement
- [ ] Priority queue: tiles closest to viewport center render first
- [ ] During active interaction, reduce quality (fewer iterations, skip high passes)
- [ ] On interaction end, schedule full-quality refinement

---

## Phase 4: UI Components

### 4a. Sequence Editor (`components/SequenceEditor.tsx`)

- [ ] Text input showing current sequence (e.g., "AABAB")
- [ ] Only accepts A and B characters
- [ ] Visual representation: colored blocks for A and B
- [ ] Click blocks to toggle A↔B, click between blocks to insert
- [ ] Preset sequences dropdown (classic ones: "AB", "AABAB", "ABBBBA", etc.)
- [ ] Changes trigger full re-render of all tiles (invalidate cache)

### 4b. Gradient Editor (`components/GradientEditor.tsx`)

- [ ] Visual gradient bar showing current color ramp
- [ ] Draggable color stops along the bar
- [ ] Click on the bar to add a new stop
- [ ] Click a stop to select it, show color picker (Radix popover + color input)
- [ ] Drag stops to reposition, double-click or delete key to remove
- [ ] Minimum 2 stops enforced
- [ ] Preset gradients (classic Lyapunov palettes, scientific color maps)
- [ ] Changes rasterize the gradient to a 512px 1D texture and upload to GPU
- [ ] Live preview — gradient changes should reflect instantly (no tile re-render needed, just re-composite with new gradient texture)

**Gradient → 1D Texture pipeline (`renderer/gradient.ts`):**
```
stops: [{pos: 0, color: [0,0,0]}, {pos: 0.5, color: [255,0,0]}, {pos: 1, color: [255,255,0]}]
  → linear interpolate between stops
  → write to 512x1 Uint8Array (RGBA)
  → upload as gl.texImage2D(gl.TEXTURE_2D, ..., 512, 1, ..., data)
  → shader samples: texture(uGradient, vec2(remappedLambda, 0.5))
```

### 4c. Toolbar (`components/Toolbar.tsx`)

- [ ] Collapsible panel (slide in/out from side or top)
- [ ] Contains: Sequence Editor, Gradient Editor, Share Button
- [ ] Shows current coordinates and zoom level
- [ ] Keyboard shortcut to toggle (e.g., `Tab` or `Escape`)
- [ ] Semi-transparent overlay so it doesn't fully block the fractal

### 4d. Share Button (`components/ShareButton.tsx`)

- [ ] Copies current URL to clipboard
- [ ] Tooltip confirmation on copy
- [ ] URL updates live as you navigate (debounced, ~500ms after last interaction)

---

## Phase 5: URL Serialization

### 5a. URL Schema (`lib/url.ts`)

All state is encoded in the URL hash for easy sharing. Format:

```
#c=<centerX>,<centerY>&z=<zoom>&s=<sequence>&g=<gradient>
```

| Param | Encoding | Example |
|-------|---------|---------|
| `c` | Center coordinates, comma-separated. High precision (15 digits) | `c=2.5,3.1` |
| `z` | Zoom level as float | `z=1.5` |
| `s` | Sequence as string | `s=AABAB` |
| `g` | Gradient stops: `pos:hex` pairs joined by `-` | `g=0:000000-0.5:ff0000-1:ffff00` |

- [ ] `serializeState(state) → hash string`
- [ ] `deserializeState(hash) → state | null` (with validation + fallback defaults)
- [ ] Bidirectional sync: URL changes update state, state changes update URL
- [ ] Debounced URL updates during interaction (don't thrash browser history)
- [ ] Use `replaceState` during navigation, `pushState` on explicit share action

### 5b. Default View

When no URL params are present:
- Center: `(2.5, 3.5)` — a visually interesting region
- Zoom: `1.0`
- Sequence: `"AB"`
- Gradient: Blue → White → Yellow (classic Lyapunov palette)

---

## Phase 6: Polish & Performance

### 6a. Adaptive Quality

- [ ] Auto-scale iteration count based on zoom level (deeper zoom = more iterations needed)
- [ ] Detect GPU performance: time tile renders, adjust tile count/iterations to hit 60fps
- [ ] On low-end devices, reduce tile grid from 8x8 to 4x4
- [ ] Optional "high quality" toggle that increases iteration ceiling

### 6b. Visual Polish

- [ ] Smooth fade-in as tiles refine (opacity transition from preview → final)
- [ ] Loading indicator for deep zoom tile computation
- [ ] Minimap showing position within the full parameter space (stretch goal)
- [ ] Responsive layout — controls adapt to mobile screens

### 6c. Double Emulation Transition

- [ ] At shallow zoom: use standard float math (fast)
- [ ] At deep zoom (>~10^5): switch to double-float emulation (slower but precise)
- [ ] The transition should be invisible to the user — no flicker, no pause
- [ ] Shader uses `#ifdef` or branch to select the code path based on a uniform flag

### 6d. Testing

- [ ] Verify known Lyapunov exponent values for standard sequences
- [ ] Visual regression test: screenshot comparison at known coordinates
- [ ] URL round-trip test: serialize → deserialize → compare
- [ ] Performance benchmark: measure tile render time at various zoom levels

---

## Execution Order

```
Phase 1  ──→  Phase 2a  ──→  Phase 2b  ──→  Phase 3a,3b  ──→  Phase 3c,3d,3e
                                                                      │
Phase 4a,4b,4c,4d  ◄─────────────────────────────────────────────────┘
        │
        ▼
Phase 5  ──→  Phase 2c  ──→  Phase 6
```

**Critical path:** Phases 1 → 2a → 2b → 3 (core rendering) must be solid before UI work.
Phase 2c (double emulation) is deferred until basic navigation works — it's an enhancement for deep zoom, not a blocker.

---

## Key Design Decisions

1. **Tile FBOs over single-pass rendering** — Lets us cache, composite, and refine independently. More GPU memory but dramatically better interaction.

2. **CSS transform for instant feedback** — The single most important UX decision. During interaction, we never wait for the GPU. The existing image is transformed (translated/scaled) via CSS, and tiles fill in behind it.

3. **Gradient as 1D texture, not uniforms** — Unlimited stops, free hardware interpolation, and gradient changes don't require re-computing the fractal (just re-mapping colors).

4. **Double emulation as opt-in at deep zoom** — Keeps shallow navigation fast. The shader has both code paths; a uniform flag switches between them.

5. **Frame budget enforcement** — Never render more tiles than the frame budget allows. Dropped frames destroy the "fluid" feeling more than slightly delayed tile refinement.
