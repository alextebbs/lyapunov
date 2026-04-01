# PERTURBATION.md — Infinite Zoom via Perturbation Theory

## Overview

Our current deep zoom uses double-float emulation (Dekker's algorithm), which gives ~48 bits of precision — good to about 10^12 zoom. Beyond that, pixel coordinates become indistinguishable and the fractal turns to mush.

**Perturbation theory** eliminates this limit entirely. Instead of computing every pixel's orbit at full precision, we:

1. Compute **one reference orbit** at arbitrary precision (CPU, using BigDecimal/BigFloat)
2. Express every other pixel as a **small perturbation** (delta) from that reference
3. Propagate deltas on the GPU in standard float32 — they stay small regardless of zoom depth

This is the same technique used by Mandelbrot deep-zoom renderers (Kalles Fraktaler, Fractal eXtreme) to achieve 10^1000+ zoom. We need to derive and implement it for the **logistic map** `x_{n+1} = r·x·(1-x)`.

---

## Part 1: Mathematical Foundation

### 1.1 The Logistic Map Perturbation Recurrence

**Reference orbit** at pixel `(a_ref, b_ref)`:
```
X_{n+1} = R_n · X_n · (1 - X_n)
```
where `R_n` is the sequence-selected parameter (`a_ref` or `b_ref`) at step n.

**Perturbed orbit** at nearby pixel `(a_ref + δa, b_ref + δb)`:
```
x_n = X_n + ε_n
r_n = R_n + δr_n
```
where `δr_n = δa` when sequence selects A, `δr_n = δb` when sequence selects B.

**Substituting** `x = X + ε`, `r = R + δr` into the logistic map:
```
x_{n+1} = (R + δr)(X + ε)(1 - X - ε)
```

**Expanding** and subtracting the reference `X_{n+1} = R·X·(1-X)`:
```
ε_{n+1} = R·(1 - 2X)·ε_n  +  δr·X·(1 - X)
         - R·ε_n²  -  δr·ε_n·(1 - 2X)  +  δr·ε_n²
```

**First-order approximation** (dropping ε² and δr·ε terms):
```
ε_{n+1} ≈ R_n·(1 - 2·X_n)·ε_n  +  δr_n·X_n·(1 - X_n)
```

This is a **linear recurrence** in ε — extremely cheap to evaluate per pixel on the GPU. The coefficients `R_n·(1-2X_n)` and `X_n·(1-X_n)` come from the reference orbit, precomputed on the CPU.

### 1.2 The Lyapunov Exponent via Perturbation

The Lyapunov exponent requires `ln|f'(x_n)|` at each step. The derivative of the logistic map is:
```
f'(x) = r·(1 - 2x)
```

For the perturbed orbit:
```
f'(x_n) = (R_n + δr_n)·(1 - 2·(X_n + ε_n))
         = (R_n + δr_n)·(1 - 2·X_n - 2·ε_n)
```

First-order:
```
f'(x_n) ≈ R_n·(1 - 2·X_n)  -  2·R_n·ε_n  +  δr_n·(1 - 2·X_n)
```

So `ln|f'(x_n)|` can be computed from the reference orbit values plus the small perturbation `ε_n`.

### 1.3 Full Precision Recurrence (keeping second-order terms)

For maximum accuracy at extreme zoom, keep all terms:
```
ε_{n+1} = R_n·(1 - 2·X_n)·ε_n
         + δr_n·X_n·(1 - X_n)
         - R_n·ε_n²
         - δr_n·ε_n·(1 - 2·X_n)
         + δr_n·ε_n²
```

The second-order terms are cheap to compute and improve accuracy significantly at deep zoom.

---

## Part 2: Reference Orbit Computation

### 2.1 Arbitrary Precision Library

We need a JavaScript BigFloat/BigDecimal library for CPU-side computation. Options:

| Library | Pros | Cons |
|---------|------|------|
| `decimal.js` | Well-tested, npm package | Slower than native |
| `bignumber.js` | Lighter weight | Less precision control |
| Custom binary float | Maximum performance | Complex to implement |
| `mpfr` via WASM | Fastest arbitrary precision | WASM bundle size |

**Recommendation**: Start with `decimal.js` (simplest), optimize later if needed.

### 2.2 Reference Orbit Storage

The reference orbit needs to store `X_n` and `R_n·(1-2·X_n)` and `X_n·(1-X_n)` at each iteration step. These are uploaded to the GPU as texture data:

```
For N iterations, store per step:
  - A_n = R_n·(1-2·X_n)     // ε coefficient (derivative of map at reference)
  - B_n = X_n·(1-X_n)       // δr coefficient (map value normalized by r)
  - R_n                      // the r value used at this step (for derivative computation)
  - X_n                      // reference x value (for derivative computation)
```

**Storage format**: Float32 texture, RGBA channels, N texels = N iteration steps.
- R channel: `A_n` (float32 is fine — these are bounded values in [0,4] range)
- G channel: `B_n`
- B channel: `R_n`
- A channel: `X_n`

For 2048 iterations: 2048 × 4 bytes × 4 channels = 32 KB — trivial.

### 2.3 Reference Pixel Selection

Choose the center of the viewport as the reference pixel. When the user pans, we need to recompute the reference orbit. Optimizations:
- **Cache reference orbits** for recently visited centers
- **Incremental computation**: if panning slightly, some orbit steps may be reusable
- **Web Worker**: compute reference orbit off the main thread to avoid blocking UI

---

## Part 3: GPU Shader Implementation

### 3.1 Modified Fragment Shader

```glsl
uniform sampler2D uReferenceOrbit;  // N×1 RGBA texture
uniform int uMaxIterations;
uniform vec2 uDeltaA;  // δa = (pixel_a - ref_a) as float32 (small!)
uniform vec2 uDeltaB;  // δb = (pixel_b - ref_b) as float32

float lyapunovPerturbation(float deltaA, float deltaB, int iterations) {
    float epsilon = 0.0;  // perturbation starts at 0 (same initial x0)
    float lambda = 0.0;

    for (int i = 0; i < iterations; i++) {
        // Fetch reference orbit data
        vec4 ref = texelFetch(uReferenceOrbit, ivec2(i, 0), 0);
        float An = ref.r;  // R_n * (1 - 2*X_n)
        float Bn = ref.g;  // X_n * (1 - X_n)
        float Rn = ref.b;  // R_n
        float Xn = ref.a;  // X_n

        // δr depends on sequence: δa or δb
        int sym = uSequence[i % uSequenceLength];
        float deltaR = (sym == 0) ? deltaA : deltaB;

        // Compute derivative at perturbed point for Lyapunov exponent
        float x_n = Xn + epsilon;
        float r_n = Rn + deltaR;
        float deriv = abs(r_n * (1.0 - 2.0 * x_n));
        if (deriv > 0.0) {
            lambda += log(deriv);
        }

        // Propagate perturbation (first-order + second-order correction)
        float eps_new = An * epsilon
                      + deltaR * Bn
                      - Rn * epsilon * epsilon
                      - deltaR * epsilon * (1.0 - 2.0 * Xn);

        epsilon = eps_new;

        // Glitch detection: if epsilon gets too large, perturbation theory fails
        if (abs(epsilon) > 1.0) {
            // Need rebasing (see Part 4)
            break;
        }
    }

    return lambda / float(iterations);
}
```

### 3.2 Coordinate Computation

At deep zoom, the per-pixel `δa` and `δb` are computed as:
```
δa = pixelOffsetX * viewWidth    // viewWidth = 4.0 / zoom
δb = pixelOffsetY * viewHeight
```

Since `viewWidth` gets extremely small at deep zoom (e.g., 10^-100), but `pixelOffsetX` is in [-0.5, 0.5], the product `δa` is a small float32 number — well within float32 range. This is the key insight: **we never need the absolute coordinates, only the relative offset**.

---

## Part 4: Glitch Detection and Rebasing

### 4.1 The Problem

Perturbation theory assumes ε stays small relative to X. When ε grows large (e.g., the perturbed orbit diverges differently from the reference), the approximation breaks down. This manifests as visual "glitches" — wrong-colored pixels.

### 4.2 Detection

A pixel is glitched when:
```
|ε_n| > threshold (e.g., 0.1 or |X_n| * 0.01)
```

### 4.3 Solutions

**Option A: Multiple reference orbits**
- Compute several reference orbits spread across the viewport
- Each pixel uses the nearest reference
- More references = fewer glitches, but more CPU work

**Option B: Rebasing**
- When ε gets large, "rebase" by computing x_n = X_n + ε_n at full precision
- Start a new reference from there
- Complex to implement on GPU

**Option C: Two-pass rendering**
- Pass 1: render with perturbation, mark glitched pixels
- Pass 2: re-render glitched pixels with a local reference orbit
- Most practical for our use case

**Recommendation**: Start with Option A (3-5 reference orbits in a grid), add Option C if glitches persist.

---

## Part 5: Series Approximation (SA)

### 5.1 Concept

For the first K iterations, if all pixels in the viewport are "close enough" to the reference, we can approximate the perturbation as a **polynomial in δa, δb**:

```
ε_K ≈ c₁·δa + c₂·δb + c₃·δa² + c₄·δa·δb + c₅·δb² + ...
```

The coefficients `c_i` are computed on the CPU alongside the reference orbit. The GPU can then **skip the first K iterations** and start from ε_K directly.

### 5.2 Derivation for Logistic Map

The linear recurrence `ε_{n+1} = A_n·ε_n + B_n·δr_n` can be solved in closed form:

```
ε_N = δr_0·B_0·∏(A_k, k=1..N-1)
    + δr_1·B_1·∏(A_k, k=2..N-1)
    + ...
    + δr_{N-1}·B_{N-1}
```

Since δr_n alternates between δa and δb based on the sequence, this becomes a linear combination:
```
ε_N = α_N·δa + β_N·δb
```

where α_N and β_N are accumulated products computed on the CPU. This lets the GPU skip directly to iteration N and start the Lyapunov accumulation from there.

### 5.3 Applicability

SA works best when the orbit is stable (not chaotic). In chaotic regions, the coefficients grow exponentially and the approximation fails quickly. For Lyapunov fractals, SA would be most effective in the stable (λ < 0) regions, which is often where the interesting visual detail is.

---

## Part 6: Key Insight — Lyapunov is Easier Than Mandelbrot

Unlike the Mandelbrot set (where both the coordinate `c` AND the orbit `z` require arbitrary precision at deep zoom), the Lyapunov fractal orbit `x` stays bounded in [0,1] and never needs high precision. **Only the parameter coordinates `(a, b)` need arbitrary precision** to distinguish nearby pixels.

This means we have two viable approaches:

### Approach A: Parameter-Only Precision (simpler, likely sufficient)

1. Compute `(a_ref, b_ref)` at arbitrary precision on CPU
2. For each pixel, compute `δa = pixel_a - a_ref` and `δb = pixel_b - b_ref` in float32
3. In the shader, use `a = a_ref_high + a_ref_low + δa` (or just pass δa directly)
4. Iterate the logistic map normally — the orbit itself needs only float32

This is essentially extending our current double-float emulation to arbitrary precision. **No orbit perturbation needed.** The GPU shader barely changes — only the coordinate computation.

### Approach B: Full Perturbation (for performance via SA)

Full orbit perturbation as described in Parts 1-5. More complex but enables series approximation to skip early iterations. Worth doing only if Phase 1 (Approach A) proves too slow at extreme zoom due to high iteration counts.

**Recommendation**: Implement Approach A first. It's simpler, lower-risk, and solves the precision problem. Add Approach B later only if iteration skipping becomes important for performance.

---

## Part 7: Implementation Plan

### Phase 1: Core Perturbation (MVP)

**Files to modify/create:**

| File | Changes |
|------|---------|
| `package.json` | Add `decimal.js` dependency |
| `src/renderer/bigfloat.ts` | NEW: Arbitrary precision reference orbit computation |
| `src/renderer/reference.ts` | NEW: Reference orbit manager (compute, cache, upload to GPU) |
| `src/renderer/renderer.ts` | Add perturbation render path, reference orbit texture |
| `src/shaders/lyapunov.frag` | Add perturbation shader path alongside existing paths |
| `src/renderer/types.ts` | Add PerturbationData type |

**Steps:**
1. Add `decimal.js` and create `bigfloat.ts` wrapper
2. Create `reference.ts`: compute reference orbit at center using BigFloat
3. Upload reference orbit as float32 texture (RGBA, N×1)
4. Add perturbation path to fragment shader
5. Switch to perturbation path when zoom > PERTURBATION_THRESHOLD (~1e10)
6. Compute per-pixel δa, δb from pixel offset and viewport width

### Phase 2: Glitch Handling

1. Implement glitch detection (|ε| > threshold)
2. Multi-reference approach: compute 5 reference orbits (center + corners)
3. GPU selects nearest reference per pixel
4. Requires 5× reference orbit textures

### Phase 3: Series Approximation

1. Compute SA coefficients alongside reference orbit
2. Upload α_N, β_N as uniforms
3. GPU skips first N warmup iterations using SA
4. Determines optimal skip count based on coefficient convergence

### Phase 4: Web Worker + Progressive

1. Move reference orbit computation to Web Worker
2. Progressive: start rendering with low-precision reference while high-precision computes
3. Cache recent reference orbits for smooth panning

---

## Part 8: Performance Characteristics

### Current System
| Zoom Range | Method | Precision |
|-----------|--------|-----------|
| 1 - 10⁴ | Single float32 | ~7 decimal digits |
| 10⁴ - 10¹² | Double-float emulation | ~14 decimal digits |
| > 10¹² | ❌ Breaks down | — |

### With Perturbation Theory
| Zoom Range | Method | Precision |
|-----------|--------|-----------|
| 1 - 10⁴ | Single float32 (no change) | ~7 decimal digits |
| 10⁴ - 10¹² | Double-float emulation (no change) | ~14 decimal digits |
| 10¹² - 10^∞ | Perturbation + BigFloat reference | Unlimited |

### Bottleneck Analysis
- **CPU**: Reference orbit computation scales linearly with iteration count and precision digits. At 10^100 zoom with 2048 iterations, using 150-digit precision: ~50ms on modern CPU.
- **GPU**: Perturbation shader is actually **cheaper** than the standard shader — it replaces `pow()` and `sin()` calls with simple multiplies and a texture fetch.
- **Memory**: Reference orbit texture: 2048 × 4 floats × 4 bytes = 32KB. Negligible.
- **Latency**: Reference orbit must be recomputed on pan. Web Worker avoids blocking. During computation, show the double-float result as a preview.

---

## Part 9: Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Logistic map orbits are chaotic → ε grows fast | Higher-order terms + glitch detection |
| Reference orbit computation blocks UI | Web Worker |
| Glitches in chaotic regions | Multiple reference orbits |
| Series approximation diverges quickly | Limit SA to stable regions, fall back to full iteration |
| BigFloat library too slow | Profile and switch to WASM-based mpfr if needed |
| Complex interaction with map function variants (sine, cubic, gaussian) | Derive perturbation recurrences for each map type separately |

---

## Part 10: Perturbation Recurrences for Other Map Functions

### Sine Map: `f(x) = (r/4)·sin(πx)`
```
ε_{n+1} = (R_n/4)·π·cos(π·X_n)·ε_n + (δr_n/4)·sin(π·X_n)
```

### Cubic Map: `f(x) = r·x²·(1-x)`
```
ε_{n+1} = R_n·(2·X_n - 3·X_n²)·ε_n + δr_n·X_n²·(1-X_n)
```

### Gaussian Map: `f(x) = (r/4)·exp(-5·(x-0.5)²)`
```
d = X_n - 0.5
ε_{n+1} = -(R_n·10·d/4)·exp(-5d²)·ε_n + (δr_n/4)·exp(-5d²)
```

Each requires its own CPU-side reference orbit computation and GPU delta propagation formula.
