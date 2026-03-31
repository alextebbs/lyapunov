export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Failed to create shader')

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`Shader compilation failed:\n${log}\n\nSource:\n${source}`)
  }

  return shader
}

export function linkProgram(
  gl: WebGL2RenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader,
): WebGLProgram {
  const program = gl.createProgram()
  if (!program) throw new Error('Failed to create program')

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program)
    gl.deleteProgram(program)
    throw new Error(`Program linking failed:\n${log}`)
  }

  return program
}

export function createProgram(
  gl: WebGL2RenderingContext,
  vertSource: string,
  fragSource: string,
): WebGLProgram {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSource)
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSource)
  return linkProgram(gl, vert, frag)
}

export interface UniformLocations {
  [name: string]: WebGLUniformLocation | null
}

export function getUniformLocations(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  names: string[],
): UniformLocations {
  const locations: UniformLocations = {}
  for (const name of names) {
    locations[name] = gl.getUniformLocation(program, name)
  }
  return locations
}
