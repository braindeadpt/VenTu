/**
 * Camada custom MapLibre: cristas de ondulação animadas (WebGL2, fragment shader).
 *
 * Um único quad cobre a grelha. Em cada pixel:
 *   s     = distância (m) ao longo da direcção de propagação local
 *   L0    = 1.56·Tp²  (comprimento de onda em águas profundas)
 *   fase  = (s / L0 − τ) / E
 * τ é um relógio uniforme em «comprimentos de onda» (avança no CPU com
 * velocidade de ecrã constante) e E um exagero em potências de 2 escolhido pelo
 * zoom — cruzamos duas oitavas para que as cristas não «saltem» ao fazer zoom.
 * Resultado: espaçamento ∝ Tp² e velocidade ∝ Tp² no ecrã (períodos longos
 * passam mais largos e mais rápidos), cor pela Hs. Por baixo, uma tinta suave
 * de Hs funciona como campo de cor (e é o que fica em movimento reduzido).
 * A terra é tapada por uma camada `fill` (Natural Earth) desenhada por cima.
 */
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from 'maplibre-gl';
import { createDataTexture, GLSL_PALETTES, link, uniforms, uploadDataTexture } from './gl';
import { HS_RANGE_M, mercYToLat, TP_RANGE_S } from './field';

const VS = /* glsl */ `#version 300 es
precision highp float;
in vec2 a_uv;
uniform mat4 u_matrix;
uniform vec4 u_bbox;
uniform float u_mpm; // metros por unidade Mercator na latitude central
out vec2 v_uv;
out vec2 v_m;
void main() {
  vec2 m = mix(u_bbox.xy, u_bbox.zw, a_uv);
  v_uv = a_uv;
  v_m = (m - u_bbox.xy) * u_mpm; // metros (x = este, y = sul) desde o canto NW
  gl_Position = u_matrix * vec4(m, 0.0, 1.0);
}`;

const FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
in vec2 v_m;
uniform sampler2D u_field;
uniform sampler2D u_swell;
uniform float u_tau;
uniform float u_e0;
uniform float u_mix;
uniform float u_opacity;
uniform float u_lines;
out vec4 o;
${GLSL_PALETTES}

float crest(float ph) {
  float fw = max(fwidth(ph), 1e-4);
  float x = fract(ph);
  // Frente nítida (~1.3 px) e um rasto suave atrás da crista.
  float core = 1.0 - smoothstep(0.0, 1.3 * fw, min(x, 1.0 - x));
  float back = smoothstep(0.55, 1.0, x) * 0.28;
  // Se as linhas ficarem mais densas do que ~4 px, apagam-se em vez de fazer moiré.
  float fade = 1.0 - smoothstep(0.12, 0.25, fw);
  return max(core, back) * fade;
}

void main() {
  vec4 f = texture(u_field, v_uv);
  vec4 s = texture(u_swell, v_uv);
  float hs = f.b * ${HS_RANGE_M.toFixed(1)};
  float tp = max(s.b * ${TP_RANGE_S.toFixed(1)}, 4.0);
  vec2 dir = s.rg * 2.0 - 1.0;
  float dl = length(dir);
  // Sem discard: as derivadas (fwidth) têm de correr em fluxo uniforme.
  float conf = (dl < 0.2) ? 0.0 : s.a;
  dir /= max(dl, 1e-3);
  // v_m.y é para sul; dir.y é para norte.
  float sAlong = v_m.x * dir.x - v_m.y * dir.y;
  float L0 = 1.56 * tp * tp;
  float base = sAlong / L0 - u_tau;
  float c = mix(crest(base / u_e0), crest(base / (2.0 * u_e0)), u_mix);
  vec3 col = hsColor(hs);
  float hsW = smoothstep(0.15, 0.7, hs);
  float tint = 0.16 * smoothstep(0.0, 2.4, hs) + 0.05;
  float lineA = c * u_lines * (0.35 + 0.6 * hsW);
  float a = clamp((tint + lineA) * conf * u_opacity, 0.0, 1.0);
  vec3 rgb = mix(col * 0.75, col, clamp(lineA * 2.0, 0.0, 1.0));
  o = vec4(rgb * a, a);
}`;

export interface SwellLayerOptions {
  bounds: [number, number, number, number];
  gridW: number;
  gridH: number;
}

export class SwellCrestLayer implements CustomLayerInterface {
  id = 'mar-vivo-swell';
  type = 'custom' as const;
  renderingMode = '2d' as const;

  private map: MlMap | null = null;
  private opts: SwellLayerOptions;
  private prog: WebGLProgram | null = null;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private vao: WebGLVertexArrayObject | null = null;
  private buf: WebGLBuffer | null = null;
  private fieldTex: WebGLTexture | null = null;
  private swellTex: WebGLTexture | null = null;
  private pendingField: Uint8Array | null = null;
  private pendingSwell: Uint8Array | null = null;
  private tau = 0;
  private lastMs = 0;

  animate = true;
  opacity = 1;
  /** 0 = só tinta de Hs (sem dados de direcção/período). */
  lines = 1;

  constructor(opts: SwellLayerOptions) {
    this.opts = opts;
  }

  setField(wind: Uint8Array, swell: Uint8Array): void {
    this.pendingField = wind;
    this.pendingSwell = swell;
  }

  onAdd(map: MlMap, glCtx: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;
    const gl = glCtx as WebGL2RenderingContext;
    this.prog = link(gl, VS, FS);
    this.u = uniforms(gl, this.prog, [
      'u_matrix', 'u_bbox', 'u_mpm', 'u_field', 'u_swell', 'u_tau', 'u_e0', 'u_mix', 'u_opacity', 'u_lines',
    ]);
    this.fieldTex = createDataTexture(gl, this.opts.gridW, this.opts.gridH);
    this.swellTex = createDataTexture(gl, this.opts.gridW, this.opts.gridH);
    this.buf = gl.createBuffer();
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.prog, 'a_uv');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  render(glCtx: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput): void {
    const gl = glCtx as WebGL2RenderingContext;
    if (!this.prog || !this.map) return;
    const { gridW, gridH, bounds } = this.opts;
    if (this.pendingField && this.fieldTex) {
      uploadDataTexture(gl, this.fieldTex, gridW, gridH, this.pendingField);
      this.pendingField = null;
    }
    if (this.pendingSwell && this.swellTex) {
      uploadDataTexture(gl, this.swellTex, gridW, gridH, this.pendingSwell);
      this.pendingSwell = null;
    }

    const zoom = this.map.getZoom();
    const centerLat = mercYToLat((bounds[1] + bounds[3]) / 2);
    const mpm = 40075016.686 * Math.cos((centerLat * Math.PI) / 180);
    const mpp = mpm / (512 * Math.pow(2, zoom)); // metros por pixel CSS
    // Exagero: crista de Tp=10 s (L0≈156 m) a ~24 px no ecrã.
    const eTarget = Math.min(2048, Math.max(1, (24 * mpp) / 156));
    const lg = Math.log2(eTarget);
    const e0 = Math.pow(2, Math.floor(lg));
    const mixW = lg - Math.floor(lg);

    const now = performance.now();
    const dt = this.lastMs ? Math.min(0.1, (now - this.lastMs) / 1000) : 0;
    this.lastMs = now;
    if (this.animate) {
      // τ avança ~20 px/s para Tp=10 s, em qualquer zoom.
      this.tau += (dt * 20 * mpp) / 156;
      // Mantém τ pequeno sem saltos: múltiplos de 4096 preservam todas as oitavas ≤ 2048.
      if (this.tau > 4096) this.tau -= 4096;
    }

    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(
      this.u.u_matrix,
      false,
      new Float32Array(args.defaultProjectionData.mainMatrix as ArrayLike<number>),
    );
    gl.uniform4f(this.u.u_bbox, bounds[0], bounds[1], bounds[2], bounds[3]);
    gl.uniform1f(this.u.u_mpm, mpm);
    gl.uniform1f(this.u.u_tau, this.tau);
    gl.uniform1f(this.u.u_e0, e0);
    gl.uniform1f(this.u.u_mix, mixW);
    gl.uniform1f(this.u.u_opacity, this.opacity);
    gl.uniform1f(this.u.u_lines, this.lines);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTex);
    gl.uniform1i(this.u.u_field, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.swellTex);
    gl.uniform1i(this.u.u_swell, 1);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  onRemove(_map: MlMap, glCtx: WebGLRenderingContext | WebGL2RenderingContext): void {
    const gl = glCtx as WebGL2RenderingContext;
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.buf) gl.deleteBuffer(this.buf);
    if (this.fieldTex) gl.deleteTexture(this.fieldTex);
    if (this.swellTex) gl.deleteTexture(this.swellTex);
    if (this.prog) gl.deleteProgram(this.prog);
    this.map = null;
  }
}
