import {
  ARRAY_HEADER_SIZE,
  ARRAY_SIZE,
  HISTORY_ENTRY_SIZE,
  HISTORY_HEADER_SIZE,
  HISTORY_SIZE,
} from '../../as/assembly/constants.ts'
import config from '../../asconfig.json'
import { wasmSetup } from '../lib/wasm-setup.ts'
import { compileMiniNotation } from '../mini/compiler.ts'

export type VisualWasm = Awaited<ReturnType<typeof createVisualWasm>>

type SeqBuffers = {
  array$: number
  array: Float32Array
  history$: number
  history: Float32Array
  seq: string
  version: number
}

export async function createVisualWasm(binary: ArrayBuffer, sourcemapUrl: string) {
  const core = await wasmSetup<any>({
    binary,
    sourcemapUrl,
    config,
  })

  const wasm = core.wasm as any
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
    }
    seqs.set(seqIndex, st)
    return st
  }

  const setMiniSequence = (seqIndex: number, seq: string): SeqBuffers => {
    const st = ensureSeqBuffers(seqIndex)
    if (st.seq === seq) return st

    const compiled = compileMiniNotation(seq)
    const bytecode = compiled.bytecode

    const maxSize = Math.min(bytecode.length, ARRAY_SIZE)
    st.array.set(bytecode.subarray(0, maxSize), ARRAY_HEADER_SIZE)
    st.array[0] = maxSize
    st.version += 1
    st.array[3] = st.version

    st.seq = seq
    return st
  }

  const generateMiniHistoryWindow = (args: {
    seqIndex: number
    seq: string
    windowStartSample: number
    windowEndSample: number
    bpm: number
    sampleRate: number
  }): Float32Array => {
    const { seqIndex, seq, windowStartSample, windowEndSample, bpm, sampleRate } = args
    const st = setMiniSequence(seqIndex, seq)
    ;(wasm.generateMiniHistoryWindow as any)(
      st.array$,
      st.history$,
      Math.floor(windowStartSample),
      Math.floor(windowEndSample),
      bpm,
      sampleRate,
    )

    return st.history
  }

  return {
    wasm,
    memory,
    generateMiniHistoryWindow,
  }
}
