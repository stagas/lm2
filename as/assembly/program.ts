import {
  ARRAY_HEADER_SIZE,
  ARRAY_HISTORY_ENTRY_SIZE,
  ARRAY_HISTORY_SIZE,
  ARRAY_SIZE,
  ARRAYS_COUNT,
  CALLBACK_SCOPE_MAX_BINDINGS,
  CALLBACK_SCOPE_MAX_DEPTH,
  CHUNK_SIZE,
  HISTORIES_COUNT,
  HISTORY_ENTRY_SIZE,
  HISTORY_HEADER_SIZE,
  HISTORY_SIZE,
  LITERALS_COUNT,
  MINI_HEADER_SIZE,
  OP_CYCLE_END,
  OPS_COUNT,
  RING_BUFFER_SIZE,
  SEQ_VOICES,
  TIMELINE_MAGIC,
} from './constants'
import { Ad } from './gen/ad'
import { Adsr } from './gen/adsr'
import { Analyser } from './gen/analyser'
import { Gen } from './gen/gen'
import { Mini } from './gen/mini'
import { Sine } from './gen/sine'
import { Timeline } from './gen/timeline'
import { Smoothed } from './lib/smoothed'
import { Op } from './shared'

export class GenPool<T extends Gen> {
  private index: i32 = 0
  gens: T[] = []
  constructor(private ctor: () => T) {}
  resetIndex(): void {
    this.index = 0
  }
  get(): T {
    if (this.index >= this.gens.length) {
      const gen = this.ctor()
      this.gens.push(gen)
    }
    const gen = this.gens[this.index++]
    return gen
  }

  copyFrom(source: GenPool<T>): void {
    this.index = source.index
    const needed = source.gens.length
    while (this.gens.length < needed) {
      this.gens.push(this.ctor())
    }
    for (let i = 0; i < needed; i++) {
      this.gens[i].copyFrom(source.gens[i])
    }
  }
}

class GensPool {
  private sines: GenPool<Sine> = new GenPool<Sine>(() => new Sine())
  private ads: GenPool<Ad> = new GenPool<Ad>(() => new Ad())
  private adsrs: GenPool<Adsr> = new GenPool<Adsr>(() => new Adsr())
  private minis: GenPool<Mini> = new GenPool<Mini>(() => new Mini())
  private timelines: GenPool<Timeline> = new GenPool<Timeline>(() => new Timeline())
  private analysers: GenPool<Analyser> = new GenPool<Analyser>(() => new Analyser())
  resetIndices(): void {
    this.sines.resetIndex()
    this.ads.resetIndex()
    this.adsrs.resetIndex()
    this.minis.resetIndex()
    this.timelines.resetIndex()
    this.analysers.resetIndex()
  }
  resetAllSeqs(voices: boolean): void {
    for (let i = 0; i < this.minis.gens.length; i++) {
      this.minis.gens[i].reset(voices)
    }
  }
  get(op: Op): Gen {
    switch (op) {
      case Op.Sine:
        return this.sines.get()
      case Op.Ad:
        return this.ads.get()
      case Op.Adsr:
        return this.adsrs.get()
      case Op.Mini:
        return this.minis.get()
      case Op.Timeline:
        return this.timelines.get()
      case Op.Analyser:
        return this.analysers.get()
    }
    throw new Error(`Invalid gen op: ${op}`)
  }

  copyFrom(source: GensPool): void {
    this.sines.copyFrom(source.sines)
    this.ads.copyFrom(source.ads)
    this.adsrs.copyFrom(source.adsrs)
    this.minis.copyFrom(source.minis)
    this.timelines.copyFrom(source.timelines)
    this.analysers.copyFrom(source.analysers)
  }
}

class OutsPool {
  outs: StaticArray<StaticArray<f32>> = new StaticArray<StaticArray<f32>>(1024)
  constructor() {
    for (let i = 0; i < this.outs.length; i++) {
      this.outs[i] = new StaticArray<f32>(CHUNK_SIZE)
    }
  }
  get(index: i32): usize {
    return changetype<usize>(this.outs[index])
  }
}

class AnalyserOutsPool {
  outs: StaticArray<StaticArray<f32>> = new StaticArray<StaticArray<f32>>(64)
  constructor() {
    for (let i = 0; i < this.outs.length; i++) {
      this.outs[i] = new StaticArray<f32>(RING_BUFFER_SIZE)
    }
  }
  get(index: i32): usize {
    return changetype<usize>(this.outs[index])
  }
}

export class ProgramData {
  ops: StaticArray<i32> = new StaticArray<i32>(OPS_COUNT)
  arrays: StaticArray<usize> = new StaticArray<usize>(ARRAYS_COUNT)
  literals: StaticArray<f32> = new StaticArray<f32>(LITERALS_COUNT)

  copyFrom(source: ProgramData): void {
    memory.copy(
      changetype<usize>(this.ops),
      changetype<usize>(source.ops),
      OPS_COUNT << 2,
    )

    memory.copy(
      changetype<usize>(this.literals),
      changetype<usize>(source.literals),
      LITERALS_COUNT << 2,
    )

    memory.copy(
      changetype<usize>(this.arrays),
      changetype<usize>(source.arrays),
      ARRAYS_COUNT * sizeof<usize>(),
    )

    const arrayBytes = (ARRAY_SIZE + ARRAY_HEADER_SIZE) << 2
    for (let i = 0; i < ARRAYS_COUNT; i++) {
      const src$ = source.arrays[i]
      const dst$ = this.arrays[i]
      if (src$ === 0 || dst$ === 0) continue
      memory.copy(dst$, src$, arrayBytes)
    }
  }
}

export class Program {
  lock: i32 = 0
  data: ProgramData = new ProgramData()
  histories: StaticArray<usize> = new StaticArray<usize>(HISTORIES_COUNT)
  analyserOutsPool: AnalyserOutsPool = new AnalyserOutsPool()
  arrayAccessHistory: StaticArray<f32> = new StaticArray<f32>(1 + ARRAY_HISTORY_SIZE * ARRAY_HISTORY_ENTRY_SIZE)

  gensPool: GensPool = new GensPool()
  literalsSmoothed: StaticArray<Smoothed> = new StaticArray<Smoothed>(LITERALS_COUNT)
  outsPool: OutsPool = new OutsPool()
  miniScratch: Mini = new Mini()
  timelineScratch: Timeline = new Timeline()

  // Callback scope stack for remapped buffers and bound inputs
  private callbackDepth: i32 = 0
  private callbackBodyBase: StaticArray<i32> = new StaticArray<i32>(CALLBACK_SCOPE_MAX_DEPTH)
  private callbackRemapBase: StaticArray<i32> = new StaticArray<i32>(CALLBACK_SCOPE_MAX_DEPTH)
  private callbackBindingCount: StaticArray<i32> = new StaticArray<i32>(CALLBACK_SCOPE_MAX_DEPTH)
  private callbackBindingIndices: StaticArray<i32> = new StaticArray<i32>(
    CALLBACK_SCOPE_MAX_DEPTH * CALLBACK_SCOPE_MAX_BINDINGS,
  )
  private callbackBindingPrevHas: StaticArray<i32> = new StaticArray<i32>(
    CALLBACK_SCOPE_MAX_DEPTH * CALLBACK_SCOPE_MAX_BINDINGS,
  )
  private callbackBindingPrevOuts: StaticArray<usize> = new StaticArray<usize>(
    CALLBACK_SCOPE_MAX_DEPTH * CALLBACK_SCOPE_MAX_BINDINGS,
  )

  // Fast binding lookup table (current effective bindings across all active scopes)
  // Uses the out-buffer index directly; size must match `OutsPool.outs.length`.
  private callbackBoundHas: StaticArray<i32> = new StaticArray<i32>(1024)
  private callbackBoundOuts: StaticArray<usize> = new StaticArray<usize>(1024)

  constructor() {
    for (let i = 0; i < this.literalsSmoothed.length; i++) {
      this.literalsSmoothed[i] = new Smoothed()
    }
  }

  waitProgramUnlock(): void {
    const lockPtr = changetype<usize>(this) + offsetof<Program>('lock')
    let lock = atomic.load<i32>(lockPtr)
    while (lock !== 0) {
      atomic.wait<i32>(lockPtr, lock, -1)
      lock = atomic.load<i32>(lockPtr)
    }
  }

  pushCallbackScope(bodyBufferBase: i32, remapBase: i32): void {
    const depth: i32 = this.callbackDepth
    this.callbackBodyBase[depth] = bodyBufferBase
    this.callbackRemapBase[depth] = remapBase
    this.callbackBindingCount[depth] = 0
    this.callbackDepth = depth + 1
  }

  @inline
  bindScope(index: i32, out$: usize): void {
    const depth: i32 = this.callbackDepth - 1
    const bindingOffset: i32 = depth * CALLBACK_SCOPE_MAX_BINDINGS
    const count: i32 = this.callbackBindingCount[depth]
    const bindingIndex: i32 = bindingOffset + count

    this.callbackBindingIndices[bindingIndex] = index

    const prevHas: i32 = this.callbackBoundHas[index]
    this.callbackBindingPrevHas[bindingIndex] = prevHas
    this.callbackBindingPrevOuts[bindingIndex] = this.callbackBoundOuts[index]

    this.callbackBoundHas[index] = 1
    this.callbackBoundOuts[index] = out$

    this.callbackBindingCount[depth] = count + 1
  }

  popCallbackScope(): void {
    const depth: i32 = this.callbackDepth - 1
    if (depth < 0) return

    const count: i32 = this.callbackBindingCount[depth]
    const bindingOffset: i32 = depth * CALLBACK_SCOPE_MAX_BINDINGS

    for (let i: i32 = count - 1; i >= 0; i--) {
      const bindingIndex: i32 = bindingOffset + i
      const index: i32 = this.callbackBindingIndices[bindingIndex]
      const prevHas: i32 = this.callbackBindingPrevHas[bindingIndex]
      this.callbackBoundHas[index] = prevHas
      if (prevHas !== 0) {
        this.callbackBoundOuts[index] = this.callbackBindingPrevOuts[bindingIndex]
      }
    }

    this.callbackDepth = depth
  }

  // Get buffer with remapping applied when inside a callback scope
  @inline
  getOutBuffer(index: i32): usize {
    const depth: i32 = this.callbackDepth
    if (depth === 0) return this.outsPool.get(index)

    // Bindings take precedence over remapping
    if (this.callbackBoundHas[index] !== 0) return this.callbackBoundOuts[index]

    // Then apply remapping for scratch buffers
    const bodyBase: StaticArray<i32> = this.callbackBodyBase
    const remapBase: StaticArray<i32> = this.callbackRemapBase
    const outsPool: OutsPool = this.outsPool

    for (let d: i32 = depth - 1; d >= 0; d--) {
      const base: i32 = bodyBase[d]
      if (index >= base) {
        const offset: i32 = index - base
        const remapped: i32 = remapBase[d] + offset
        return outsPool.get(remapped)
      }
    }

    return outsPool.get(index)
  }

  prepare(): void {
    this.arrayAccessHistory[0] = 0.0

    // Populate sequence histories for any bytecode arrays (mini + timeline).
    // Use scratch instances so we don't mutate the runtime gensPool or other state.
    const miniScratch: Mini = this.miniScratch
    const timelineScratch: Timeline = this.timelineScratch

    // Ensure gens pool indices are reset for deterministic behavior elsewhere
    this.gensPool.resetIndices()

    // Iterate over arrays and generate history for those that look like sequence bytecode
    for (let i = 0; i < this.data.arrays.length; i++) {
      const arr$ = this.data.arrays[i]
      if (arr$ === 0) continue

      const arr = changetype<StaticArray<f32>>(arr$)
      const opLength = i32(arr[ARRAY_HEADER_SIZE])
      if (opLength <= 0) continue

      const first: i32 = i32(arr[ARRAY_HEADER_SIZE + MINI_HEADER_SIZE])
      const isMini: bool = first >= 0 && first <= OP_CYCLE_END
      const isTimeline: bool = first === TIMELINE_MAGIC
      if (!isMini && !isTimeline) continue

      // Ensure a history buffer exists for this array
      let hist$ = this.histories[i]
      if (hist$ === 0) {
        const newHist = new StaticArray<f32>(HISTORY_HEADER_SIZE + HISTORY_SIZE * HISTORY_ENTRY_SIZE)
        hist$ = changetype<usize>(newHist)
        this.histories[i] = hist$
      }

      if (isMini) {
        miniScratch.reset(true)
        miniScratch.bytecode$ = arr$
        miniScratch.history$ = hist$
        miniScratch.generateHistory()
      }
      else if (isTimeline) {
        timelineScratch.reset()
        timelineScratch.bytecode$ = arr$
        timelineScratch.history$ = hist$
        // Prefer stored beatDiv for prepare-time history.
        timelineScratch.beatDiv = 0.0
        timelineScratch.generateHistory()
      }
    }
  }

  copyFrom(source: Program): void {
    this.lock = source.lock
    // this.data.copyFrom(source.data)

    const outBytes = CHUNK_SIZE << 2
    for (let i = 0; i < this.outsPool.outs.length; i++) {
      const src$ = changetype<usize>(source.outsPool.outs[i])
      const dst$ = changetype<usize>(this.outsPool.outs[i])
      memory.copy(dst$, src$, outBytes)
    }

    const analyserBytes = RING_BUFFER_SIZE << 2
    for (let i = 0; i < this.analyserOutsPool.outs.length; i++) {
      const src$ = changetype<usize>(source.analyserOutsPool.outs[i])
      const dst$ = changetype<usize>(this.analyserOutsPool.outs[i])
      memory.copy(dst$, src$, analyserBytes)
    }

    this.callbackDepth = source.callbackDepth
    memory.copy(
      changetype<usize>(this.callbackBodyBase),
      changetype<usize>(source.callbackBodyBase),
      CALLBACK_SCOPE_MAX_DEPTH << 2,
    )
    memory.copy(
      changetype<usize>(this.callbackRemapBase),
      changetype<usize>(source.callbackRemapBase),
      CALLBACK_SCOPE_MAX_DEPTH << 2,
    )
    memory.copy(
      changetype<usize>(this.callbackBindingCount),
      changetype<usize>(source.callbackBindingCount),
      CALLBACK_SCOPE_MAX_DEPTH << 2,
    )
    memory.copy(
      changetype<usize>(this.callbackBindingIndices),
      changetype<usize>(source.callbackBindingIndices),
      CALLBACK_SCOPE_MAX_DEPTH * CALLBACK_SCOPE_MAX_BINDINGS << 2,
    )
    memory.copy(
      changetype<usize>(this.callbackBindingPrevHas),
      changetype<usize>(source.callbackBindingPrevHas),
      CALLBACK_SCOPE_MAX_DEPTH * CALLBACK_SCOPE_MAX_BINDINGS << 2,
    )
    memory.copy(
      changetype<usize>(this.callbackBindingPrevOuts),
      changetype<usize>(source.callbackBindingPrevOuts),
      CALLBACK_SCOPE_MAX_DEPTH * CALLBACK_SCOPE_MAX_BINDINGS * sizeof<usize>(),
    )

    memory.copy(
      changetype<usize>(this.callbackBoundHas),
      changetype<usize>(source.callbackBoundHas),
      1024 << 2,
    )
    memory.copy(
      changetype<usize>(this.callbackBoundOuts),
      changetype<usize>(source.callbackBoundOuts),
      1024 * sizeof<usize>(),
    )

    for (let i = 0; i < this.literalsSmoothed.length; i++) {
      this.literalsSmoothed[i].copyFrom(source.literalsSmoothed[i])
    }

    this.gensPool.copyFrom(source.gensPool)
  }
}
