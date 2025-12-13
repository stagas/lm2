import {
  ARRAY_HEADER_SIZE,
  ARRAY_SIZE,
  ARRAYS_COUNT,
  CALLBACK_SCOPE_MAX_BINDINGS,
  CALLBACK_SCOPE_MAX_DEPTH,
  CHUNK_SIZE,
  LITERALS_COUNT,
  MINI_HEADER_SIZE,
  OPS_COUNT,
  RING_BUFFER_SIZE,
  SEQ_HISTORY_SIZE,
  SEQ_VOICES,
} from './constants'
import { Ad } from './gen/ad'
import { Adsr } from './gen/adsr'
import { Analyser } from './gen/analyser'
import { Gen } from './gen/gen'
import { Mini } from './gen/mini'
import { Sin } from './gen/sin'
import { Smoothed } from './lib/smoothed'
import { MiniEventBuffer, MiniEvents } from './mini/events'
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
  outsPool: OutsPool = new OutsPool()
  analyserOutsPool: AnalyserOutsPool = new AnalyserOutsPool()
  gensPool: GensPool = new GensPool()
  literalsSmoothed: StaticArray<Smoothed> = new StaticArray<Smoothed>(LITERALS_COUNT)

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

  prepareProgram(): void {
    // Pre-populate history buffers with future events for visualization
    // Only clears if bytecode changed, otherwise preserves existing history
    const ops = this.data.ops
    const eventEmitter = new MiniEvents()
    const eventBuffer = new MiniEventBuffer()

    let pc = 0
    while (pc < ops.length && pc >= 0) {
      const op = ops[pc] as Op
      pc++

      if (op === Op.Mini) {
        const arrayIndex = ops[pc++]
        const array$ = this.data.arrays[arrayIndex]
        if (array$ !== 0) {
          const array = changetype<StaticArray<f32>>(array$)
          let historySize = i32(array[2])
          if (historySize <= 0) historySize = SEQ_HISTORY_SIZE

          // Get current history state - never clear it completely
          let historyWritePos = i32(array[1])
          if (historyWritePos <= 0) {
            historyWritePos = 0
          array[1] = 0
          }

          // Generate events for time window spanning pianoroll (16 seconds)
          const cycleLength = 1.0 as f32
          const secondsPerBeat = 60.0 / bpm
          const cycleSeconds = cycleLength * secondsPerBeat
          const cycleSamples = (cycleSeconds * sampleRate) as f32
          const currentSample = globalSampleCount
          const pianorollWindowSeconds = 16.0 as f32
          const pianorollWindowSamples = i32(pianorollWindowSeconds * sampleRate)
          const lookAheadCycles = i32(Mathf.ceil(f32(pianorollWindowSamples) / cycleSamples))

          // Find where to start generating events
          // Always start from currentSample (or 0 if not playing) to ensure visualizations see events
          let startSample = currentSample > 0 ? currentSample : 0

          // Find the latest future event in history to determine where to continue
          // Don't overwrite past events (events that have already ended)
          let latestFutureSample = currentSample
          for (let n = 0; n < historySize; n++) {
            const readPos = (historyWritePos - 1 - n + historySize) % historySize
            const historyIdx = readPos * 3
            const eventStartSample = i32(array[3 + historyIdx + 1])
            const eventEndSample = i32(array[3 + historyIdx + 2])

            // Skip empty slots
            if (eventStartSample === 0 && eventEndSample === 0) continue

            // Only consider future events (events that haven't started yet)
            // Skip events that have already ended (they're past events)
            if (eventStartSample >= currentSample && eventEndSample >= currentSample && eventEndSample > latestFutureSample) {
              latestFutureSample = eventEndSample
            }
          }

          // Start generating from after the latest future event, or from currentSample if no future events
          startSample = latestFutureSample > currentSample ? latestFutureSample : currentSample

          // Always generate events for the full lookahead window
          // This ensures visualizations show events immediately after edits
          const targetEndSample = startSample + pianorollWindowSamples
          const startCycle = i32(Mathf.ceil(f32((startSample as f32) / cycleSamples)))
          const endCycle = i32(Mathf.ceil(f32((targetEndSample as f32) / cycleSamples)))

          // Always generate cycles - ensure events are generated even if startCycle == endCycle
          // This ensures visualizations see events immediately after edits
          if (startCycle <= endCycle) {
            for (let cycle = startCycle; cycle <= endCycle; cycle++) {
              const cycleStartSample = i32(cycleSamples * (cycle as f32))
              const windowStart = cycleStartSample
              const windowEnd = cycleStartSample + i32(cycleSamples)

              eventBuffer.clear()
              eventEmitter.emitEvents(
                array$,
                eventBuffer,
                cycleStartSample,
                cycleLength,
                cycleSamples,
                windowStart,
                windowEnd,
              )

              // Write events to history buffer
              // Only write to empty slots or slots with future events (don't overwrite past events)
              for (let i = 0; i < eventBuffer.writePos; i++) {
                const event = eventBuffer.events[i]
                if (!event) continue
                if (event.opIndex < MINI_HEADER_SIZE) continue
                if (event.value <= 0) continue

                const historyBase = 3

                // Find next available slot (empty or with future event that we can overwrite)
                // Always write events - overwrite future events if needed, but never past events
                let attempts = 0
                let written = false
                while (attempts < historySize && !written) {
                  const historyIdx = historyWritePos * 3
                  if (historyIdx + 2 >= historySize * 3) break

                  const existingStartSample = i32(array[historyBase + historyIdx + 1])
                  const existingEndSample = i32(array[historyBase + historyIdx + 2])

                  // Slot is empty or contains an event that has already ended (can overwrite)
                  // Don't overwrite events that haven't ended yet (they might still be playing)
                  if (existingEndSample === 0 || existingEndSample < currentSample) {
                    array[historyBase + historyIdx] = (event.opIndex - MINI_HEADER_SIZE) as f32
                    array[historyBase + historyIdx + 1] = event.startSample as f32
                    array[historyBase + historyIdx + 2] = event.endSample as f32
                    historyWritePos = (historyWritePos + 1) % historySize
                    written = true
                    break
                  }

                  // Slot has an event that hasn't ended yet, try next slot
                  historyWritePos = (historyWritePos + 1) % historySize
                  attempts++
                }

                // If we couldn't find a slot (all slots have events that haven't ended yet),
                // we need to overwrite the oldest event that has already ended
                // This ensures events are always written, but we never overwrite events that are still playing
                if (!written) {
                  // Find oldest event that has already ended to overwrite
                  let oldestEndedPos = -1
                  let oldestEndedSample = i32.MAX_VALUE
                  for (let n = 0; n < historySize; n++) {
                    const readPos = (historyWritePos - 1 - n + historySize) % historySize
                    const historyIdx = readPos * 3
                    const existingEndSample = i32(array[historyBase + historyIdx + 2])
                    // Only consider events that have already ended
                    if (existingEndSample > 0 && existingEndSample < currentSample && existingEndSample < oldestEndedSample) {
                      oldestEndedSample = existingEndSample
                      oldestEndedPos = readPos
                    }
                  }

                  // If no ended events found, find the oldest event overall (last resort)
                  if (oldestEndedPos < 0) {
                    for (let n = 0; n < historySize; n++) {
                      const readPos = (historyWritePos - 1 - n + historySize) % historySize
                      const historyIdx = readPos * 3
                      const existingEndSample = i32(array[historyBase + historyIdx + 2])
                      if (existingEndSample > 0 && existingEndSample < oldestEndedSample) {
                        oldestEndedSample = existingEndSample
                        oldestEndedPos = readPos
                      }
                    }
                  }

                  if (oldestEndedPos >= 0) {
                    const historyIdx = oldestEndedPos * 3
                    array[historyBase + historyIdx] = (event.opIndex - MINI_HEADER_SIZE) as f32
                    array[historyBase + historyIdx + 1] = event.startSample as f32
                    array[historyBase + historyIdx + 2] = event.endSample as f32
                  }
                }
              }
            }
          }

          array[1] = historyWritePos as f32
        }

        // Skip Mini op arguments: voiceCountOut, voice outputs (SEQ_VOICES * 3), callback metadata (9)
        pc++ // voiceCountOut
        for (let v = 0; v < SEQ_VOICES; v++) {
          pc += 3 // trig, velocity, value
        }
        pc += 9 // callback metadata
      }
      else if (op === Op.End) {
        break
      }
      else {
        // Unknown op encountered - break to avoid infinite loop
        // prepareProgram only needs to handle Mini ops
        break
      }
    }
  }

  updateHistoryBuffers(): void {
    // Continuously update history buffers to maintain lookahead window
    const ops = this.data.ops
    const eventEmitter = new MiniEvents()
    const eventBuffer = new MiniEventBuffer()

    let pc = 0
    while (pc < ops.length && pc >= 0) {
      const op = ops[pc] as Op
      pc++

      if (op === Op.Mini) {
        const arrayIndex = ops[pc++]
        const array$ = this.data.arrays[arrayIndex]
        if (array$ !== 0) {
          const array = changetype<StaticArray<f32>>(array$)
          let historySize = i32(array[2])
          if (historySize <= 0) historySize = SEQ_HISTORY_SIZE

          const cycleLength = 1.0 as f32
          const secondsPerBeat = 60.0 / bpm
          const cycleSeconds = cycleLength * secondsPerBeat
          const cycleSamples = (cycleSeconds * sampleRate) as f32
          const currentSample = globalSampleCount
          const pianorollWindowSeconds = 16.0 as f32
          const pianorollWindowSamples = i32(pianorollWindowSeconds * sampleRate)
          const lookAheadCycles = i32(Mathf.ceil(f32(pianorollWindowSamples) / cycleSamples))

          // Generate events ahead of current playback position
          let historyWritePos = i32(array[1])
          const lookAheadSamples = i32(pianorollWindowSeconds * sampleRate)
          const targetEndSample = currentSample + lookAheadSamples

          // Find the latest event in history to determine where to continue
          let latestSample = currentSample
          for (let n = 0; n < historySize; n++) {
            const readPos = (historyWritePos - 1 - n + historySize) % historySize
            const historyIdx = readPos * 3
            const endSample = i32(array[3 + historyIdx + 2])
            if (endSample > latestSample) {
              latestSample = endSample
            }
          }

          // Generate events from after latestSample to targetEndSample (don't overwrite)
          const startSample = latestSample > currentSample ? latestSample : currentSample
          const startCycle = i32(Mathf.ceil(f32((startSample as f32) / cycleSamples)))
          const endCycle = i32(Mathf.ceil(f32((targetEndSample as f32) / cycleSamples)))

          // Only generate cycles that are ahead of existing history
          if (startCycle < endCycle) {
            for (let cycle = startCycle; cycle <= endCycle; cycle++) {
              const cycleStartSample = i32(cycleSamples * (cycle as f32))
              const windowStart = cycleStartSample
              const windowEnd = cycleStartSample + i32(cycleSamples)

              eventBuffer.clear()
              eventEmitter.emitEvents(
                array$,
                eventBuffer,
                cycleStartSample,
                cycleLength,
                cycleSamples,
                windowStart,
                windowEnd,
              )

              // Write events to history buffer (append, don't overwrite existing valid events)
              for (let i = 0; i < eventBuffer.writePos; i++) {
                const event = eventBuffer.events[i]
                if (!event) continue
                if (event.opIndex < MINI_HEADER_SIZE) continue
                if (event.value <= 0) continue

                const historyBase = 3

                // Find next available slot (empty or with event that ends before this one starts)
                let attempts = 0
                while (attempts < historySize) {
                  const historyIdx = historyWritePos * 3
                  if (historyIdx + 2 >= historySize * 3) break

                  const existingEndSample = i32(array[historyBase + historyIdx + 2])

                  // Slot is empty or has an event that ends before this one starts
                  if (existingEndSample === 0 || event.startSample > existingEndSample) {
                    array[historyBase + historyIdx] = (event.opIndex - MINI_HEADER_SIZE) as f32
                    array[historyBase + historyIdx + 1] = event.startSample as f32
                    array[historyBase + historyIdx + 2] = event.endSample as f32
                    historyWritePos = (historyWritePos + 1) % historySize
                    break
                  }

                  // Slot has valid event, try next slot
                  historyWritePos = (historyWritePos + 1) % historySize
                  attempts++
                }
              }
            }
          }

          array[1] = historyWritePos as f32
        }

        // Skip Mini op arguments
        pc++ // voiceCountOut
        for (let v = 0; v < SEQ_VOICES; v++) {
          pc += 3 // trig, velocity, value
        }
        pc += 9 // callback metadata
      }
      else if (op === Op.End) {
        break
      }
      else {
        break
      }
    }
  }
}
