import type { RefObject } from 'preact'
import { useCallback, useRef } from 'preact/hooks'
import type { Ring } from 'utils/ring'
import { FINAL_OUT_ANALYSER_L_INDEX, FINAL_OUT_ANALYSER_R_INDEX } from '../../../as/assembly/constants.ts'
import { WaveformBuffer } from '../../lib/waveform-buffer.ts'
import type { ProgramInstance } from '../dsp/program.ts'

type Params = {
  program1: ProgramInstance | undefined
  ringPos: Uint8Array<SharedArrayBuffer> | undefined
  isLive: boolean
  sampleRate: number | undefined
  pointStride?: number
  vertex?: string
  fragment?: string
}

type WaveState = {
  waveform: WaveformBuffer
  floats: Float32Array | null
}

type ProgramState = {
  program: WebGLProgram
  uColor: WebGLUniformLocation | null
  uScale: WebGLUniformLocation | null
  uRes: WebGLUniformLocation | null
  uTime: WebGLUniformLocation | null
  key: string
}

type GlState = {
  canvas: HTMLCanvasElement
  gl: WebGL2RenderingContext
  programState: ProgramState
  vao: WebGLVertexArrayObject
  vbo: WebGLBuffer
  capVerts: number
}

function clamp11(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const sh = gl.createShader(type)
  if (!sh) throw new Error('Failed to create shader')
  gl.shaderSource(sh, source)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(sh) ?? 'Unknown shader error'
    gl.deleteShader(sh)
    throw new Error(info)
  }
  return sh
}

function mainSource(src: string | undefined, fallback: string): string {
  const s = src?.trim()
  return s ? s : fallback
}

const DEFAULT_VERTEX_MAIN = `
gl_Position = vec4(v_pos * 0.9 * u_scale, 0.0, 1.0);
`.trim()

const DEFAULT_FRAGMENT_MAIN = `
gl_FragColor = u_color;
`.trim()

function shaderKey(params: { vertexMain?: string; fragmentMain?: string }): string {
  const vertexMain = mainSource(params.vertexMain, DEFAULT_VERTEX_MAIN)
  const fragmentMain = mainSource(params.fragmentMain, DEFAULT_FRAGMENT_MAIN)
  return `${vertexMain}\n--\n${fragmentMain}`
}

function createProgram(
  gl: WebGL2RenderingContext,
  params: { vertexMain?: string; fragmentMain?: string },
): ProgramState {
  const vertexMain = mainSource(params.vertexMain, DEFAULT_VERTEX_MAIN)
  const fragmentMain = mainSource(params.fragmentMain, DEFAULT_FRAGMENT_MAIN)

  const vsSource = `
#version 300 es
precision highp float;
layout(location = 0) in vec2 a_audio;
layout(location = 1) in float a_t;
uniform vec4 u_color;
uniform vec2 u_scale;
uniform vec2 u_res;
uniform float u_time;
out vec2 v_audio;
out vec2 v_pos;
out float v_t;
void main() {
  v_audio = a_audio;
  v_t = a_t;
  v_pos = vec2(a_audio.y, a_audio.x);
${vertexMain}
}
`.trim()

  const fsSource = `
#version 300 es
precision mediump float;
uniform vec4 u_color;
uniform vec2 u_res;
uniform float u_time;
in vec2 v_audio;
in vec2 v_pos;
in float v_t;
out vec4 outColor;
#define gl_FragColor outColor
void main() {
  outColor = vec4(0.0);
${fragmentMain}
}
`.trim()

  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource)
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource)
  const prog = gl.createProgram()
  if (!prog) throw new Error('Failed to create program')
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  gl.deleteShader(vs)
  gl.deleteShader(fs)

  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(prog) ?? 'Unknown program link error'
    gl.deleteProgram(prog)
    throw new Error(info)
  }

  return {
    program: prog,
    uColor: gl.getUniformLocation(prog, 'u_color'),
    uScale: gl.getUniformLocation(prog, 'u_scale'),
    uRes: gl.getUniformLocation(prog, 'u_res'),
    uTime: gl.getUniformLocation(prog, 'u_time'),
    key: shaderKey({ vertexMain, fragmentMain }),
  }
}

function ensureProgram(glState: GlState, params: { vertexMain?: string; fragmentMain?: string }): boolean {
  const desiredKey = shaderKey(params)
  if (glState.programState.key === desiredKey) return true
  try {
    const next = createProgram(glState.gl, params)
    glState.gl.deleteProgram(glState.programState.program)
    glState.programState = next
    return true
  }
  catch (err) {
    console.warn('Visualizer shader compile failed:', err)
    return false
  }
}

export function useVisualizerBackground({
  program1,
  ringPos,
  isLive,
  sampleRate,
  pointStride = 8,
  vertex,
  fragment,
}: Params): {
  canvasRef: RefObject<HTMLCanvasElement>
  onBeforeDraw: () => void
} {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glRef = useRef<GlState | null>(null)

  const vertsRef = useRef<Float32Array>(new Float32Array(2048 * 3))

  const waveRef = useRef<{ left: WaveState; right: WaveState } | null>(null)
  if (!waveRef.current) {
    waveRef.current = {
      left: { waveform: new WaveformBuffer(), floats: null },
      right: { waveform: new WaveformBuffer(), floats: null },
    }
  }

  const t0Ref = useRef<number>(performance.now())

  const onBeforeDraw = useCallback(() => {
    if (!isLive) return

    const canvas = canvasRef.current
    if (!canvas) return

    const analyserOuts = program1?.program?.analyserOuts
    if (!analyserOuts || !ringPos) return

    const ringL = analyserOuts[FINAL_OUT_ANALYSER_L_INDEX] as Ring | undefined
    const ringR = analyserOuts[FINAL_OUT_ANALYSER_R_INDEX] as Ring | undefined
    if (!ringL || !ringR) return

    const currentChunkPos = Atomics.load(ringPos, 0)
    const st = waveRef.current
    if (!st) return

    const lFloats = st.left.waveform.update(ringL, currentChunkPos)
    const rFloats = st.right.waveform.update(ringR, currentChunkPos)
    if (lFloats) st.left.floats = lFloats
    if (rFloats) st.right.floats = rFloats

    const floatsL = st.left.floats
    const floatsR = st.right.floats
    if (!floatsL || !floatsR) return

    const samplesWanted = 2048
    const sr = sampleRate ?? 48000
    const maxDelay = Math.max(0, Math.min(floatsL.length - samplesWanted, floatsR.length - samplesWanted))
    const delaySamples = Math.max(0, Math.min(maxDelay, Math.floor(sr * 0.1)))
    const needed = delaySamples + samplesWanted
    if (needed <= 0 || floatsL.length < needed || floatsR.length < needed) return

    const start = Math.max(0, floatsL.length - needed)

    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth | 0
    const h = canvas.clientHeight | 0
    if (w <= 1 || h <= 1) return

    const pxW = Math.max(1, Math.floor(w * dpr))
    const pxH = Math.max(1, Math.floor(h * dpr))
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW
      canvas.height = pxH
    }

    const stride = Math.max(1, pointStride | 0)
    const len = samplesWanted
    const pointCount = Math.max(0, Math.floor((len - 1) / stride) + 1)
    if (pointCount <= 1) return

    const floatsNeeded = pointCount * 3
    if (vertsRef.current.length < floatsNeeded) {
      vertsRef.current = new Float32Array(floatsNeeded)
    }

    const verts = vertsRef.current
    let o = 0
    const denom = Math.max(1, pointCount - 1)
    for (let i = 0; i < pointCount; i++) {
      const idx = start + i * stride
      const l = clamp11(floatsL[idx]!)
      const r = clamp11(floatsR[idx]!)
      verts[o++] = l
      verts[o++] = r
      verts[o++] = i / denom
    }

    let glState = glRef.current
    if (!glState || glState.canvas !== canvas) {
      const gl = canvas.getContext('webgl2', {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
      }) as WebGL2RenderingContext | null
      if (!gl) return

      let programState: ProgramState
      try {
        programState = createProgram(gl, { vertexMain: vertex, fragmentMain: fragment })
      }
      catch (err) {
        console.warn('Visualizer shader compile failed:', err)
        return
      }

      const vao = gl.createVertexArray()
      const vbo = gl.createBuffer()
      if (!vao || !vbo) return

      gl.bindVertexArray(vao)
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
      gl.bufferData(gl.ARRAY_BUFFER, verts.byteLength, gl.DYNAMIC_DRAW)

      // a_audio: vec2 (l, r)
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0)

      // a_t: float
      gl.enableVertexAttribArray(1)
      gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8)

      gl.bindVertexArray(null)

      glState = { canvas, gl, programState, vao, vbo, capVerts: pointCount }
      glRef.current = glState
    }
    else {
      if (!ensureProgram(glState, { vertexMain: vertex, fragmentMain: fragment })) return
      if (glState.capVerts < pointCount) {
        glState.capVerts = pointCount
        glState.gl.bindBuffer(glState.gl.ARRAY_BUFFER, glState.vbo)
        glState.gl.bufferData(glState.gl.ARRAY_BUFFER, verts.byteLength, glState.gl.DYNAMIC_DRAW)
      }
    }

    const gl = glState.gl
    const ps = glState.programState

    gl.viewport(0, 0, pxW, pxH)
    gl.disable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    gl.useProgram(ps.program)

    const sx = pxW > pxH ? pxH / pxW : 1
    const sy = pxH > pxW ? pxW / pxH : 1

    if (ps.uRes) gl.uniform2f(ps.uRes, pxW, pxH)
    if (ps.uTime) gl.uniform1f(ps.uTime, (performance.now() - t0Ref.current) * 0.001)
    if (ps.uScale) gl.uniform2f(ps.uScale, sx, sy)
    if (ps.uColor) gl.uniform4f(ps.uColor, 0xee / 255, 0xee / 255, 0xee / 255, 0xaa / 255)

    gl.bindVertexArray(glState.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, glState.vbo)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts.subarray(0, floatsNeeded))
    gl.drawArrays(gl.LINE_STRIP, 0, pointCount)
    gl.bindVertexArray(null)
  }, [isLive, program1, ringPos, sampleRate, pointStride, vertex, fragment])

  return { canvasRef, onBeforeDraw }
}


