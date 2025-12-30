import { LITERALS_COUNT } from '../constants'
import { bpm, globalSampleCount, sampleRate, setVmError } from '../globals'
import { Program } from '../program'
import { fillAudio } from './audio-ops'
import { VmTag } from './types'

export class VmAudio {
  outCursor: i32 = 0
  smoothedHas: StaticArray<i32> = new StaticArray<i32>(LITERALS_COUNT)
  smoothedOutIndex: StaticArray<i32> = new StaticArray<i32>(LITERALS_COUNT)
  smoothedKeys: StaticArray<i32> = new StaticArray<i32>(LITERALS_COUNT)
  smoothedCount: i32 = 0
  tHas: i32 = 0
  tOutIndex: i32 = 0

  allocOut(program: Program): i32 {
    const idx = this.outCursor
    this.outCursor = idx + 1
    const max = program.outsPool.outs.length
    if (idx < 0 || idx >= max) {
      setVmError(2, 0)
      return 0
    }
    return idx
  }

  getTRamp(length: i32, program: Program): i32 {
    if (this.tHas !== 0) return this.tOutIndex
    const outIndex = this.allocOut(program)
    const out$ = program.getOutBuffer(outIndex)
    this.tHas = 1
    this.tOutIndex = outIndex

    const srInv: f64 = 1.0 / (sampleRate as f64)
    const bpmScale: f64 = (bpm as f64) / 60.0
    const base: f64 = (globalSampleCount as f64) * srInv * bpmScale
    const step: f64 = srInv * bpmScale

    let p$ = out$
    let t: f64 = base
    for (let i = 0; i < length; i++) {
      store<f32>(p$, t as f32)
      p$ += 4
      t += step
    }

    return outIndex
  }

  toAudioPtr(tag: VmTag, num: f64, aux: i32, length: i32, program: Program): usize {
    if (tag === VmTag.Audio) {
      return program.getOutBuffer(aux)
    }

    if (tag === VmTag.Num) {
      if (aux < 0) {
        const k = -1 - aux
        if (k >= 0 && k < this.smoothedHas.length) {
          if (this.smoothedHas[k] !== 0) {
            const outIndex = this.smoothedOutIndex[k]
            return program.getOutBuffer(outIndex)
          }
          const outIndex = this.allocOut(program)
          const out$ = program.getOutBuffer(outIndex)
          this.smoothedHas[k] = 1
          this.smoothedOutIndex[k] = outIndex
          if (this.smoothedCount < this.smoothedKeys.length) {
            this.smoothedKeys[this.smoothedCount++] = k
          }

          const s = program.literalsSmoothed[k]
          if (s.value === Infinity && s.target === Infinity) {
            s.value = num
            s.target = num
          }
          else {
            s.target = num
          }
          let p$ = out$
          for (let i = 0; i < length; i++) {
            s.update()
            store<f32>(p$, s.value as f32)
            p$ += 4
          }
          return out$
        }
      }
      const outIndex = this.allocOut(program)
      const out$ = program.getOutBuffer(outIndex)
      fillAudio(out$, num as f32, length)
      return out$
    }

    const outIndex = this.allocOut(program)
    const out$ = program.getOutBuffer(outIndex)

    if (tag === VmTag.Bool) {
      fillAudio(out$, (num != 0.0 ? 1.0 : 0.0) as f32, length)
      return out$
    }

    fillAudio(out$, 0.0 as f32, length)
    return out$
  }

  reset(): void {
    this.outCursor = 0
    this.tHas = 0
    const n: i32 = this.smoothedCount
    for (let i: i32 = 0; i < n; i++) {
      const k: i32 = this.smoothedKeys[i]
      if (k >= 0 && k < this.smoothedHas.length) {
        this.smoothedHas[k] = 0
      }
    }
    this.smoothedCount = 0
  }

  invalidateFrom(outCursor: i32): void {
    if (this.tHas !== 0 && this.tOutIndex >= outCursor) {
      this.tHas = 0
    }

    let w: i32 = 0
    const n: i32 = this.smoothedCount
    for (let i: i32 = 0; i < n; i++) {
      const k: i32 = this.smoothedKeys[i]
      if (k >= 0 && k < this.smoothedHas.length) {
        if (this.smoothedHas[k] !== 0 && this.smoothedOutIndex[k] >= outCursor) {
          this.smoothedHas[k] = 0
          continue
        }
      }
      if (w != i) this.smoothedKeys[w] = k
      w++
    }
    this.smoothedCount = w
  }
}
