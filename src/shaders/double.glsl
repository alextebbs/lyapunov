/**
 * Double-float emulation in GLSL.
 * A "double-float" is vec2(high, low) where value = high + low.
 * Uses Dekker/Knuth error-free transformations for ~48 bits of precision.
 */

// Create a double-float from a single float
vec2 ds_set(float a) {
  return vec2(a, 0.0);
}

// Error-free addition: returns (sum, error)
vec2 ds_twoSum(float a, float b) {
  float s = a + b;
  float v = s - a;
  float e = (a - (s - v)) + (b - v);
  return vec2(s, e);
}

// Double-float addition
vec2 ds_add(vec2 a, vec2 b) {
  vec2 s = ds_twoSum(a.x, b.x);
  s.y += a.y + b.y;
  return ds_twoSum(s.x, s.y);
}

// Double-float subtraction
vec2 ds_sub(vec2 a, vec2 b) {
  return ds_add(a, vec2(-b.x, -b.y));
}

// Split a float for error-free multiplication
vec2 ds_split(float a) {
  float t = 4097.0 * a; // 2^12 + 1
  float hi = t - (t - a);
  float lo = a - hi;
  return vec2(hi, lo);
}

// Error-free multiplication: returns (product, error)
vec2 ds_twoProd(float a, float b) {
  float p = a * b;
  vec2 sa = ds_split(a);
  vec2 sb = ds_split(b);
  float err = ((sa.x * sb.x - p) + sa.x * sb.y + sa.y * sb.x) + sa.y * sb.y;
  return vec2(p, err);
}

// Double-float multiplication
vec2 ds_mul(vec2 a, vec2 b) {
  vec2 p = ds_twoProd(a.x, b.x);
  p.y += a.x * b.y + a.y * b.x;
  return ds_twoSum(p.x, p.y);
}

// Compare: returns negative if a < b, 0 if equal, positive if a > b
float ds_compare(vec2 a, vec2 b) {
  vec2 d = ds_sub(a, b);
  return d.x + d.y;
}
