import { ARRAYS_COUNT, LITERALS_COUNT, OPS_COUNT, RING_BUFFER_SIZE, SEQ_VOICES } from './constants'
import { Ad } from './gen/ad'
import { Adsr } from './gen/adsr'
import { Gen } from './gen/gen'
import { Seq } from './gen/seq'
import { SeqMap } from './gen/seqmap'
import { Sin } from './gen/sin'
import { Smoothed } from './lib/smoothed'
import { Op } from './shared'

export class GenPool<T> {
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
}

class GensPool {
  private sins: GenPool<Sin> = new GenPool<Sin>(() => new Sin())
  private ads: GenPool<Ad> = new GenPool<Ad>(() => new Ad())
  private adsrs: GenPool<Adsr> = new GenPool<Adsr>(() => new Adsr())
  private seqs: GenPool<Seq> = new GenPool<Seq>(() => new Seq())
  private seqmaps: GenPool<SeqMap> = new GenPool<SeqMap>(() => new SeqMap())
  resetIndices(): void {
    this.sins.resetIndex()
    this.ads.resetIndex()
    this.adsrs.resetIndex()
    this.seqs.resetIndex()
    this.seqmaps.resetIndex()
  }
  resetAllSeqs(): void {
    for (let i = 0; i < this.seqs.gens.length; i++) {
      this.seqs.gens[i].reset()
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
      case Op.Seq:
        return this.seqs.get()
      case Op.SeqMap:
        return this.seqmaps.get()
    }
    throw new Error(`Invalid gen op: ${op}`)
  }
}

class OutsPool {
  outs: StaticArray<StaticArray<f32>> = new StaticArray<StaticArray<f32>>(1024)
  constructor() {
    for (let i = 0; i < this.outs.length; i++) {
      this.outs[i] = new StaticArray<f32>(RING_BUFFER_SIZE)
    }
  }
  get(index: i32): usize {
    return changetype<usize>(this.outs[index])
  }
}

class ProgramData {
  lock: i32 = 0

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
}

// Buffers per voice for SeqForEach remapping (enough for complex synth voices)
const BUFS_PER_VOICE: i32 = 32

export class Program {
  data: ProgramData = new ProgramData()
  ops: StaticArray<i32> = new StaticArray<i32>(OPS_COUNT)
  outsPool: OutsPool = new OutsPool()
  gensPool: GensPool = new GensPool()
  literalsSmoothed: StaticArray<Smoothed> = new StaticArray<Smoothed>(LITERALS_COUNT)

  // SeqForEach runtime state
  lastSeqTrigOuts: StaticArray<i32> = new StaticArray<i32>(SEQ_VOICES)
  lastSeqVelocityOuts: StaticArray<i32> = new StaticArray<i32>(SEQ_VOICES)
  lastSeqValueOuts: StaticArray<i32> = new StaticArray<i32>(SEQ_VOICES)
  lastSeqVoiceCountOut: i32 = 0
  currentVoiceIndex: i32 = 0
  seqForEachAudioOuts: StaticArray<i32> = new StaticArray<i32>(SEQ_VOICES)
  seqForEachAudioOutsCount: i32 = 0

  // Buffer remapping for SeqForEach (per-voice buffer isolation)
  // When inSeqForEach is true, buffer indices in range [bodyBufBase, bodyBufBase+BUFS_PER_VOICE)
  // get remapped to per-voice buffers starting at 500
  inSeqForEach: bool = false
  bodyBufBase: i32 = 0 // First buffer index used in SeqForEach body

  constructor() {
    for (let i = 0; i < this.literalsSmoothed.length; i++) {
      this.literalsSmoothed[i] = new Smoothed()
    }
  }

  // Get buffer with remapping applied when inside SeqForEach
  getBuf(index: i32): usize {
    if (this.inSeqForEach && index >= this.bodyBufBase) {
      // Remap to per-voice buffer: 500 + voice * BUFS_PER_VOICE + offset
      const offset = index - this.bodyBufBase
      const remapped = 500 + this.currentVoiceIndex * BUFS_PER_VOICE + offset
      return this.outsPool.get(remapped)
    }
    return this.outsPool.get(index)
  }
}
