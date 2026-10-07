/**
 * Camada custom MapLibre: partículas de vento na GPU (WebGL2).
 *
 * - Simulação inteiramente na GPU com transform feedback: cada partícula é um
 *   vec4 (x, y em Mercator 0..1, idade, velocidade m/s). Não há upload por frame.
 * - Rasto geográfico (não um framebuffer de «fade» em ecrã): guardamos as
 *   últimas T posições num anel de buffers e desenhamos T−1 segmentos
 *   instanciados. Por isso o rasto acompanha pan/zoom sem borrões.
 * - As partículas renascem dentro da vista actual, por isso a densidade
 *   mantém-se ao fazer zoom.
 * - Modo estático (prefers-reduced-motion): setas fixas numa grelha, mesma
 *   paleta em nós.
 */
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from 'maplibre-gl';
import { createDataTexture, GLSL_PALETTES, link, uniforms, uploadDataTexture } from './gl';
import { lonToMercX, latToMercY, WIND_RANGE_MS } from './field';

const UPDATE_VS = /* glsl */ `#version 300 es
precision highp float;
in vec4 a_state;
uniform sampler2D u_field;
uniform vec4 u_bbox;
uniform vec4 u_view;
uniform float u_step;
uniform float u_seed;
uniform float u_maxAge;
out vec4 v_state;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
vec4 fieldAt(vec2 m) {
  return texture(u_field, (m - u_bbox.xy) / (u_bbox.zw - u_bbox.xy));
}
bool inBox(vec2 m, vec4 b) {
  return m.x >= b.x && m.x <= b.z && m.y >= b.y && m.y <= b.w;
}
void main() {
  vec2 p = a_state.xy;
  float age = a_state.z + 1.0;
  vec4 f = fieldAt(p);
  vec2 vel = (f.rg - 0.5) * ${(2 * WIND_RANGE_MS).toFixed(1)};
  // Mercator: y cresce para sul.
  vec2 np = p + vec2(vel.x, -vel.y) * u_step;
  float id = float(gl_VertexID);
  float life = u_maxAge * (0.55 + 0.45 * hash(vec2(id * 0.731, 3.1)));
  bool dead = age > life
    || f.a < 0.06
    || !inBox(np, u_view)
    || !inBox(np, u_bbox)
    || hash(vec2(id * 0.013 + u_seed, u_seed * 1.7)) < 0.002;
  float spd = length(vel);
  if (dead) {
    vec2 lo = max(u_view.xy, u_bbox.xy);
    vec2 hi = min(u_view.zw, u_bbox.zw);
    // Três tentativas: preferir células com confiança (mar/costa).
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      vec2 r = vec2(hash(vec2(id + fk * 17.0, u_seed)), hash(vec2(u_seed * 1.37 + fk, id * 0.59)));
      np = mix(lo, hi, r);
      if (fieldAt(np).a > 0.25) break;
    }
    age = 0.0;
    spd = length((fieldAt(np).rg - 0.5) * ${(2 * WIND_RANGE_MS).toFixed(1)});
  }
  v_state = vec4(np, age, spd);
}`;

const UPDATE_FS = /* glsl */ `#version 300 es
precision mediump float;
out vec4 o;
void main() { o = vec4(0.0); }`;

/** Segmento entre dois estados consecutivos de uma partícula, como quad. */
const TRAIL_VS = /* glsl */ `#version 300 es
precision highp float;
in vec2 a_corner;   // x: 0..1 ao longo, y: -1/1 lado
in vec4 a_a;        // estado mais antigo
in vec4 a_b;        // estado mais recente
uniform mat4 u_matrix;
uniform vec2 u_viewport;
uniform float u_width;
uniform float u_alpha;
out float v_speed;
out float v_alpha;
out float v_side;
void main() {
  bool ok = a_b.z > a_a.z && a_a.z > 0.5;
  vec4 c0 = u_matrix * vec4(a_a.xy, 0.0, 1.0);
  vec4 c1 = u_matrix * vec4(a_b.xy, 0.0, 1.0);
  vec2 s0 = c0.xy / c0.w * u_viewport * 0.5;
  vec2 s1 = c1.xy / c1.w * u_viewport * 0.5;
  vec2 d = s1 - s0;
  float len = length(d);
  if (!ok || len > 60.0 || c0.w <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 n = vec2(-dir.y, dir.x);
  vec4 c = mix(c0, c1, a_corner.x);
  vec2 off = n * a_corner.y * u_width * 0.5 + dir * (a_corner.x * 2.0 - 1.0) * u_width * 0.5;
  c.xy += off / (u_viewport * 0.5) * c.w;
  gl_Position = c;
  v_speed = a_b.w;
  v_alpha = u_alpha * smoothstep(0.0, 10.0, a_a.z);
  v_side = a_corner.y;
}`;

const LINE_FS = /* glsl */ `#version 300 es
precision mediump float;
in float v_speed;
in float v_alpha;
in float v_side;
uniform float u_opacity;
out vec4 o;
${GLSL_PALETTES}
void main() {
  float aa = 1.0 - smoothstep(0.35, 1.0, abs(v_side));
  float a = v_alpha * aa * u_opacity;
  vec3 c = windColor(v_speed * 1.943844);
  o = vec4(c * a, a);
}`;

/** Seta estática: âncora + vector, forma em pixels de ecrã. */
const ARROW_VS = /* glsl */ `#version 300 es
precision highp float;
in vec4 a_seg;      // p0.xy, p1.xy em unidades da seta (x = sentido do vento)
in vec2 a_corner;
in vec2 a_anchor;   // Mercator
in vec3 a_wind;     // u, v (m/s), confiança
uniform mat4 u_matrix;
uniform vec2 u_viewport;
uniform float u_width;
uniform float u_scale;
out float v_speed;
out float v_alpha;
out float v_side;
void main() {
  vec4 c = u_matrix * vec4(a_anchor, 0.0, 1.0);
  float spd = length(a_wind.xy);
  vec2 w = spd > 0.05 ? a_wind.xy / spd : vec2(0.0, 1.0);
  float L = mix(9.0, 22.0, clamp(spd / 15.0, 0.0, 1.0)) * u_scale;
  mat2 R = mat2(w.x, w.y, -w.y, w.x);
  vec2 p0 = R * a_seg.xy * L;
  vec2 p1 = R * a_seg.zw * L;
  vec2 d = p1 - p0;
  float len = max(length(d), 1e-4);
  vec2 dir = d / len;
  vec2 n = vec2(-dir.y, dir.x);
  vec2 p = mix(p0, p1, a_corner.x) + n * a_corner.y * u_width * 0.5
         + dir * (a_corner.x * 2.0 - 1.0) * u_width * 0.5;
  c.xy += p / (u_viewport * 0.5) * c.w;
  gl_Position = c;
  v_speed = spd;
  v_alpha = smoothstep(0.2, 0.6, a_wind.z) * 0.9;
  v_side = a_corner.y;
}`;

/** 6 vértices por quad: (ao longo, lado). */
const QUAD = new Float32Array([0, -1, 1, -1, 1, 1, 0, -1, 1, 1, 0, 1]);

/** Seta: haste centrada + duas farpas na ponta. */
const ARROW_SEGS: [number, number, number, number][] = [
  [-0.5, 0, 0.5, 0],
  [0.5, 0, 0.22, 0.2],
  [0.5, 0, 0.22, -0.2],
];

export interface WindLayerOptions {
  count: number;
  trail: number;
  bounds: [number, number, number, number];
  gridW: number;
  gridH: number;
}

export class WindParticleLayer implements CustomLayerInterface {
  id = 'mar-vivo-wind';
  type = 'custom' as const;
  renderingMode = '2d' as const;

  private map: MlMap | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private opts: WindLayerOptions;
  private updateProg: WebGLProgram | null = null;
  private trailProg: WebGLProgram | null = null;
  private arrowProg: WebGLProgram | null = null;
  private uUpd: Record<string, WebGLUniformLocation | null> = {};
  private uTrail: Record<string, WebGLUniformLocation | null> = {};
  private uArrow: Record<string, WebGLUniformLocation | null> = {};
  private states: WebGLBuffer[] = [];
  private tfs: WebGLTransformFeedback[] = [];
  private updVaos: WebGLVertexArrayObject[] = [];
  private trailVaos: WebGLVertexArrayObject[] = [];
  private quadBuf: WebGLBuffer | null = null;
  private arrowGeomBuf: WebGLBuffer | null = null;
  private arrowInstBuf: WebGLBuffer | null = null;
  private arrowVao: WebGLVertexArrayObject | null = null;
  private arrowCount = 0;
  private arrowData: Float32Array | null = null;
  private fieldTex: WebGLTexture | null = null;
  private pendingField: Uint8Array | null = null;
  private head = 0;

  /** Animação ligada (partículas) ou setas estáticas. */
  animate = true;
  opacity = 1;

  constructor(opts: WindLayerOptions) {
    this.opts = opts;
  }

  /** Novo campo amostrado (RGBA8, ver field.ts). Upload no próximo frame. */
  setField(data: Uint8Array): void {
    this.pendingField = data;
  }

  /** Setas estáticas: [mx, my, u, v, mask] por seta. */
  setArrows(data: Float32Array): void {
    this.arrowData = data;
  }

  onAdd(map: MlMap, glCtx: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;
    if (typeof WebGL2RenderingContext === 'undefined' || !(glCtx instanceof WebGL2RenderingContext)) {
      throw new Error('mar-vivo: WebGL2 necessário para as partículas');
    }
    const gl = glCtx;
    this.gl = gl;
    const { count, trail } = this.opts;

    this.updateProg = link(gl, UPDATE_VS, UPDATE_FS, ['v_state']);
    this.uUpd = uniforms(gl, this.updateProg, ['u_field', 'u_bbox', 'u_view', 'u_step', 'u_seed', 'u_maxAge']);
    this.trailProg = link(gl, TRAIL_VS, LINE_FS);
    this.uTrail = uniforms(gl, this.trailProg, ['u_matrix', 'u_viewport', 'u_width', 'u_alpha', 'u_opacity']);
    this.arrowProg = link(gl, ARROW_VS, LINE_FS);
    this.uArrow = uniforms(gl, this.arrowProg, ['u_matrix', 'u_viewport', 'u_width', 'u_scale', 'u_opacity']);

    this.fieldTex = createDataTexture(gl, this.opts.gridW, this.opts.gridH);

    // Estado inicial: posições aleatórias na grelha, idade 0 (sem rasto).
    const [x0, y0, x1, y1] = this.opts.bounds;
    const init = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      init[i * 4] = x0 + Math.random() * (x1 - x0);
      init[i * 4 + 1] = y0 + Math.random() * (y1 - y0);
      init[i * 4 + 2] = 0;
      init[i * 4 + 3] = 0;
    }
    for (let k = 0; k < trail; k++) {
      const b = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, init, gl.DYNAMIC_COPY);
      this.states.push(b);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    for (let k = 0; k < trail; k++) {
      const tf = gl.createTransformFeedback()!;
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tf);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.states[k]);
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
      gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, null);
      this.tfs.push(tf);
    }

    const locState = gl.getAttribLocation(this.updateProg, 'a_state');
    for (let k = 0; k < trail; k++) {
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.states[k]);
      gl.enableVertexAttribArray(locState);
      gl.vertexAttribPointer(locState, 4, gl.FLOAT, false, 16, 0);
      this.updVaos.push(vao);
    }

    this.quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);

    const locCorner = gl.getAttribLocation(this.trailProg, 'a_corner');
    const locA = gl.getAttribLocation(this.trailProg, 'a_a');
    const locB = gl.getAttribLocation(this.trailProg, 'a_b');
    for (let k = 0; k < trail; k++) {
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
      gl.enableVertexAttribArray(locCorner);
      gl.vertexAttribPointer(locCorner, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.states[k]);
      gl.enableVertexAttribArray(locA);
      gl.vertexAttribPointer(locA, 4, gl.FLOAT, false, 16, 0);
      gl.vertexAttribDivisor(locA, 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.states[(k + 1) % trail]);
      gl.enableVertexAttribArray(locB);
      gl.vertexAttribPointer(locB, 4, gl.FLOAT, false, 16, 0);
      gl.vertexAttribDivisor(locB, 1);
      this.trailVaos.push(vao);
    }

    // Geometria da seta: 3 segmentos × 6 vértices × (seg vec4 + corner vec2).
    const geom: number[] = [];
    for (const s of ARROW_SEGS) {
      for (let v = 0; v < 6; v++) geom.push(s[0], s[1], s[2], s[3], QUAD[v * 2], QUAD[v * 2 + 1]);
    }
    this.arrowGeomBuf = gl.createBuffer();
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.arrowGeomBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geom), gl.STATIC_DRAW);
    this.arrowInstBuf = gl.createBuffer();
    this.arrowVao = gl.createVertexArray();
    gl.bindVertexArray(this.arrowVao);
    const ap = this.arrowProg;
    const lSeg = gl.getAttribLocation(ap, 'a_seg');
    const lCor = gl.getAttribLocation(ap, 'a_corner');
    const lAnc = gl.getAttribLocation(ap, 'a_anchor');
    const lWind = gl.getAttribLocation(ap, 'a_wind');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.arrowGeomBuf);
    gl.enableVertexAttribArray(lSeg);
    gl.vertexAttribPointer(lSeg, 4, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(lCor);
    gl.vertexAttribPointer(lCor, 2, gl.FLOAT, false, 24, 16);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.arrowInstBuf);
    gl.enableVertexAttribArray(lAnc);
    gl.vertexAttribPointer(lAnc, 2, gl.FLOAT, false, 20, 0);
    gl.vertexAttribDivisor(lAnc, 1);
    gl.enableVertexAttribArray(lWind);
    gl.vertexAttribPointer(lWind, 3, gl.FLOAT, false, 20, 8);
    gl.vertexAttribDivisor(lWind, 1);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  private flushUploads(gl: WebGL2RenderingContext): void {
    if (this.pendingField && this.fieldTex) {
      uploadDataTexture(gl, this.fieldTex, this.opts.gridW, this.opts.gridH, this.pendingField);
      this.pendingField = null;
    }
    if (this.arrowData && this.arrowInstBuf) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.arrowInstBuf);
      gl.bufferData(gl.ARRAY_BUFFER, this.arrowData, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      this.arrowCount = this.arrowData.length / 5;
      this.arrowData = null;
    }
  }

  /** Vista actual em Mercator, com margem, recortada à grelha. */
  private viewBounds(): [number, number, number, number] {
    const b = this.map!.getBounds();
    const x0 = lonToMercX(b.getWest());
    const x1 = lonToMercX(b.getEast());
    const y0 = latToMercY(Math.min(85, b.getNorth()));
    const y1 = latToMercY(Math.max(-85, b.getSouth()));
    const px = (x1 - x0) * 0.04;
    const py = (y1 - y0) * 0.04;
    return [x0 - px, y0 - py, x1 + px, y1 + py];
  }

  prerender(glCtx: WebGLRenderingContext | WebGL2RenderingContext): void {
    const gl = glCtx as WebGL2RenderingContext;
    this.flushUploads(gl);
    if (!this.animate || !this.updateProg || !this.map) return;

    const { trail, count, bounds } = this.opts;
    const next = (this.head + 1) % trail;
    const zoom = this.map.getZoom();
    const mercPerPx = 1 / (512 * Math.pow(2, zoom));

    gl.useProgram(this.updateProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTex);
    gl.uniform1i(this.uUpd.u_field, 0);
    gl.uniform4f(this.uUpd.u_bbox, bounds[0], bounds[1], bounds[2], bounds[3]);
    const v = this.viewBounds();
    gl.uniform4f(this.uUpd.u_view, v[0], v[1], v[2], v[3]);
    // ~0.11 px por frame por m/s → 10 m/s ≈ 66 px/s a 60 fps, igual em qualquer zoom.
    gl.uniform1f(this.uUpd.u_step, 0.11 * mercPerPx);
    gl.uniform1f(this.uUpd.u_seed, Math.random() * 1000);
    gl.uniform1f(this.uUpd.u_maxAge, 110);

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindVertexArray(this.updVaos[this.head]);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.tfs[next]);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, count);
    gl.endTransformFeedback();
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.head = next;
  }

  render(glCtx: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput): void {
    const gl = glCtx as WebGL2RenderingContext;
    this.flushUploads(gl);
    const matrix = new Float32Array(args.defaultProjectionData.mainMatrix as ArrayLike<number>);
    const vw = gl.drawingBufferWidth;
    const vh = gl.drawingBufferHeight;
    const dpr = vw / Math.max(1, this.map!.getCanvas().clientWidth);

    if (this.animate) {
      const { trail, count } = this.opts;
      gl.useProgram(this.trailProg);
      gl.uniformMatrix4fv(this.uTrail.u_matrix, false, matrix);
      gl.uniform2f(this.uTrail.u_viewport, vw, vh);
      gl.uniform1f(this.uTrail.u_width, 1.4 * dpr);
      gl.uniform1f(this.uTrail.u_opacity, this.opacity);
      for (let j = 0; j < trail - 1; j++) {
        const older = (this.head - j - 1 + trail * 2) % trail;
        const alpha = 0.95 * (1 - j / (trail - 1));
        gl.uniform1f(this.uTrail.u_alpha, alpha);
        gl.bindVertexArray(this.trailVaos[older]);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
      }
    } else if (this.arrowCount > 0) {
      gl.useProgram(this.arrowProg);
      gl.uniformMatrix4fv(this.uArrow.u_matrix, false, matrix);
      gl.uniform2f(this.uArrow.u_viewport, vw, vh);
      gl.uniform1f(this.uArrow.u_width, 1.6 * dpr);
      gl.uniform1f(this.uArrow.u_scale, dpr);
      gl.uniform1f(this.uArrow.u_opacity, this.opacity);
      gl.bindVertexArray(this.arrowVao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 18, this.arrowCount);
    }
    gl.bindVertexArray(null);
  }

  onRemove(_map: MlMap, glCtx: WebGLRenderingContext | WebGL2RenderingContext): void {
    const gl = glCtx as WebGL2RenderingContext;
    this.states.forEach((b) => gl.deleteBuffer(b));
    this.tfs.forEach((t) => gl.deleteTransformFeedback(t));
    [...this.updVaos, ...this.trailVaos].forEach((v) => gl.deleteVertexArray(v));
    if (this.arrowVao) gl.deleteVertexArray(this.arrowVao);
    [this.quadBuf, this.arrowGeomBuf, this.arrowInstBuf].forEach((b) => b && gl.deleteBuffer(b));
    if (this.fieldTex) gl.deleteTexture(this.fieldTex);
    [this.updateProg, this.trailProg, this.arrowProg].forEach((p) => p && gl.deleteProgram(p));
    this.map = null;
    this.gl = null;
  }
}
