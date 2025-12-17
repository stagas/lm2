import { useEffect } from 'react'
import { toRing } from 'utils/ring'
import { rpc } from 'utils/rpc'
import {
  ARRAY_HEADER_SIZE,
  ARRAY_SIZE,
  ARRAYS_COUNT,
  CHUNK_SIZE,
  HISTORIES_COUNT,
  HISTORY_ENTRY_SIZE,
  HISTORY_HEADER_SIZE,
  HISTORY_SIZE,
  HISTORY_WRITE_POS_OFFSET,
  LITERALS_COUNT,
  OPS_COUNT,
  RING_BUFFER_SIZE,
} from '../../as/assembly/constants.ts'
import { AnalyserOutsPoolStruct, ProgramDataStruct, ProgramStruct } from '../assembly.ts'
import { encodeLangToVmOps } from '../bytecode.ts'
import { buildMiniSourceMap } from '../lib/mini-source-map.ts'
import { compileMiniNotation } from '../mini/compiler.ts'
import { ControlOp } from '../worklet-shared.ts'
import type { DspProcessor } from '../worklet.ts'
import { useEngineStore } from './store.ts'

export type VmArray = {
  length: number
  raw: Float32Array
  data: Float32Array
}

export type VmHistory = {
  writePos: number
  raw: Float32Array
}

export type Program = Awaited<ReturnType<typeof createProgram>>
export type ProgramDataView = ReturnType<typeof createProgramDataView>

async function updateSequence(sequence: string, arrayIndex: number, data: ProgramDataView) {
  const compiled = compileMiniNotation(sequence)
  const target = data.arrays[arrayIndex]

  // Write new bytecode without clearing first to avoid race condition
  // Only clear the tail if new bytecode is shorter
  const maxSize = Math.min(compiled.bytecode.length, ARRAY_SIZE)

  // Write new bytecode
  target.raw.set(compiled.bytecode.subarray(0, maxSize), ARRAY_HEADER_SIZE)
  target.length = maxSize

  // Increment version to signal bytecode change
  const currentVersion = target.raw[3] || 0
  target.raw[3] = currentVersion + 1

  const sourceMap = buildMiniSourceMap(compiled.nodes, target.raw)
}

function buildProgram(data: ProgramDataView, dspSource: string): string[] {
  const { errors, miniSequences } = encodeLangToVmOps(dspSource, { ops: data.ops, literals: data.literals })
  if (errors.length) {
    console.error('VM compile errors:', errors)
    throw new Error(`VM compile errors: ${errors.map(e => e.message).join(', ')}`)
  }
  return miniSequences ?? []
}

function createProgramDataView(data$: number, arrays$: number[], wasmMemory: WebAssembly.Memory) {
  const programData = ProgramDataStruct(wasmMemory.buffer, data$)
  const lock = new Int32Array(wasmMemory.buffer, programData.lock, 1)
  const ops$ = programData.ops
  const ops = new Int32Array(wasmMemory.buffer, ops$, OPS_COUNT)

  const arrayBuffers = new Uint32Array(wasmMemory.buffer, programData.arrays, ARRAYS_COUNT)
  const arrays = new Array<VmArray>(ARRAYS_COUNT)
  for (let i = 0; i < ARRAYS_COUNT; i++) {
    const byteOffset = arrayBuffers[i] = arrays$[i]
    const length = new Float32Array(wasmMemory.buffer, byteOffset, 1)
    arrays[i] = {
      get length() {
        return length[0]
      },
      set length(value: number) {
        length[0] = value
      },
      raw: new Float32Array(wasmMemory.buffer, byteOffset, ARRAY_SIZE + ARRAY_HEADER_SIZE),
      data: new Float32Array(
        wasmMemory.buffer,
        byteOffset + ARRAY_HEADER_SIZE * Float32Array.BYTES_PER_ELEMENT,
        ARRAY_SIZE,
      ),
    }
  }

  const literals = new Float32Array(wasmMemory.buffer, programData.literals, LITERALS_COUNT)

  return {
    ptr$: data$,
    lock,
    ops,
    arrays,
    literals,
    async acquireLock() {
      while (true) {
        const prev = Atomics.compareExchange(this.lock, 0, 0, 1)
        if (prev === 0) return
        await Atomics.waitAsync(this.lock, 0, prev).value
      }
    },
    releaseLock() {
      Atomics.store(this.lock, 0, 0)
      Atomics.notify(this.lock, 0)
    },
    async withLock(fn: () => void) {
      await this.acquireLock()
      fn()
      this.releaseLock()
    },
    writeLiteral(index: number, value: number) {
      this.withLock(() => {
        literals[index] = value
      })
    },
  }
}

async function createProgramData(worklet: ReturnType<typeof rpc<DspProcessor>>, wasmMemory: WebAssembly.Memory) {
  const data$ = await worklet.createProgramData()
  const arrays$ = await worklet.createArrays()
  const data = createProgramDataView(data$, arrays$, wasmMemory)
  return data
}

async function createProgram(
  worklet: ReturnType<typeof rpc<DspProcessor>>,
  wasmMemory: WebAssembly.Memory,
  wasmDspPtr: number,
  prepareDsp: Uint32Array,
  control: Uint32Array,
) {
  const program$ = await worklet.createProgram()
  const program = ProgramStruct(wasmMemory.buffer, program$)
  const lock = new Int32Array(wasmMemory.buffer, program.lock, 1)

  let programDataPoolIndex = 0
  const programDataPool: ProgramDataView[] = [
    await createProgramData(worklet, wasmMemory),
    await createProgramData(worklet, wasmMemory),
  ]

  const histories$ = await worklet.createHistories()
  const historyBuffers = new Uint32Array(wasmMemory.buffer, program.histories, HISTORIES_COUNT)
  const histories = new Array<VmHistory>(ARRAYS_COUNT)
  for (let i = 0; i < ARRAYS_COUNT; i++) {
    const byteOffset = historyBuffers[i] = histories$[i]
    const writePos = new Float32Array(wasmMemory.buffer,
      byteOffset + HISTORY_WRITE_POS_OFFSET * Float32Array.BYTES_PER_ELEMENT, 1)
    histories[i] = {
      get writePos() {
        return writePos[0] || 0
      },
      raw: new Float32Array(wasmMemory.buffer, byteOffset, HISTORY_HEADER_SIZE + HISTORY_SIZE * HISTORY_ENTRY_SIZE),
    }
  }

  function nextProgramData() {
    const data = programDataPool[programDataPoolIndex]
    programDataPoolIndex = (programDataPoolIndex + 1) % programDataPool.length
    return data
  }

  const analyserOutsPool = AnalyserOutsPoolStruct(wasmMemory.buffer, program.analyserOutsPool)
  const analyserOuts$ = new Uint32Array(wasmMemory.buffer, analyserOutsPool.outs, 64)
  const analyserOuts = [...analyserOuts$].map(out$ =>
    toRing(new Float32Array(wasmMemory!.buffer, out$, RING_BUFFER_SIZE), CHUNK_SIZE)
  )

  let programData: ProgramDataView | undefined
  const out = {
    ptr$: program$,
    lock,
    analyserOuts,
    histories,
    get data() {
      return programData
    },
    async buildFromSource(source: string): Promise<string[]> {
      const newData = nextProgramData()
      const sequences = buildProgram(newData, source)

      await this.acquireLock()

      for (let arrayIndex = 0; arrayIndex < sequences.length; arrayIndex++) {
        const sequence = sequences[arrayIndex]
        if (!sequence) continue

        const oldArray = programData?.arrays[arrayIndex]
        if (oldArray) {
          const newArray = newData.arrays[arrayIndex]
          newArray.raw[3] = oldArray.raw[3]
        }

        updateSequence(sequence, arrayIndex, newData)
      }

      this._setData(newData)

      Atomics.store(prepareDsp, 0, wasmDspPtr)
      Atomics.store(control, 0, ControlOp.Prepare)

      this.releaseLock()

      return sequences
    },
    async acquireLock() {
      while (true) {
        const prev = Atomics.compareExchange(this.lock, 0, 0, 1)
        if (prev === 0) break
        await Atomics.waitAsync(this.lock, 0, prev).value
      }
    },
    releaseLock() {
      Atomics.store(this.lock, 0, 0)
      Atomics.notify(this.lock, 0)
    },
    async withLock(fn: () => void) {
      await this.acquireLock()
      fn()
      this.releaseLock()
    },
    _setData(value: ProgramDataView) {
      programData = value
      program.data = programData.ptr$
    },
    async setData(value: ProgramDataView) {
      await this.withLock(() => {
        this._setData(value)
      })
    },
  }

  return out
}

export async function createProgramInstance(
  worklet: ReturnType<typeof rpc<DspProcessor>>,
  wasmMemory: WebAssembly.Memory,
  wasmDspPtr: number,
  prepareDsp: Uint32Array,
  control: Uint32Array,
) {
  const program = await createProgram(worklet, wasmMemory, wasmDspPtr, prepareDsp, control)

  function cleanup() {
    // Cleanup logic if needed
  }

  return { program, cleanup }
}

export function useEngine() {
  const store = useEngineStore()

  useEffect(() => {
    store.initialize()
    return () => store.dispose()
  }, [])

  return store
}
