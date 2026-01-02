import { Gen } from './gen'

export class OnePole extends Gen {
  in$: usize = 0
  cut$: usize = 0

  y1: f32 = 0

  lastFreq: f32 = -1
  lastSampleRate: f32 = -1
  lastAlpha: f32 = 0

  reset(): void {
    this.y1 = 0
    this.lastFreq = -1
    this.lastSampleRate = -1
    this.lastAlpha = 0
  }

  copyFrom(other: Gen): void {
    const src = other as OnePole
    this.y1 = src.y1
    this.lastFreq = src.lastFreq
    this.lastSampleRate = src.lastSampleRate
    this.lastAlpha = src.lastAlpha
  }

  @inline
  calculateCoeffs(cutoff: f32): f32 {
    if (cutoff === this.lastFreq && sampleRate === this.lastSampleRate) return this.lastAlpha

    this.lastFreq = cutoff
    this.lastSampleRate = sampleRate

    const freq = f32(Mathf.max(20.0, Mathf.min(cutoff, nyquist)))
    const a: f32 = Mathf.exp((-2.0 * Mathf.PI * freq) / sampleRate)
    this.lastAlpha = 1.0 - a
    return this.lastAlpha
  }
}

export class Olp extends OnePole {
  process(out$: usize, length: i32): void {
    let cut$ = this.cut$
    let in$ = this.in$

    for (let i = 0; i < length; i++) {
      const alpha = this.calculateCoeffs(load<f32>(cut$))
      const input = load<f32>(in$)
      this.y1 = this.y1 + alpha * (input - this.y1)
      store<f32>(out$, this.y1)
      out$ += 4
      in$ += 4
      cut$ += 4
    }
  }
}

export class Ohp extends OnePole {
  process(out$: usize, length: i32): void {
    let cut$ = this.cut$
    let in$ = this.in$

    for (let i = 0; i < length; i++) {
      const alpha = this.calculateCoeffs(load<f32>(cut$))
      const input = load<f32>(in$)
      this.y1 = this.y1 + alpha * (input - this.y1)
      store<f32>(out$, input - this.y1)
      out$ += 4
      in$ += 4
      cut$ += 4
    }
  }
}
