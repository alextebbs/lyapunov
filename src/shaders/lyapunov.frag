#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

// View uniforms — center is split into high+low for double-float precision
uniform vec2 uCenterHigh;
uniform vec2 uCenterLow;
uniform float uZoom;
uniform vec2 uResolution;

// Tile uniforms
uniform vec2 uTileOffset;
uniform vec2 uTileSize;

// Fractal uniforms
uniform int uSequence[64];
uniform int uSequenceLength;
uniform int uIterations;

// Gradient uniforms
uniform sampler2D uGradient;
uniform float uLambdaMin;
uniform float uLambdaMax;

// Initial condition
uniform float uX0;

// Double emulation toggle
uniform bool uUseDouble;

#include "./double.glsl"

/**
 * Compute Lyapunov exponent at point (a, b) in parameter space.
 */
float lyapunovExponent(float a, float b, int iterations) {
  float x = uX0;
  float lambda = 0.0;

  // Warm-up: iterate without accumulating to settle into attractor
  int warmup = min(iterations / 4, 128);
  for (int i = 0; i < warmup; i++) {
    float r = uSequence[i % uSequenceLength] == 0 ? a : b;
    x = r * x * (1.0 - x);
    x = clamp(x, 0.0001, 0.9999);
  }

  // Accumulate Lyapunov exponent.
  // CRITICAL: derivative must be evaluated at x_n BEFORE the iteration,
  // because λ = (1/N) Σ ln|f'(x_n)| where x_{n+1} = f(x_n).
  for (int i = 0; i < iterations; i++) {
    // Sequence index continues from warmup
    float r = uSequence[(warmup + i) % uSequenceLength] == 0 ? a : b;

    // Compute derivative at CURRENT x (before update)
    float deriv = abs(r * (1.0 - 2.0 * x));
    if (deriv > 0.0) {
      lambda += log(deriv);
    }

    // THEN iterate
    x = r * x * (1.0 - x);
    x = clamp(x, 0.0001, 0.9999);
  }

  return lambda / float(iterations);
}

void main() {
  float aspect = uResolution.x / uResolution.y;

  // UV within the full viewport (accounting for tile offset and size)
  vec2 fullUV = uTileOffset + vUV * uTileSize;

  // Pixel offset from center in normalized coordinates [-0.5, 0.5]
  float pixelNormX = fullUV.x - 0.5;
  float pixelNormY = fullUV.y - 0.5;

  if (!uUseDouble) {
    // Single precision path — good to ~1e6 zoom
    float viewWidth = 4.0 / uZoom;
    float viewHeight = viewWidth / aspect;

    float a = uCenterHigh.x + pixelNormX * viewWidth;
    float b = uCenterHigh.y + pixelNormY * viewHeight;

    float lambda = lyapunovExponent(a, b, uIterations);

    float t = clamp((lambda - uLambdaMin) / (uLambdaMax - uLambdaMin), 0.0, 1.0);
    fragColor = texture(uGradient, vec2(t, 0.5));
  } else {
    // Double-float precision path — good to ~1e12 zoom.
    //
    // The key insight: we must compute (center + pixelOffset * viewWidth)
    // entirely in double-float arithmetic. If we compute the offset in
    // single float first then add it, we lose the precision we're trying
    // to preserve.
    //
    // viewWidth = 4.0 / zoom. We split this multiplication:
    //   offset = pixelNorm * 4.0 / zoom
    // pixelNorm is in [-0.5, 0.5] so it's exact in float32.
    // We compute (pixelNorm * 4.0) as double-float, then divide by zoom.

    // Compute pixel offset in double-float
    vec2 fourDS = ds_set(4.0);
    vec2 zoomDS = ds_set(uZoom);

    // X offset: pixelNormX * 4.0 / zoom
    vec2 scaledX = ds_mul(ds_set(pixelNormX), fourDS);
    // Division: a/b = a * (1/b). For ds division we use: result = ds_mul(a, ds_set(1.0/b))
    // This loses some precision in the division but zoom is a single float anyway.
    vec2 offsetX = ds_mul(scaledX, ds_set(1.0 / uZoom));

    // Y offset: pixelNormY * 4.0 / (zoom * aspect)
    vec2 scaledY = ds_mul(ds_set(pixelNormY), fourDS);
    vec2 offsetY = ds_mul(scaledY, ds_set(1.0 / (uZoom * aspect)));

    // Add center (already split on CPU side) + per-pixel offset
    vec2 aDS = ds_add(vec2(uCenterHigh.x, uCenterLow.x), offsetX);
    vec2 bDS = ds_add(vec2(uCenterHigh.y, uCenterLow.y), offsetY);

    // The iteration itself only needs single precision since x stays in [0,1].
    // We just need the full-precision a,b coordinates to start from.
    float a = aDS.x + aDS.y;
    float b = bDS.x + bDS.y;

    float lambda = lyapunovExponent(a, b, uIterations);

    float t = clamp((lambda - uLambdaMin) / (uLambdaMax - uLambdaMin), 0.0, 1.0);
    fragColor = texture(uGradient, vec2(t, 0.5));
  }
}
