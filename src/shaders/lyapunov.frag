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

// Map function: 0=logistic, 1=sine, 2=cubic, 3=gaussian
uniform int uMapFunction;

// Generalized exponent: f(x) = r * x^p * (1-x)^p for logistic
uniform float uExponent;

// Third sequence symbol C maps to this fixed r-value
uniform float uCValue;

// Double emulation toggle
uniform bool uUseDouble;

#include "./double.glsl"

// ── Map functions and their derivatives ──────────────────────────────

// Get the r value for a given sequence index
float getR(int seqIdx, float a, float b) {
  int sym = uSequence[seqIdx % uSequenceLength];
  if (sym == 0) return a;
  if (sym == 1) return b;
  return uCValue; // sym == 2 → C
}

// Apply the selected map function: returns new x
float applyMap(float r, float x) {
  if (uMapFunction == 0) {
    // Logistic: r * x^p * (1-x)^p
    if (uExponent == 1.0) {
      return r * x * (1.0 - x);
    }
    return r * pow(x, uExponent) * pow(1.0 - x, uExponent);
  } else if (uMapFunction == 1) {
    // Sine: (r/4) * sin(π*x) — normalized to match logistic range
    return (r / 4.0) * sin(3.14159265358979 * x);
  } else if (uMapFunction == 2) {
    // Cubic: r * x² * (1 - x) — asymmetric variant
    return r * x * x * (1.0 - x);
  } else {
    // Gaussian: r * exp(-5*(x-0.5)²)
    float d = x - 0.5;
    return r * exp(-5.0 * d * d) * 0.25;
  }
}

// Compute |f'(x)| for the selected map function
float mapDeriv(float r, float x) {
  if (uMapFunction == 0) {
    // Logistic derivative
    if (uExponent == 1.0) {
      return abs(r * (1.0 - 2.0 * x));
    }
    // d/dx [r * x^p * (1-x)^p] = r * p * x^(p-1) * (1-x)^(p-1) * (1 - 2x)
    float p = uExponent;
    return abs(r * p * pow(x, p - 1.0) * pow(1.0 - x, p - 1.0) * (1.0 - 2.0 * x));
  } else if (uMapFunction == 1) {
    // Sine derivative: (r/4) * π * cos(πx)
    return abs((r / 4.0) * 3.14159265358979 * cos(3.14159265358979 * x));
  } else if (uMapFunction == 2) {
    // Cubic derivative: d/dx [r * x² * (1-x)] = r * (2x - 3x²)
    return abs(r * (2.0 * x - 3.0 * x * x));
  } else {
    // Gaussian derivative: d/dx [r * 0.25 * exp(-5(x-0.5)²)]
    // = r * 0.25 * (-10(x-0.5)) * exp(-5(x-0.5)²)
    float d = x - 0.5;
    return abs(r * 0.25 * (-10.0 * d) * exp(-5.0 * d * d));
  }
}

/**
 * Compute Lyapunov exponent at point (a, b) in parameter space.
 */
float lyapunovExponent(float a, float b, int iterations) {
  float x = uX0;
  float lambda = 0.0;

  // Warm-up: iterate without accumulating to settle into attractor
  int warmup = min(iterations / 4, 128);
  for (int i = 0; i < warmup; i++) {
    float r = getR(i, a, b);
    x = applyMap(r, x);
    x = clamp(x, 0.0001, 0.9999);
  }

  // Accumulate Lyapunov exponent.
  // CRITICAL: derivative must be evaluated at x_n BEFORE the iteration,
  // because λ = (1/N) Σ ln|f'(x_n)| where x_{n+1} = f(x_n).
  for (int i = 0; i < iterations; i++) {
    // Sequence index continues from warmup
    float r = getR(warmup + i, a, b);

    // Compute derivative at CURRENT x (before update)
    float deriv = mapDeriv(r, x);
    if (deriv > 0.0) {
      lambda += log(deriv);
    }

    // THEN iterate
    x = applyMap(r, x);
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
    vec2 fourDS = ds_set(4.0);
    vec2 zoomDS = ds_set(uZoom);

    vec2 scaledX = ds_mul(ds_set(pixelNormX), fourDS);
    vec2 offsetX = ds_mul(scaledX, ds_set(1.0 / uZoom));

    vec2 scaledY = ds_mul(ds_set(pixelNormY), fourDS);
    vec2 offsetY = ds_mul(scaledY, ds_set(1.0 / (uZoom * aspect)));

    vec2 aDS = ds_add(vec2(uCenterHigh.x, uCenterLow.x), offsetX);
    vec2 bDS = ds_add(vec2(uCenterHigh.y, uCenterLow.y), offsetY);

    float a = aDS.x + aDS.y;
    float b = bDS.x + bDS.y;

    float lambda = lyapunovExponent(a, b, uIterations);

    float t = clamp((lambda - uLambdaMin) / (uLambdaMax - uLambdaMin), 0.0, 1.0);
    fragColor = texture(uGradient, vec2(t, 0.5));
  }
}
