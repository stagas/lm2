import {
  ARRAY_HEADER_SIZE,
  ARRAY_SIZE,
  ARRAYS_COUNT,
  CHUNK_SIZE,
  HISTORIES_COUNT,
  HISTORY_ENTRY_SIZE,
  HISTORY_HEADER_SIZE,
  HISTORY_SIZE,
} from '../../../as/assembly/constants.ts'
import type * as WasmExports from '../../../as/build/index'
import config from '../../../asconfig.json'
import { wasmSetup } from '../../lib/wasm-setup.ts'
import { compileMiniNotation } from '../../mini/compiler.ts'
import type { SampleDef } from '../bytecode/bytecode.ts'
import { DspStruct } from './assembly.ts'
import { createProgramInstance } from './program.ts'
import type { LoadedSample } from './sample-loader.ts'
import { type Sample, workletImports } from './worklet-imports.ts'

export type VisualWasm = Awaited<ReturnType<typeof createVisualWasm>>

type SeqBuffers = {
  array$: number
  array: Float32Array
  history$: number
  history: Float32Array
  seq: string
  version: number
  scaleIndex: number | undefined
}

export type PreparedRecordSample = {
  sampleIndex: number
  url: string
  ver: number
  sampleRate: number
  length: number
  ch0Buffer: ArrayBuffer
}

export async function createVisualWasm(binary: ArrayBuffer, sourcemapUrl: string) {
  const samples = new Map<number, Sample>()
  let currentSampleRate = 48000

  let core: Awaited<ReturnType<typeof wasmSetup<typeof WasmExports>>>

  try {
    core = await wasmSetup<typeof WasmExports>({
      binary,
      sourcemapUrl,
      config,
      imports: ({ memory }) => workletImports(memory, samples),
    })
  }
  catch (error) {
    console.error(error)
    setTimeout(() => {
      location.reload()
    }, 1000)
    throw error
  }

  const wasm = core.wasm
  const memory = core.memory

  const seqs = new Map<number, SeqBuffers>()

  const ensureSeqBuffers = (seqIndex: number): SeqBuffers => {
    const existing = seqs.get(seqIndex)
    if (existing) return existing

    const array$ = wasm.createArray() as number
    const array = new Float32Array(memory.buffer, array$, ARRAY_HEADER_SIZE + ARRAY_SIZE)

    const history$ = wasm.createHistoryArray() as number
    const history = new Float32Array(
      memory.buffer,
      history$,
      HISTORY_HEADER_SIZE + HISTORY_SIZE * HISTORY_ENTRY_SIZE,
    )

    const st: SeqBuffers = {
      array$,
      array,
      history$,
      history,
      seq: '',
      version: 0,
      scaleIndex: undefined,
    }
    seqs.set(seqIndex, st)
    return st
  }

  const setMiniSequence = (seqIndex: number, seq: string, scaleIndex: number | undefined): SeqBuffers => {
    const st = ensureSeqBuffers(seqIndex)
    if (st.seq === seq && st.scaleIndex === scaleIndex) return st

    const compiled = compileMiniNotation(seq, scaleIndex === undefined ? {} : { defaultScale: { scaleIndex } })
    const bytecode = compiled.bytecode

    const maxSize = Math.min(bytecode.length, ARRAY_SIZE)
    st.array.set(bytecode.subarray(0, maxSize), ARRAY_HEADER_SIZE)
    st.array[0] = maxSize
    st.version += 1
    st.array[3] = st.version

    st.seq = seq
    st.scaleIndex = scaleIndex
    return st
  }

  const generateMiniHistoryWindow = (args: {
    seqIndex: number
    seq: string
    windowStartSample: number
    windowEndSample: number
    bpm: number
    sampleRate: number
    scaleIndex: number | undefined
    bar?: number
  }): Float32Array => {
    const { seqIndex, seq, windowStartSample, windowEndSample, bpm, sampleRate, scaleIndex } = args
    const bar = args.bar ?? 1
    const st = setMiniSequence(seqIndex, seq, scaleIndex)
    wasm.generateMiniHistoryWindow(
      st.array$,
      st.history$,
      Math.floor(windowStartSample),
      Math.floor(windowEndSample),
      bpm,
      sampleRate,
      bar,
    )

    return st.history
  }

  let offlineProgram: Awaited<ReturnType<typeof createProgramInstance>> | null = null
  let offlineSource: string | null = null
  let offlineDsp$ = 0
  let offlineDspView: ReturnType<typeof DspStruct> | null = null
  let offlineLeft$ = 0
  let offlineRight$ = 0

  const dummyControl = new Uint32Array(1)

  const localWorklet = {
    createProgram: async () => wasm.createProgram(),
    createArrays: async () => Array.from({ length: ARRAYS_COUNT }, () => wasm.createArray()),
    createHistories: async () => Array.from({ length: HISTORIES_COUNT }, () => wasm.createHistoryArray()),
    createProgramData: async () => wasm.createProgramData(),
  }

  async function ensureOfflineProgram(source: string) {
    if (offlineProgram && offlineSource === source) return

    offlineProgram = await createProgramInstance(localWorklet as any, memory, dummyControl)
    offlineSource = source

    if (!offlineDsp$) offlineDsp$ = (wasm.createDsp() as number) | 0
    offlineDspView = DspStruct(memory.buffer, offlineDsp$)
    offlineDspView.program = offlineProgram.program.ptr$

    if (!offlineLeft$) offlineLeft$ = (wasm.createFloat32Buffer(CHUNK_SIZE) as number) | 0
    if (!offlineRight$) offlineRight$ = (wasm.createFloat32Buffer(CHUNK_SIZE) as number) | 0

    // Compile source into this isolated program instance (writes into this wasm memory).
    await offlineProgram.program.compileSource(source, { apply: true, setData: true })
  }

  let prepareInFlight: Promise<Map<number, PreparedRecordSample>> | null = null
  const preparedUrlByIndex = new Map<number, string>()

  const prepareRecordSamples = async (args: {
    source: string
    sampleRate: number
    bpm: number
    sampleDefs: SampleDef[]
    loadedSamples: Array<LoadedSample | undefined>
  }): Promise<Map<number, PreparedRecordSample>> => {
    const recordDefs = args.sampleDefs.filter(s => s.provider === 'record')
    if (recordDefs.length === 0) return new Map()

    const needs = recordDefs.some(d => preparedUrlByIndex.get(d.sampleIndex) !== d.url)
    if (!needs) return new Map()
    if (prepareInFlight) return await prepareInFlight

    prepareInFlight = (async () => {
      // If source changed, treat all previous prepared urls as stale.
      if (offlineSource !== args.source) {
        preparedUrlByIndex.clear()
      }

      currentSampleRate = args.sampleRate > 0 ? args.sampleRate : 48000
      wasm.sampleRate.value = currentSampleRate
      wasm.nyquist.value = currentSampleRate * 0.5 - currentSampleRate * 0.1
      wasm.bpm.value = args.bpm > 0 ? args.bpm : 60
      wasm.globalSampleCount.value = 0

      // Seed the host sample pool so record callbacks that reference existing samples can read them.
      for (let i = 0; i < args.loadedSamples.length; i++) {
        const s = args.loadedSamples[i]
        if (!s?.ch0 || s.length <= 0) continue
        const idx = i | 0
        const prev = samples.get(idx)
        const ver = prev?.ver ?? 1
        samples.set(idx, { ver, sampleRate: s.sampleRate | 0, len: s.length | 0, ch0: s.ch0 })
      }

      await ensureOfflineProgram(args.source)
      if (!offlineProgram || !offlineDsp$ || !offlineDspView || !offlineLeft$ || !offlineRight$) return new Map()

      // Reset DSP state before preparing so record() starts from a clean slate.
      wasm.resetDsp?.(offlineDsp$)
      wasm.globalSampleCount.value = 0

      let stable = 0
      const maxBlocks = 4096
      for (let i = 0; i < maxBlocks; i++) {
        wasm.processAudio?.(offlineDsp$, offlineLeft$, offlineRight$, 0, CHUNK_SIZE)
        const active = (wasm.getProgramRecordActive?.(offlineProgram.program.ptr$) | 0) !== 0
        if (active) stable = 0
        else stable++

        // Freeze transport (matches worklet "preparing" semantics).
        wasm.globalSampleCount.value = 0

        if (stable >= 2) break
        if ((i & 63) === 63) {
          await new Promise<void>(r => setTimeout(r, 0))
        }
      }

      const out = new Map<number, PreparedRecordSample>()
      for (const def of recordDefs) {
        const s = samples.get(def.sampleIndex)
        if (!s || s.len <= 0) continue
        const ch0Buffer = s.ch0.slice().buffer
        out.set(def.sampleIndex, {
          sampleIndex: def.sampleIndex,
          url: def.url,
          ver: s.ver | 0,
          sampleRate: s.sampleRate | 0,
          length: s.len | 0,
          ch0Buffer,
        })
        preparedUrlByIndex.set(def.sampleIndex, def.url)
      }
      return out
    })()

    try {
      return await prepareInFlight
    }
    finally {
      prepareInFlight = null
    }
  }

  return {
    wasm,
    memory,
    generateMiniHistoryWindow,
    prepareRecordSamples,
  }
}
