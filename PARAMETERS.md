# PARAMETERS.md — New Fractal Parameter Controls

Technical execution plan for 5 new fractal parameters. Each parameter adds a
new dimension of exploration beyond the existing AB sequence, gradient, center,
and zoom controls.

---

## Overview of Changes Per Parameter

| # | Parameter | Shader | Renderer | State/URL | UI |
|---|-----------|--------|----------|-----------|-----|
| 1 | Initial x₀ | new uniform `uX0` | new field, setter, uniform upload | serialize `x0` | slider 0.01–0.99 |
| 2 | Map exponent p | new uniform `uExponent` | new field, setter, uniform upload | serialize `p` | slider 0.5–4.0 |
| 3 | Map function | new uniform `uMapType` | new field, setter, uniform upload | serialize `m` | dropdown/segmented |
| 4 | Third symbol C | new uniform `uCValue` | new field, setter, uniform upload | serialize `cv` | slider 0–4 |
| 5 | Lambda range | expose existing `uLambdaMin/Max` | setters exist, wire to UI | serialize `lr` | dual slider |

---

## 1. Initial Condition x₀

### What it does
The logistic map orbit `x_{n+1} = r·x·(1-x)` starts from x₀ = 0.5 (hardcoded).
Different starting values produce different transient behavior before settling
into the attractor. For some parameter regions the orbit never settles, so x₀
genuinely changes the computed Lyapunov exponent and fractal shape.

### Mathematical impact
- x₀ near 0 or 1: orbit immediately pushed to extreme values, more divergent
- x₀ = 0.5: maximum entropy start point (classic default)
- The warmup phase mitigates x₀ sensitivity, but with fewer warmup iterations
  (or in chaotic regions), x₀ has visible effect

### Shader changes (`lyapunov.frag`)

Add uniform:
```glsl
uniform float uX0;
```

Change the initialization in `lyapunovExponent()`:
```glsl
// Before:
float x = 0.5;

// After:
float x = uX0;
```

That's it — one uniform, one line change.

### Renderer changes (`renderer.ts`)

```typescript
// New field
private _x0 = 0.5

// New setter
setX0(x0: number) {
  this._x0 = x0
  this.viewChanged()
  this.tileCache.invalidateAll()
}

// In constructor, add to uniform list:
'uX0'

// In setShaderUniforms():
gl.uniform1f(this.uniforms.uX0!, this._x0)

// In state getter/setter, add x0 field
```

### State changes (`types.ts`, `context.tsx`, `url.ts`)

**types.ts** — Add to `RendererState`:
```typescript
x0: number  // initial condition, default 0.5
```

**url.ts** — Serialize as `x0` param:
```typescript
// serialize: params.set('x0', state.x0.toFixed(4))
// deserialize: x0 = parseFloat(params.get('x0')) || 0.5
```

**context.tsx** — New `[x0, setX0State]` + `setX0` callback following existing pattern.

### UI Component

New `ParameterSlider` component (reusable for all numeric params):
```tsx
<ParameterSlider
  label="Initial x₀"
  value={x0}
  min={0.01}
  max={0.99}
  step={0.01}
  default={0.5}
  onChange={setX0}
/>
```

Slider with numeric readout. Reset button to snap back to 0.5.

---

## 2. Map Exponent p (Generalized Logistic Map)

### What it does
Replace the standard logistic map with a generalized form:

```
x_{n+1} = r · xᵖ · (1-x)ᵖ
```

At p=1 this is the standard logistic map. Varying p warps the shape of the
parabola, changing bifurcation rates, basin boundaries, and fractal geometry.

- p < 1: flatter peak, wider stable regions, smoother structures
- p > 1: sharper peak, narrower stable windows, more intricate detail
- p = 2: much more complex bifurcation structure than standard map

### Mathematical impact
The derivative changes too. For `f(x) = r · xᵖ · (1-x)ᵖ`:

```
f'(x) = r · p · xᵖ⁻¹ · (1-x)ᵖ⁻¹ · (1 - 2x)
```

The Lyapunov exponent sum becomes `λ = (1/N) Σ ln|f'(xₙ)|`.

### Shader changes (`lyapunov.frag`)

Add uniform:
```glsl
uniform float uExponent;
```

Replace the iteration logic in `lyapunovExponent()`:
```glsl
// Warmup loop body:
float r = uSequence[i % uSequenceLength] == 0 ? a : b;
if (uExponent == 1.0) {
  x = r * x * (1.0 - x);
} else {
  x = r * pow(x, uExponent) * pow(1.0 - x, uExponent);
}
x = clamp(x, 0.0001, 0.9999);

// Accumulation loop body:
float r = uSequence[(warmup + i) % uSequenceLength] == 0 ? a : b;

// Derivative: f'(x) = r * p * x^(p-1) * (1-x)^(p-1) * (1 - 2x)
float deriv;
if (uExponent == 1.0) {
  deriv = abs(r * (1.0 - 2.0 * x));
} else {
  deriv = abs(r * uExponent * pow(x, uExponent - 1.0)
            * pow(1.0 - x, uExponent - 1.0) * (1.0 - 2.0 * x));
}
if (deriv > 0.0) {
  lambda += log(deriv);
}

// Iteration
if (uExponent == 1.0) {
  x = r * x * (1.0 - x);
} else {
  x = r * pow(x, uExponent) * pow(1.0 - x, uExponent);
}
x = clamp(x, 0.0001, 0.9999);
```

**Performance note:** `pow()` is expensive on GPU. The `uExponent == 1.0` branch
keeps the common case fast. Consider also special-casing p=2:
`x*x*(1-x)*(1-x)` avoids `pow()` entirely.

### Renderer changes (`renderer.ts`)

Same pattern as x₀:
```typescript
private _exponent = 1.0
setExponent(p: number) { ... }
// uniform: gl.uniform1f(this.uniforms.uExponent!, this._exponent)
```

### State/URL

Serialize as `p` param. Default: `1.0`.

### UI
```tsx
<ParameterSlider
  label="Map Exponent"
  value={exponent}
  min={0.5}
  max={4.0}
  step={0.05}
  default={1.0}
  onChange={setExponent}
/>
```

---

## 3. Alternative Map Functions

### What it does
Instead of only the logistic map, offer a selection of iterated maps:

| ID | Name | Formula | Derivative |
|----|------|---------|------------|
| 0 | Logistic | `r·x·(1-x)` | `r·(1-2x)` |
| 1 | Sine | `r·sin(πx)/π` | `r·cos(πx)` |
| 2 | Tent | `r·min(x, 1-x)` | `±r` (piecewise) |
| 3 | Gaussian | `r·exp(-αx²)` | `-2αrx·exp(-αx²)` |

Each map has fundamentally different bifurcation geometry, producing unique
fractal shapes from the same AB sequence.

### Shader changes (`lyapunov.frag`)

Add uniform:
```glsl
uniform int uMapType;
```

Create map/derivative helper functions:
```glsl
float mapIterate(float r, float x) {
  if (uMapType == 1) {
    // Sine map: r * sin(PI * x) / PI
    // Normalized so output stays in [0,1] for r in [0,4]
    return r * sin(3.14159265 * x) / 3.14159265;
  } else if (uMapType == 2) {
    // Tent map: r * min(x, 1-x)
    // Peak at x=0.5, output in [0, r/2]
    // Rescale: r/2 * (1 - abs(2x - 1)) to keep in [0,1] range
    return 0.5 * r * (1.0 - abs(2.0 * x - 1.0));
  } else if (uMapType == 3) {
    // Gaussian map: r * exp(-5 * (x - 0.5)^2)
    float d = x - 0.5;
    return r * 0.25 * exp(-5.0 * d * d);
  }
  // Default: logistic map
  return r * x * (1.0 - x);
}

float mapDerivative(float r, float x) {
  if (uMapType == 1) {
    return r * cos(3.14159265 * x);
  } else if (uMapType == 2) {
    return x < 0.5 ? r : -r;
  } else if (uMapType == 3) {
    float d = x - 0.5;
    return r * 0.25 * (-10.0 * d) * exp(-5.0 * d * d);
  }
  return r * (1.0 - 2.0 * x);
}
```

Then replace inline logistic map code in both warmup and accumulation loops:
```glsl
// Derivative (before iteration)
float deriv = abs(mapDerivative(r, x));
// Iteration
x = mapIterate(r, x);
x = clamp(x, 0.0001, 0.9999);
```

**Interaction with exponent (param #2):** The exponent only applies to the
logistic map (type 0). Other map types ignore it. This keeps the shader logic
clean — the exponent modifies the logistic map's shape, while map type switches
the entire function.

### Renderer changes

```typescript
private _mapType = 0  // 0=logistic, 1=sine, 2=tent, 3=gaussian
setMapType(t: number) { ... }
// uniform: gl.uniform1i(this.uniforms.uMapType!, this._mapType)
```

### State/URL

Serialize as `m` param. Values: `logistic`, `sine`, `tent`, `gaussian`.
Default: `logistic`.

### UI

Segmented button group or small dropdown:
```tsx
<div className="space-y-2">
  <label>Map Function</label>
  <div className="grid grid-cols-2 gap-1">
    {['Logistic', 'Sine', 'Tent', 'Gaussian'].map((name, i) => (
      <button
        key={name}
        onClick={() => setMapType(i)}
        className={mapType === i ? 'bg-white/20' : 'bg-white/5'}
      >
        {name}
      </button>
    ))}
  </div>
</div>
```

Each button shows the map name. Active state highlighted. Compact 2x2 grid
fits the sidebar width.

---

## 4. Third Sequence Symbol C

### What it does
Currently sequences use only A and B, where A and B are the x and y axes of
the 2D parameter plane. Adding a third symbol C with a fixed r-value creates
a "bias" parameter — C injects a constant r into the iteration sequence,
breaking the pure A/B symmetry.

Example sequence: `ABCABC` — the orbit alternates between parameter A (from
x-axis), B (from y-axis), and a fixed C value, creating asymmetric structures
impossible with only two symbols.

### Mathematical impact
The Lyapunov exponent computation stays the same. The only change is that when
the sequence says "C", we use a fixed r-value instead of reading from the (a,b)
coordinate:

```
r = sequence[i] == 0 ? a : (sequence[i] == 1 ? b : c_fixed)
```

This creates:
- Asymmetric breaking of the A↔B duality
- New families of patterns from the same (A,B) plane
- C acts as a "tuning" parameter — sliding it smoothly morphs the fractal

### Shader changes (`lyapunov.frag`)

Add uniform:
```glsl
uniform float uCValue;
```

Change the r-selection in both warmup and accumulation loops:
```glsl
// Before:
float r = uSequence[i % uSequenceLength] == 0 ? a : b;

// After:
int sym = uSequence[i % uSequenceLength];
float r = sym == 0 ? a : (sym == 1 ? b : uCValue);
```

### Sequence encoding changes

**Current:** Sequence stored as `int[64]` with values 0 (A) or 1 (B).

**New:** Values 0 (A), 1 (B), or 2 (C). The shader int array already supports
this — we just allow value 2.

**SequenceEditor changes:**
- Allow 'C' character in text input: `value.toUpperCase().replace(/[^ABC]/g, '')`
- Add C-colored toggle blocks (third color, e.g. green)
- Update presets to include C-containing sequences: `ABCABC`, `AABCB`, etc.

**url.ts changes:**
- `sequenceToString`: map 2 → 'C'
- `stringToSequence`: map 'C' → 2
- Already supports arbitrary integers in the array, so minimal change

### Renderer changes

```typescript
private _cValue = 3.0  // fixed r-value for symbol C
setCValue(c: number) { ... }
// uniform: gl.uniform1f(this.uniforms.uCValue!, this._cValue)
```

### State/URL

Serialize as `cv` param. Default: `3.0`.

### UI

```tsx
<ParameterSlider
  label="C Parameter (r)"
  value={cValue}
  min={0}
  max={4}
  step={0.01}
  default={3.0}
  onChange={setCValue}
  hint="Fixed r-value for 'C' in sequence"
/>
```

Only visible/relevant when the current sequence contains 'C'. Could
auto-show when user types C into the sequence editor.

---

## 5. Lambda Range Control

### What it does
The Lyapunov exponent λ is mapped to the gradient via:
```
t = clamp((λ - λ_min) / (λ_max - λ_min), 0, 1)
```

Currently hardcoded to λ_min = -0.5, λ_max = 0.5. Exposing this to the user
lets them:
- **Widen range** (e.g. [-2, 2]): see the full extent of chaos/stability, but
  with less contrast near the boundary
- **Narrow range** (e.g. [-0.1, 0.1]): extreme contrast at the λ=0 boundary,
  revealing fine membrane detail
- **Shift range** (e.g. [-0.3, 0.7]): bias the coloring to emphasize chaotic
  or stable regions
- **Asymmetric range**: different sensitivity for stable vs chaotic

### Implementation

This is the simplest parameter — the uniforms and shader code already exist.
We just need to:

1. Wire `lambdaMin`/`lambdaMax` through the state system
2. Add UI controls

### Renderer changes

Already has `private lambdaMin = -0.5` and `private lambdaMax = 0.5`.
Add public setters:
```typescript
setLambdaRange(min: number, max: number) {
  this.lambdaMin = min
  this.lambdaMax = max
  this.viewChanged()
  this.tileCache.invalidateAll()
}
```

### State changes

**types.ts** — Add to `RendererState`:
```typescript
lambdaRange: [number, number]  // [min, max], default [-0.5, 0.5]
```

**url.ts** — Serialize as `lr` param:
```typescript
params.set('lr', `${state.lambdaRange[0].toFixed(3)},${state.lambdaRange[1].toFixed(3)}`)
```

### UI — Dual Range Slider

Two sliders (or a dual-thumb range slider):
```tsx
<div className="space-y-2">
  <label>Lambda Range</label>
  <div className="flex gap-2 items-center">
    <input type="range" min={-3} max={0} step={0.05}
           value={lambdaRange[0]} onChange={...} />
    <span className="font-mono text-xs">{lambdaRange[0]}</span>
  </div>
  <div className="flex gap-2 items-center">
    <input type="range" min={0} max={3} step={0.05}
           value={lambdaRange[1]} onChange={...} />
    <span className="font-mono text-xs">{lambdaRange[1]}</span>
  </div>
  <p className="text-[10px] text-white/30">
    Narrow = more contrast at λ=0 boundary
  </p>
</div>
```

Quick presets: `[-0.1, 0.1]` (extreme detail), `[-0.5, 0.5]` (default),
`[-2, 2]` (full range).

---

## Implementation Order

Recommended sequence based on impact-to-effort ratio:

1. **Lambda Range** (30 min) — Already implemented in shader/renderer, just
   needs UI wiring. Instant visual impact — narrowing the range reveals hidden
   detail in any preset.

2. **Initial x₀** (45 min) — One uniform, one line of shader code. Subtle but
   real effect, especially combined with reduced warmup.

3. **Map Function** (2 hrs) — Biggest visual payoff. Each map type produces
   fundamentally different fractals. Requires shader refactor into
   helper functions but straightforward.

4. **Map Exponent** (1.5 hrs) — Powerful but requires careful shader math
   (derivative of generalized form). `pow()` calls have GPU cost; need the
   p=1 fast path.

5. **Third Symbol C** (2 hrs) — Touches the most files (shader, sequence
   editor, URL encoding, presets). But adds a completely new exploration
   axis. Best saved for last since it requires UI for both the C value
   slider AND the sequence editor changes.

## UI Layout in Settings Panel

All new controls go in a "Parameters" section between Scene Presets and
Advanced Controls:

```
┌─────────────────────┐
│ Lyapunov Explorer   │
│ (3.7000, 2.9500)    │
│                     │
│ ▸ Scene Presets     │
│   [grid of presets] │
│                     │
│ ── Parameters ───── │
│ Map Function  [seg] │
│ Map Exponent  [===] │
│ Initial x₀   [===] │
│ C Parameter   [===] │
│ Lambda Range  [===] │
│               [===] │
│                     │
│ ▸ Advanced Controls │
│   Sequence Editor   │
│   Gradient Editor   │
│                     │
│ [Copy Link]         │
│ Drag: Pan           │
│ Scroll/Pinch: Zoom  │
└─────────────────────┘
```

## Scene Preset Updates

Each scene preset's `RendererState` type expands to include the new fields.
Existing presets get defaults (x0=0.5, exponent=1.0, mapType=0, cValue=3.0,
lambdaRange=[-0.5, 0.5]). New presets should showcase the new parameters:

- "Sine Waves" — sine map, ABBA, arctic gradient
- "Tent City" — tent map, AB, neon gradient
- "Power Arch" — logistic map, exponent=1.5, BBBBBBAAAAAA
- "Triple Axis" — sequence ABCABC, C=3.2, stained glass gradient
- "Micro Detail" — lambdaRange [-0.05, 0.05], any sequence zoomed in

## Shared ParameterSlider Component

To avoid duplicating slider UI code, create a reusable component:

```tsx
// src/components/ParameterSlider.tsx
interface Props {
  label: string
  value: number
  min: number
  max: number
  step: number
  defaultValue: number
  onChange: (v: number) => void
}

export function ParameterSlider({ label, value, min, max, step, defaultValue, onChange }: Props) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <label className="text-xs text-white/60">{label}</label>
        <div className="flex items-center gap-1">
          <span className="text-xs font-mono text-white/80">{value.toFixed(2)}</span>
          {value !== defaultValue && (
            <button
              onClick={() => onChange(defaultValue)}
              className="text-[10px] text-white/30 hover:text-white/60"
              title="Reset to default"
            >
              ↺
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1 appearance-none bg-white/20 rounded cursor-pointer
                   [&::-webkit-slider-thumb]:appearance-none
                   [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                   [&::-webkit-slider-thumb]:rounded-full
                   [&::-webkit-slider-thumb]:bg-white"
      />
    </div>
  )
}
```
