/** Utilitários WebGL2 mínimos para as camadas custom do lab. */

export function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('createShader failed');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`shader: ${log}`);
  }
  return sh;
}

export function link(
  gl: WebGL2RenderingContext,
  vs: string,
  fs: string,
  feedbackVaryings?: string[],
): WebGLProgram {
  const p = gl.createProgram();
  if (!p) throw new Error('createProgram failed');
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  if (feedbackVaryings) gl.transformFeedbackVaryings(p, feedbackVaryings, gl.INTERLEAVED_ATTRIBS);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`link: ${gl.getProgramInfoLog(p)}`);
  }
  return p;
}

export function uniforms(
  gl: WebGL2RenderingContext,
  p: WebGLProgram,
  names: string[],
): Record<string, WebGLUniformLocation | null> {
  const out: Record<string, WebGLUniformLocation | null> = {};
  for (const n of names) out[n] = gl.getUniformLocation(p, n);
  return out;
}

/** Textura RGBA8 com filtragem linear, pronta para `texSubImage2D` a cada passo. */
export function createDataTexture(gl: WebGL2RenderingContext, w: number, h: number): WebGLTexture {
  const t = gl.createTexture();
  if (!t) throw new Error('createTexture failed');
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return t;
}

export function uploadDataTexture(
  gl: WebGL2RenderingContext,
  t: WebGLTexture,
  w: number,
  h: number,
  data: Uint8Array,
): void {
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

/** Paletas partilhadas pelos shaders (GLSL). Tokens do design system. */
export const GLSL_PALETTES = /* glsl */ `
// Vento em nós: calmo → --data-water (cyan-400) → --data-wind (violet-400)
// → --data-period (amber-400) → --score-poor (red-400) acima de 30 kn.
vec3 windColor(float kn) {
  vec3 calm = vec3(0.58, 0.64, 0.72);   // slate-400
  vec3 c1 = vec3(0.133, 0.827, 0.933);  // cyan-400
  vec3 c2 = vec3(0.655, 0.545, 0.980);  // violet-400
  vec3 c3 = vec3(0.984, 0.749, 0.141);  // amber-400
  vec3 c4 = vec3(0.973, 0.443, 0.443);  // red-400
  vec3 c = mix(calm, c1, smoothstep(4.0, 10.0, kn));
  c = mix(c, c2, smoothstep(12.0, 18.0, kn));
  c = mix(c, c3, smoothstep(18.0, 25.0, kn));
  c = mix(c, c4, smoothstep(26.0, 32.0, kn));
  return c;
}
// Hs: --data-waves sky-700 → sky-500 → espuma (--fg) — igual ao campo Hs do /mapa.
vec3 hsColor(float hs) {
  vec3 deep = vec3(0.012, 0.412, 0.631);
  vec3 wave = vec3(0.055, 0.647, 0.914);
  vec3 foam = vec3(0.945, 0.961, 0.976);
  vec3 c = mix(deep, wave, smoothstep(0.3, 1.4, hs));
  return mix(c, foam, smoothstep(1.6, 3.2, hs));
}
`;
