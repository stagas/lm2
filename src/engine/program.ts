import { useEffect } from 'react'
import { toRing } from 'utils/ring'
import { rpc } from 'utils/rpc'
import {
  ARRAY_HEADER_SIZE,
  ARRAY_HISTORY_ENTRY_SIZE,
  ARRAY_HISTORY_SIZE,
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
  SAMPLE_NEEDLE_DATA_OFFSET,
  SAMPLE_NEEDLE_ENTRY_SIZE,
  SAMPLE_NEEDLE_HISTORY_SIZE,
} from '../../as/assembly/constants.ts'
import { acquireSpinLock } from '../lib/atomics.ts'
import { buildMiniSourceMap, type SourceLocation } from '../lib/mini-source-map.ts'
import { compileMiniNotation } from '../mini/compiler.ts'
import { compileTimelineNotation } from '../timeline/compiler.ts'
import { AnalyserOutsPoolStruct, ProgramDataStruct, ProgramStruct } from './assembly.ts'
import {
  type AnalyserRef,
  type ArrayLiteralRef,
  encodeLangToVmOps,
  type MiniSequenceRef,
  type NumberLiteralInfo,
  type NumberWithParamsInfo,
  type SampleDef,
  type TimelineLabel,
  type TimelineSequenceDef,
  type TimelineSequenceRef,
} from './bytecode/bytecode.ts'
import { useEngineStore } from './store.ts'
import type { DspProcessor } from './worklet.ts'

export type VmArray = {
  length: number
  raw: Float32Array
  data: Float32Array
}

export type VmHistory = {
  writePos: number
  raw: Float32Array
}

export type VmArrayAccessHistory = {
  writePos: number
  raw: Float32Array
}

export type VmSampleNeedleHistory = {
  writePos: number
  raw: Float32Array
}

export type Program = Awaited<ReturnType<typeof createProgram>>
export type ProgramDataView = ReturnType<typeof createProgramDataView>
export type ProgramInstance = Awaited<ReturnType<typeof createProgramInstance>>

function updateSequence(sequence: string, arrayIndex: number, data: ProgramDataView): Map<number, SourceLocation> {
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

  return buildMiniSourceMap(compiled.nodes, target.raw)
}

function updateTimelineSequence(
  sequence: string,
  arrayIndex: number,
  data: ProgramDataView,
): void {
  const compiled = compileTimelineNotation(sequence)
  const target = data.arrays[arrayIndex]

  const maxSize = Math.min(compiled.bytecode.length, ARRAY_SIZE)
  target.raw.set(compiled.bytecode.subarray(0, maxSize), ARRAY_HEADER_SIZE)
  target.length = maxSize

  const currentVersion = target.raw[3] || 0
  target.raw[3] = currentVersion + 1
}

function buildProgram(
  data: ProgramDataView,
  dspSource: string,
): {
  sequences: string[]
  timelineSequences: TimelineSequenceDef[]
  miniRefs: MiniSequenceRef[]
  timelineRefs: TimelineSequenceRef[]
  timelineLabels: TimelineLabel[]
  analyserRefs: AnalyserRef[]
  arrayLiterals: ArrayLiteralRef[]
  numberParams: NumberWithParamsInfo[]
  numberLiterals: NumberLiteralInfo[]
  sampleDefs: SampleDef[]
  bpm?: number
  bars?: number
} {
  const { errors, miniSequences, timelineSequences, miniRefs, timelineRefs, timelineLabels, analyserRefs, arrayLiterals,
    numberParams, numberLiterals, bpm, bars, sampleDefs } = encodeLangToVmOps(dspSource, {
      ops: data.ops,
      literals: data.literals,
    })
  if (errors.length) {
    console.error('VM compile errors:', errors)
    throw new Error(`VM compile errors: ${errors.map(e => e.message).join(', ')}`)
  }
  return {
    sequences: miniSequences ?? [],
    timelineSequences: timelineSequences ?? [],
    miniRefs: miniRefs ?? [],
    timelineRefs: timelineRefs ?? [],
    timelineLabels: timelineLabels ?? [],
    analyserRefs: analyserRefs ?? [],
    arrayLiterals: arrayLiterals ?? [],
    numberParams: numberParams ?? [],
    numberLiterals: numberLiterals ?? [],
    sampleDefs: sampleDefs ?? [],
    bpm,
    bars,
  }
}

type CompileOptions = {
  apply?: boolean
  setData?: boolean
  compareAgainst?: ProgramDataView
  copyVersionFrom?: ProgramDataView
}

export type ProgramBuildDiff = {
  significantChange: boolean
  opsChanged: boolean
  oldOpCount: number
  newOpCount: number
}

export type ProgramBuildResult = {
  sequences: string[]
  miniRefs: MiniSequenceRef[]
  timelineRefs: TimelineSequenceRef[]
  timelineLabels: TimelineLabel[]
  analyserRefs: AnalyserRef[]
  miniSourceMaps: Array<Map<number, SourceLocation> | undefined>
  timelineSequences: TimelineSequenceDef[]
  arrayLiterals: ArrayLiteralRef[]
  numberParams: NumberWithParamsInfo[]
  numberLiterals: NumberLiteralInfo[]
  sampleDefs: SampleDef[]
  bpm?: number
  bars?: number
  data: ProgramDataView
  diff: ProgramBuildDiff
  previousData?: ProgramDataView
}

type OpsSnapshot = {
  ops: Int32Array
  length: number
}

function captureOpsSnapshot(data?: ProgramDataView): OpsSnapshot | undefined {
  if (!data) return undefined
  const opsCopy = new Int32Array(data.ops)
  let length = opsCopy.length
  while (length > 0 && opsCopy[length - 1] === 0) {
    length--
  }
  return { ops: opsCopy, length }
}

function detectOpsChange(oldSnapshot: OpsSnapshot | undefined, newSnapshot: OpsSnapshot): boolean {
  if (!oldSnapshot) return false
  const maxLength = Math.max(oldSnapshot.length, newSnapshot.length)
  for (let i = 0; i < maxLength; i++) {
    const oldOp = i < oldSnapshot.length ? oldSnapshot.ops[i] : 0
    const newOp = i < newSnapshot.length ? newSnapshot.ops[i] : 0
    if (oldOp !== newOp) {
      return true
    }
  }
  return false
}

function computeProgramDiff(
  reference: ProgramDataView | undefined,
  target: ProgramDataView,
): ProgramBuildDiff {
  const isInitial = !reference
  const oldSnapshot = captureOpsSnapshot(reference)
  const newSnapshot = captureOpsSnapshot(target)!
  const opsChanged = detectOpsChange(oldSnapshot, newSnapshot)
  const significantChange = !!(reference && opsChanged)

  return {
    significantChange,
    opsChanged,
    oldOpCount: oldSnapshot?.length ?? 0,
    newOpCount: newSnapshot.length,
  }
}

function createProgramDataView(data$: number, arrays$: number[], wasmMemory: WebAssembly.Memory) {
  const programData = ProgramDataStruct(wasmMemory.buffer, data$)
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
    ops,
    arrays,
    literals,
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
  const histories = new Array<VmHistory>(HISTORIES_COUNT)
  for (let i = 0; i < HISTORIES_COUNT; i++) {
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

  const arrayAccessHistory$ = program.arrayAccessHistory
  const arrayAccessWritePos = new Float32Array(wasmMemory.buffer, arrayAccessHistory$, 1)
  const arrayAccessHistory: VmArrayAccessHistory = {
    get writePos() {
      return arrayAccessWritePos[0] || 0
    },
    raw: new Float32Array(wasmMemory.buffer, arrayAccessHistory$, 1 + ARRAY_HISTORY_SIZE * ARRAY_HISTORY_ENTRY_SIZE),
  }

  const sampleNeedleHistory$ = program.sampleNeedleHistory
  const sampleNeedleWritePos = new Float32Array(
    wasmMemory.buffer,
    sampleNeedleHistory$,
    SAMPLE_NEEDLE_DATA_OFFSET,
  )
  const sampleNeedleHistory: VmSampleNeedleHistory = {
    get writePos() {
      return sampleNeedleWritePos[0] || 0
    },
    raw: new Float32Array(
      wasmMemory.buffer,
      sampleNeedleHistory$,
      SAMPLE_NEEDLE_DATA_OFFSET + SAMPLE_NEEDLE_HISTORY_SIZE * SAMPLE_NEEDLE_ENTRY_SIZE,
    ),
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
    arrayAccessHistory,
    sampleNeedleHistory,
    get data() {
      return programData
    },
    async compileSource(source: string, options: CompileOptions = {}): Promise<ProgramBuildResult> {
      const { apply = true, setData = apply, compareAgainst, copyVersionFrom } = options
      const referenceData = compareAgainst ?? programData
      const versionSource = copyVersionFrom ?? referenceData
      const previousProgramDataIndex = programDataPoolIndex
      const newData = nextProgramData()

      try {
        const { sequences, timelineSequences, miniRefs, timelineRefs, timelineLabels, analyserRefs, arrayLiterals,
          numberParams, numberLiterals, sampleDefs, bpm, bars } = buildProgram(newData, source)
        const miniSourceMaps: Array<Map<number, SourceLocation> | undefined> = new Array(sequences.length)
        const totalSeqCount = sequences.length + timelineSequences.length
        if (totalSeqCount > HISTORIES_COUNT) {
          throw new Error(`Too many sequences for history pool: ${totalSeqCount} > ${HISTORIES_COUNT}`)
        }

        await this.acquireLock()
        try {
          for (let arrayIndex = 0; arrayIndex < sequences.length; arrayIndex++) {
            const sequence = sequences[arrayIndex]
            if (!sequence) continue

            const oldArray = versionSource?.arrays[arrayIndex]
            if (oldArray) {
              newData.arrays[arrayIndex].raw[3] = oldArray.raw[3]
            }

            miniSourceMaps[arrayIndex] = updateSequence(sequence, arrayIndex, newData)
          }

          for (let i = 0; i < timelineSequences.length; i++) {
            const s = timelineSequences[i]
            if (!s) continue
            const arrayIndex = sequences.length + i

            const oldArray = versionSource?.arrays[arrayIndex]
            if (oldArray) {
              newData.arrays[arrayIndex].raw[3] = oldArray.raw[3]
            }

            updateTimelineSequence(s.sequence, arrayIndex, newData)
          }

          if (setData) {
            this._setData(newData)
          }
        }
        finally {
          this.releaseLock()
        }

        const diff = computeProgramDiff(referenceData, newData)
        return {
          sequences,
          miniRefs,
          timelineRefs,
          timelineLabels,
          analyserRefs,
          miniSourceMaps,
          timelineSequences,
          arrayLiterals,
          numberParams,
          numberLiterals,
          sampleDefs,
          bpm,
          bars,
          data: newData,
          diff,
          previousData: referenceData,
        }
      }
      catch (error) {
        programDataPoolIndex = previousProgramDataIndex
        throw error
      }
    },
    async buildFromSource(source: string): Promise<string[]> {
      const result = await this.compileSource(source)
      return result.sequences
    },
    async applyPreparedData(value: ProgramDataView) {
      await this.withLock(() => {
        this._setData(value)
      })
    },
    async acquireLock() {
      const ok = await acquireSpinLock(this.lock, 2000)
      if (!ok) {
        // Break-glass: if we can't acquire within a bounded time, fail fast so
        // the DSP update queue can recover instead of hanging indefinitely.
        throw new Error('Timed out acquiring program lock')
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
    async writeLiteral(index: number, value: number) {
      await this.withLock(() => {
        if (programData) programData.literals[index] = value
      })
    },
  }

  return out
}

export async function createProgramInstance(
  worklet: ReturnType<typeof rpc<DspProcessor>>,
  wasmMemory: WebAssembly.Memory,
  control: Uint32Array,
) {
  const program = await createProgram(worklet, wasmMemory, control)

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
