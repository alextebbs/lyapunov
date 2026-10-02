# HANDOFF.md — Lyapunov Explorer

## What This Is

A full-screen, interactive Lyapunov fractal explorer. It runs entirely in the browser using WebGL 2, React, and TypeScript. You pan and zoom through 2D fractal parameter space the way you'd navigate a map — drag to pan, scroll/pinch to zoom — and the fractal renders in real time on the GPU.

The app is built for visual exploration. The user wants to discover beautiful images inside the mathematics of Lyapunov fractals. Presets are the primary UI — 46 curated "scenes" combining sequences, gradients, zoom levels, and parameters that produce interesting visuals. The manual controls (sequence editor, gradient editor, parameter sliders) exist but are hidden behind "Advanced Controls" to keep the interface clean.

This is not an educational tool or a reference implementation. It's an art tool that happens to be mathematically rigorous.

---

## The Math

### Lyapunov Fractals

A Lyapunov fractal maps a 2D parameter space (A, B) by computing the **Lyapunov exponent** of a dynamical system at each point. The canonical version uses the **logistic map**:

```
x_{n+1} = r_n * x_n * (1 - x_n)
```

The key idea: instead of a single parameter `r`, we alternate between two values `A` and `B` according to a repeating sequence (like "AABAB"). At each iteration, we look up whether to use `r = A` or `r = B` from the sequence, cycling through it.

The Lyapunov exponent measures the rate at which nearby orbits diverge:

```
λ = (1/N) Σ ln|f'(x_n)|
```

where the derivative `f'(x_n)` is evaluated **before** the iteration step (this is a critical correctness detail — see the shader code). Negative λ means the system is stable (ordered), positive λ means it's chaotic.

The fractal image maps λ to color via a gradient. The boundary between stable and chaotic regions (λ ≈ 0) is where all the interesting fractal structure lives — period-doubling bifurcation cascades, filaments, membrane-like structures.

### Generalized Parameters

The explorer extends the standard Lyapunov fractal with:

- **Map functions**: Beyond the logistic map, supports sine (`(r/4) * sin(πx)`), cubic (`r * x² * (1-x)`), and Gaussian (`(r/4) * exp(-5(x-0.5)²)`). Each has its own derivative for the Lyapunov exponent computation.
- **Generalized exponent**: The logistic map becomes `r * x^p * (1-x)^p` with adjustable `p`. Default `p=1` is standard.
- **Initial condition (x₀)**: The starting value for the orbit iteration. Default 0.5.
- **Lambda range**: The [min, max] range for mapping the Lyapunov exponent to the color gradient. Narrower ranges reveal finer detail; wider ranges show more global structure.
- **Third sequence symbol (C)**: Sequences can use A/B/C where C maps to a fixed r-value rather than a parameter axis coordinate. This breaks the 2D parameter symmetry and creates novel structure.

### Double-Float Precision

At high zoom (>10,000x), float32 precision on the GPU isn't enough to distinguish individual pixels in parameter space. The renderer uses **double-float emulation**: splitting each coordinate into two float32s (high + low) using Dekker/Knuth error-free transformations. This gives ~48 bits of precision, enough for zoom levels up to ~10¹².

The split happens on the CPU side (`splitDouble` in `double.ts`), and the GLSL shader (`double.glsl`) implements double-float arithmetic (add, subtract, multiply, compare) to compute per-pixel coordinates before feeding them to the fractal iteration.

---

## Architecture

```
src/
├── App.tsx                          # Root: AppProvider + Canvas + Toolbar
├── main.tsx                         # Entry point
├── state/
│   └── context.tsx                  # React context: all app state + URL sync
├── renderer/
│   ├── renderer.ts                  # Core WebGL renderer (THE big file)
│   ├── types.ts                     # RendererState, GradientStop, Tile, etc.
│   ├── context.ts                   # WebGL2 context creation + fullscreen quad
│   ├── shader.ts                    # Shader compile/link utilities
│   ├── gradient.ts                  # Gradient → 512x1 texture rasterization
│   ├── tile.ts                      # TileCache: LRU tile pool with FBOs
│   └── double.ts                    # CPU-side double-float splitting
├── shaders/
│   ├── lyapunov.vert                # Pass-through vertex shader
│   ├── lyapunov.frag                # THE fractal shader (map functions, derivatives, iteration)
│   └── double.glsl                  # GLSL double-float arithmetic (#included)
├── components/
│   ├── Canvas.tsx                   # Mounts the WebGL renderer
│   ├── Toolbar.tsx                  # Slide-out panel (presets → params → advanced)
│   ├── ScenePresets.tsx             # 46 curated presets with 19 gradient palettes
│   ├── ParameterControls.tsx        # Map function, exponent, x₀, C value, lambda range
│   ├── ParameterSlider.tsx          # Reusable slider: step="any", reset button, touch-friendly
│   ├── SequenceEditor.tsx           # Type/click to edit A/B/C sequences
│   ├── GradientEditor.tsx           # Drag gradient stops, color picker, presets
│   └── ShareButton.tsx              # Copy URL to clipboard
└── lib/
    └── url.ts                       # Serialize/deserialize full state to URL hash
```

### Data Flow

1. **State lives in React context** (`state/context.tsx`). Every parameter — center, zoom, sequence, gradient, lambda range, x₀, map function, exponent, C value — has a React state hook and a setter.

2. **Setters push state in two directions**:
   - To the **renderer** (via `rendererRef.current?.setFoo(...)`) for immediate GPU update
   - To the **URL hash** (via `updateUrl()`, debounced 500ms) for sharing/bookmarking

3. **The renderer also pushes state back**: when the user pans/zooms via direct canvas interaction (mouse drag, pinch), the renderer calls `notifyStateChange()` which updates React state and the URL.

4. **URL hash changes** (browser back/forward) deserialize into state and push to both React and the renderer.

### Rendering Pipeline

The renderer has two modes, switching automatically:

**Interaction mode** (panning/zooming):
- Renders the entire viewport in a single fullscreen draw call
- Low iteration count (128) for instant visual feedback
- No tile overhead — every pixel updates immediately

**Idle mode** (user stopped interacting, after 200ms):
- Tile-based progressive refinement
- Screen divided into 256×256px tiles
- Each tile renders through 4 passes: 32 → 128 → 512 → 2048 iterations
- Frame budget of 10ms per frame to keep compositing smooth
- Tiles composite to screen via a simple blit shader
- LRU tile cache (128 tiles max) with automatic eviction

This dual mode was a deliberate design choice. Earlier versions tried tile-only rendering and suffered from visible tile boundaries during fast panning. The fullscreen pass during interaction gives consistent, gap-free visuals; the tile system only kicks in for quality refinement.

### The Shader

`lyapunov.frag` is the computational core. Key structure:

1. **`getR(seqIdx, a, b)`** — looks up the sequence to determine which r-value to use. Supports A (→ a), B (→ b), C (→ fixed uCValue).

2. **`applyMap(r, x)`** — applies the selected map function (logistic/sine/cubic/gaussian), with generalized exponent for logistic.

3. **`mapDeriv(r, x)`** — computes |f'(x)| for the selected map function. Each map has its own analytically correct derivative.

4. **`lyapunovExponent(a, b, iterations)`** — the main loop:
   - Warm-up phase (iterations/4, max 128): iterate without accumulating to settle into the attractor
   - Accumulation phase: compute derivative BEFORE iteration, accumulate log, then iterate
   - Returns λ = accumulated / iterations

5. **`main()`** — maps pixel position to (a, b) parameter coordinates (with double-float precision path for deep zoom), calls `lyapunovExponent`, maps result through gradient texture.

### URL Serialization

Every piece of state round-trips through the URL hash. Format: `#c=3.7,2.95&z=3.5&s=BBBBBBAAAAAA&g=0.000:0a0500-0.350:c8aa00-...&lr=-0.5,0.5&x0=0.5&mf=0&exp=1.00&cv=3.000`

Optional params (lr, x0, mf, exp, cv) are omitted when at defaults to keep URLs clean. The gradient encodes each stop as `position:RRGGBB` joined by hyphens.

---

## The Spirit

The driving vision is **maximizing the space of beautiful images you can discover**. Every feature was built to serve that goal:

- **Presets over controls**: The user shouldn't have to understand Lyapunov exponents to find something beautiful. 46 curated scenes are the front door. Each combines a sequence, gradient, zoom level, and parameter set that produces something visually striking. The manual controls exist for power users who want to go deeper.

- **Sequences are the primary creative lever**: The character of a Lyapunov fractal changes dramatically with the sequence. Short sequences (AB, ABBA) produce the classic organic structures. Long sequences (32-64 characters, repeating patterns like AABBAABB×4) produce tessellation and woven patterns. The interplay between sequence periodicity and the fractal's natural period-doubling creates interference patterns.

- **Gradients are critical**: A mathematically identical fractal looks completely different depending on how you map λ to color. The 19 built-in palettes were tuned through iteration — sharp two-tone gradients produce hard graphic patterns, while multi-stop smooth gradients reveal internal detail and depth. Getting this wrong (too sharp, wrong lambda range) can make an interesting fractal look like a flat binary threshold.

- **Exploration should feel physical**: Drag to pan with momentum/inertia. Smooth animated zoom. Touch-friendly on mobile (full-width panel, 20px slider thumbs that grow to 24px on press, pinch-zoom). The fractal should feel like a place you're moving through, not a rendering you're configuring.

- **Performance enables exploration**: You can't explore if every pan lags. The dual-mode renderer (fast fullscreen during interaction, progressive tile refinement when idle) means the fractal always responds immediately and always reaches full quality.

- **Shareable**: Every view is a URL. Copy the link, send it to someone, and they see exactly what you see. Browser back/forward navigates your exploration history.

### What "done" looks like

The user described the project as wanting to "explore the fractal space to generate pretty pictures" and to "open up the possibilities as far as customizing what we can show." They are less interested in mathematical correctness for its own sake and more interested in the visual output. When a feature doesn't produce interesting images, it's not worth having.

They push to main directly, iterate fast, and care about the result on screen, not code architecture.

---

## Current State

Everything listed above is implemented and working. The app renders Lyapunov fractals in real time, all 46 presets work, all 5 parameter controls work, mobile is functional, deep zoom works via double-float emulation, and the URL serialization is complete.

### What's Built

- Full WebGL 2 renderer with tile-based progressive refinement
- 4 map functions (logistic, sine, cubic, gaussian) with correct derivatives
- Generalized logistic exponent
- Third sequence symbol (C) with fixed r-value
- Adjustable initial condition (x₀) and lambda range
- 46 scene presets across 19 gradient palettes
- Double-float precision for zoom up to ~10¹²
- Mobile touch support (pan, pinch-zoom, full-width panel)
- Smooth continuous sliders (not stepped)
- URL state serialization for sharing and history
- Sequence editor with A/B/C support (click to cycle, type to edit)
- Gradient editor with drag-to-position stops and color picker

### What's Planned (Not Implemented)

**Perturbation theory for infinite zoom** — documented in `PERTURBATION.md`. The current double-float approach tops out around 10¹² zoom. To go deeper, you need arbitrary-precision reference orbits computed on the CPU, with the GPU computing perturbation deltas for surrounding pixels. The plan is fully researched and detailed in that file. Key insight: Lyapunov fractals are easier than Mandelbrot for perturbation because the orbit stays bounded in [0,1] — only the parameter coordinates need arbitrary precision.

---

## Files of Note

| File | What it is | Why it matters |
|------|-----------|---------------|
| `src/renderer/renderer.ts` | The renderer | ~700 lines. The beating heart. Contains the render loop, event handling, tile management, uniform upload, and the composite shader. |
| `src/shaders/lyapunov.frag` | The fractal shader | ~180 lines. Where the math lives. Map functions, derivatives, the iteration loop, double-float coordinate computation. |
| `src/components/ScenePresets.tsx` | Presets | ~730 lines. 19 gradient palettes and 46 curated scenes. This is the primary way users interact with the app. |
| `src/state/context.tsx` | State management | ~150 lines. React context that binds everything together — state, setters, URL sync, renderer sync. |
| `src/lib/url.ts` | URL serialization | ~140 lines. Bidirectional serialization of all state to/from URL hash. |
| `PERTURBATION.md` | Future: infinite zoom | Detailed plan for perturbation-based rendering to break the float precision barrier. |
| `PARAMETERS.md` | Implementation plan | Research document covering the 5 fractal parameters that were implemented. |

---

## Development

```bash
npm run dev      # Vite dev server
npm run build    # TypeScript check + Vite build
```

Stack: React 18, TypeScript, Vite, Tailwind CSS v4, vite-plugin-glsl (for GLSL #include), Radix UI (popover in gradient editor).

Commits go directly to `main`. No PRs.
