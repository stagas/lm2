import {
  ARRAY_HEADER_SIZE,
  ARRAY_SIZE,
  ARRAYS_COUNT,
  CALLBACK_SCOPE_MAX_BINDINGS,
  CALLBACK_SCOPE_MAX_DEPTH,
  CHUNK_SIZE,
  HISTORIES_COUNT,
  HISTORY_SIZE,
  LITERALS_COUNT,
  MINI_HEADER_SIZE,
  OPS_COUNT,
  RING_BUFFER_SIZE,
  SEQ_VOICES,
} from './constants'
import { Ad } from './gen/ad'
import { Adsr } from './gen/adsr'
import { Analyser } from './gen/analyser'
import { Gen } from './gen/gen'
import { Mini } from './gen/mini'
import { Sin } from './gen/sin'
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
  private sins: GenPool<Sin> = new GenPool<Sin>(() => new Sin())
  private ads: GenPool<Ad> = new GenPool<Ad>(() => new Ad())
  private adsrs: GenPool<Adsr> = new GenPool<Adsr>(() => new Adsr())
  private minis: GenPool<Mini> = new GenPool<Mini>(() => new Mini())
  private analysers: GenPool<Analyser> = new GenPool<Analyser>(() => new Analyser())
  resetIndices(): void {
    this.sins.resetIndex()
    this.ads.resetIndex()
    this.adsrs.resetIndex()
    this.minis.resetIndex()
    this.analysers.resetIndex()
  }
  resetAllSeqs(): void {
    for (let i = 0; i < this.minis.gens.length; i++) {
      this.minis.gens[i].reset()
    }
  }
  get(op: Op): Gen {
    switch (op) {
      case Op.Sin:
        return this.sins.get()
      case Op.Ad:
        return this.ads.get()
      case Op.Adsr:
        return this.adsrs.get()
      case Op.Mini:
        return this.minis.get()
      case Op.Analyser:
        return this.analysers.get()
    }
    throw new Error(`Invalid gen op: ${op}`)
  }

  copyFrom(source: GensPool): void {
    this.sins.copyFrom(source.sins)
    this.ads.copyFrom(source.ads)
    this.adsrs.copyFrom(source.adsrs)
    this.minis.copyFrom(source.minis)
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
  lock: i32 = 0

  ops: StaticArray<i32> = new StaticArray<i32>(OPS_COUNT)
  arrays: StaticArray<usize> = new StaticArray<usize>(ARRAYS_COUNT)
  literals: StaticArray<f32> = new StaticArray<f32>(LITERALS_COUNT)

  private acquireLock(): void {
    const lockPtr = changetype<usize>(this) + offsetof<ProgramData>('lock')
    let lock = atomic.load<i32>(lockPtr)
    while (lock !== 0) {
      atomic.wait<i32>(lockPtr, 1, -1)
      lock = atomic.load<i32>(lockPtr)
    }
    atomic.store<i32>(lockPtr, 1)
  }

  private releaseLock(): void {
    const lockPtr = changetype<usize>(this) + offsetof<ProgramData>('lock')
    atomic.store<i32>(lockPtr, 0)
    atomic.notify(lockPtr, 1)
  }

  readLiteral(index: i32): f32 {
    this.acquireLock()
    const literal = this.literals[index]
    this.releaseLock()
    return literal
  }

  copyFrom(source: ProgramData): void {
    this.lock = source.lock

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

  gensPool: GensPool = new GensPool()
  literalsSmoothed: StaticArray<Smoothed> = new StaticArray<Smoothed>(LITERALS_COUNT)
  outsPool: OutsPool = new OutsPool()

  // Callback scope stack for remapped buffers and bound inputs
  private callbackDepth: i32 = 0
  private callbackBodyBase: StaticArray<i32> = new StaticArray<i32>(CALLBACK_SCOPE_MAX_DEPTH)
  private callbackRemapBase: StaticArray<i32> = new StaticArray<i32>(CALLBACK_SCOPE_MAX_DEPTH)
  private callbackBindingCount: StaticArray<i32> = new StaticArray<i32>(CALLBACK_SCOPE_MAX_DEPTH)
  private callbackBindingIndices: StaticArray<i32> = new StaticArray<i32>(
    CALLBACK_SCOPE_MAX_DEPTH * CALLBACK_SCOPE_MAX_BINDINGS,
  )
  private callbackBindingOuts: StaticArray<usize> = new StaticArray<usize>(
    CALLBACK_SCOPE_MAX_DEPTH * CALLBACK_SCOPE_MAX_BINDINGS,
  )

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
    const depth = this.callbackDepth
    this.callbackBodyBase[depth] = bodyBufferBase
    this.callbackRemapBase[depth] = remapBase
    this.callbackBindingCount[depth] = 0
    this.callbackDepth = depth + 1
  }

  bindScope(index: i32, out$: usize): void {
    const depth = this.callbackDepth - 1
    const bindingIndex = depth * CALLBACK_SCOPE_MAX_BINDINGS
    const count = this.callbackBindingCount[depth]
    this.callbackBindingIndices[bindingIndex + count] = index
    this.callbackBindingOuts[bindingIndex + count] = out$
    this.callbackBindingCount[depth] = count + 1
  }

  popCallbackScope(): void {
    if (this.callbackDepth <= 0) return
    this.callbackDepth--
  }

  // Get buffer with remapping applied when inside a callback scope
  getOutBuffer(index: i32): usize {
    for (let depth = this.callbackDepth - 1; depth >= 0; depth--) {
      const base = this.callbackBodyBase[depth]

      // Bound inputs for this scope (e.g., trig/velocity/value)
      const bindingCount = this.callbackBindingCount[depth]
      const bindingOffset = depth * CALLBACK_SCOPE_MAX_BINDINGS
      for (let i = 0; i < bindingCount; i++) {
        const bindingIndex = this.callbackBindingIndices[bindingOffset + i]
        if (bindingIndex === index) {
          return this.callbackBindingOuts[bindingOffset + i]
        }
      }

      // Scratch/remapped outputs for this scope
      if (index >= base) {
        const offset = index - base
        const remapped = this.callbackRemapBase[depth] + offset
        return this.outsPool.get(remapped)
      }
    }
    return this.outsPool.get(index)
  }

  prepare(): void {
    // The new VM calls `mini` at runtime, so sequence history generation happens there.
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
      changetype<usize>(this.callbackBindingOuts),
      changetype<usize>(source.callbackBindingOuts),
      CALLBACK_SCOPE_MAX_DEPTH * CALLBACK_SCOPE_MAX_BINDINGS * sizeof<usize>(),
    )

    for (let i = 0; i < this.literalsSmoothed.length; i++) {
      this.literalsSmoothed[i].copyFrom(source.literalsSmoothed[i])
    }

    this.gensPool.copyFrom(source.gensPool)
  }
}
