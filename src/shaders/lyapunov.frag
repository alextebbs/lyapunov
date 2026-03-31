#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

// View uniforms
uniform vec2 uCenterHigh;
uniform vec2 uCenterLow;
uniform float uZoom;
uniform vec2 uResolution;

// Tile uniforms
uniform vec2 uTileOffset;  // [0,1] offset of this tile within viewport
uniform vec2 uTileSize;    // fraction of viewport this tile covers

// Fractal uniforms
uniform int uSequence[64];
uniform int uSequenceLength;
uniform int uIterations;

// Gradient uniforms
uniform sampler2D uGradient;
uniform float uLambdaMin;
uniform float uLambdaMax;

// Double emulation toggle
uniform bool uUseDouble;

#pragma glslify: import('./double.glsl')

/**
 * Compute Lyapunov exponent at point (a, b) in parameter space.
 *
 * The Lyapunov fractal iterates the logistic map x_{n+1} = r_n * x_n * (1 - x_n)
 * where r_n cycles through a/b according to the sequence string.
 * The exponent λ = (1/N) * Σ log|r_n * (1 - 2*x_n)| determines stability:
 *   λ < 0 → stable (ordered)
 *   λ > 0 → chaotic
 */
float lyapunovExponent(float a, float b, int iterations) {
  float x = 0.5;
  float lambda = 0.0;

  // Warm-up iterations to settle into attractor
  int warmup = min(iterations / 4, 128);
  for (int i = 0; i < warmup; i++) {
    float r = uSequence[i % uSequenceLength] == 0 ? a : b;
    x = r * x * (1.0 - x);
    // Clamp to prevent divergence
    x = clamp(x, 0.0001, 0.9999);
  }

  // Accumulate exponent
  for (int i = 0; i < iterations; i++) {
    float r = uSequence[i % uSequenceLength] == 0 ? a : b;
    x = r * x * (1.0 - x);
    x = clamp(x, 0.0001, 0.9999);

    float deriv = abs(r * (1.0 - 2.0 * x));
    if (deriv > 0.0) {
      lambda += log(deriv);
    }
  }

  return lambda / float(iterations);
}

/**
 * Double-float version for deep zoom.
 * Uses emulated double precision for coordinate computation,
 * but single float for the iteration itself (which is fine since
 * the logistic map values stay in [0,1]).
 */
float lyapunovExponentDouble(vec2 aHigh, vec2 aLow, vec2 bHigh, vec2 bLow, int iterations) {
  // For the actual iteration, single precision is sufficient
  // since x stays in [0,1] and we only need the exponent.
  // The double precision is only needed for the coordinate mapping.
  float a = aHigh.x + aLow.x;
  float b = bHigh.x + bLow.x;
  return lyapunovExponent(a, b, iterations);
}

void main() {
  // Map pixel to fractal coordinate space
  float aspect = uResolution.x / uResolution.y;
  float viewWidth = 4.0 / uZoom;
  float viewHeight = viewWidth / aspect;

  // UV within the full viewport (accounting for tile offset and size)
  vec2 fullUV = uTileOffset + vUV * uTileSize;

  if (!uUseDouble) {
    // Single precision path
    float a = uCenterHigh.x + (fullUV.x - 0.5) * viewWidth;
    float b = uCenterHigh.y + (fullUV.y - 0.5) * viewHeight;

    float lambda = lyapunovExponent(a, b, uIterations);

    // Map exponent to gradient texture coordinate
    float t = clamp((lambda - uLambdaMin) / (uLambdaMax - uLambdaMin), 0.0, 1.0);
    fragColor = texture(uGradient, vec2(t, 0.5));
  } else {
    // Double-float precision path
    vec2 offsetX = ds_set((fullUV.x - 0.5) * viewWidth);
    vec2 offsetY = ds_set((fullUV.y - 0.5) * viewHeight);
    vec2 aDS = ds_add(vec2(uCenterHigh.x, uCenterLow.x), offsetX);
    vec2 bDS = ds_add(vec2(uCenterHigh.y, uCenterLow.y), offsetY);

    float lambda = lyapunovExponentDouble(
      vec2(aDS.x, 0.0), vec2(aDS.y, 0.0),
      vec2(bDS.x, 0.0), vec2(bDS.y, 0.0),
      uIterations
    );

    float t = clamp((lambda - uLambdaMin) / (uLambdaMax - uLambdaMin), 0.0, 1.0);
    fragColor = texture(uGradient, vec2(t, 0.5));
  }
}
