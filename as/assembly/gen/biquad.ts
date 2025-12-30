import { Gen } from './gen'

export class Biquad extends Gen {
  in$: usize = 0
  cut$: usize = 0
  q$: usize = 0
  gain$: usize = 0

  x1: f32 = 0
  x2: f32 = 0
  y1: f32 = 0
  y2: f32 = 0

  a0: f32 = 1
  a1: f32 = 0
  a2: f32 = 0
  b0: f32 = 1
  b1: f32 = 0
  b2: f32 = 0

  lastFreq: f32 = -1
  lastQ: f32 = -1
  lastGain: f32 = -1
  lastSampleRate: f32 = -1

  reset(): void {
    this.x1 = 0
    this.x2 = 0
    this.y1 = 0
    this.y2 = 0
    this.a0 = 1
    this.a1 = 0
    this.a2 = 0
    this.b0 = 1
    this.b1 = 0
    this.b2 = 0
    this.lastFreq = -1
    this.lastQ = -1
    this.lastGain = -1
    this.lastSampleRate = -1
  }

  copyFrom(other: Gen): void {
    const src = other as Biquad
    this.x1 = src.x1
    this.x2 = src.x2
    this.y1 = src.y1
    this.y2 = src.y2
    this.a0 = src.a0
    this.a1 = src.a1
    this.a2 = src.a2
    this.b0 = src.b0
    this.b1 = src.b1
    this.b2 = src.b2
    this.lastFreq = src.lastFreq
    this.lastQ = src.lastQ
    this.lastGain = src.lastGain
    this.lastSampleRate = src.lastSampleRate
  }

  process(out$: usize, length: i32): void {}

  // @inline
  processSample(input: f32): f32 {
    const a0inv = f32(1.0) / this.a0
    const output: f32 = f32(this.b0 * a0inv * input)
      + this.b1 * a0inv * this.x1
      + this.b2 * a0inv * this.x2
      - this.a1 * a0inv * this.y1
      - this.a2 * a0inv * this.y2

    this.x2 = this.x1
    this.x1 = input
    this.y2 = this.y1
    this.y1 = output

    return output
  }

  // @inline
  calculateLowpass(cutoff: f32, q: f32): void {
    if (cutoff === this.lastFreq && q === this.lastQ && sampleRate === this.lastSampleRate) return

    this.lastFreq = cutoff
    this.lastQ = q
    this.lastSampleRate = sampleRate

    const freq = f32(Mathf.max(20.0, Mathf.min(cutoff, nyquist)))
    const Q = f32(Mathf.max(0.01, Mathf.min(q, 20.0)))

    const omega: f32 = (TWO_PI * freq) / sampleRate
    const sn: f32 = Mathf.sin(omega)
    const cs: f32 = Mathf.cos(omega)
    const alpha: f32 = sn / (2 * Q)

    this.b0 = (1 - cs) / 2
    this.b1 = 1 - cs
    this.b2 = (1 - cs) / 2
    this.a0 = 1 + alpha
    this.a1 = -2 * cs
    this.a2 = 1 - alpha
  }

  // @inline
  calculateHighpass(cutoff: f32, q: f32): void {
    if (cutoff === this.lastFreq && q === this.lastQ && sampleRate === this.lastSampleRate) return

    this.lastFreq = cutoff
    this.lastQ = q
    this.lastSampleRate = sampleRate

    const freq = f32(Mathf.max(20.0, Mathf.min(cutoff, nyquist)))
    const Q = f32(Mathf.max(0.01, Mathf.min(q, 20.0)))

    const omega: f32 = (TWO_PI * freq) / sampleRate
    const sn: f32 = Mathf.sin(omega)
    const cs: f32 = Mathf.cos(omega)
    const alpha: f32 = sn / (2 * Q)

    this.b0 = (1 + cs) / 2
    this.b1 = -(1 + cs)
    this.b2 = (1 + cs) / 2
    this.a0 = 1 + alpha
    this.a1 = -2 * cs
    this.a2 = 1 - alpha
  }

  // @inline
  calculateBandpass(cutoff: f32, q: f32): void {
    if (cutoff === this.lastFreq && q === this.lastQ && sampleRate === this.lastSampleRate) return

    this.lastFreq = cutoff
    this.lastQ = q
    this.lastSampleRate = sampleRate

    const freq = f32(Mathf.max(20.0, Mathf.min(cutoff, nyquist)))
    const Q = f32(Mathf.max(0.01, Mathf.min(q, 20.0)))

    const omega: f32 = (TWO_PI * freq) / sampleRate
    const sn: f32 = Mathf.sin(omega)
    const cs: f32 = Mathf.cos(omega)
    const alpha: f32 = sn / (2 * Q)

    this.b0 = alpha
    this.b1 = 0
    this.b2 = -alpha
    this.a0 = 1 + alpha
    this.a1 = -2 * cs
    this.a2 = 1 - alpha
  }

  // @inline
  calculateBandstop(cutoff: f32, q: f32): void {
    if (cutoff === this.lastFreq && q === this.lastQ && sampleRate === this.lastSampleRate) return

    this.lastFreq = cutoff
    this.lastQ = q
    this.lastSampleRate = sampleRate

    const freq = f32(Mathf.max(20.0, Mathf.min(cutoff, nyquist)))
    const Q = f32(Mathf.max(0.01, Mathf.min(q, 20.0)))

    const omega: f32 = (TWO_PI * freq) / sampleRate
    const sn: f32 = Mathf.sin(omega)
    const cs: f32 = Mathf.cos(omega)
    const alpha: f32 = sn / (2 * Q)

    this.b0 = 1
    this.b1 = -2 * cs
    this.b2 = 1
    this.a0 = 1 + alpha
    this.a1 = -2 * cs
    this.a2 = 1 - alpha
  }

  // @inline
  calculateLowshelf(cutoff: f32, gainDb: f32): void {
    if (cutoff === this.lastFreq && gainDb === this.lastGain && sampleRate === this.lastSampleRate) return

    this.lastFreq = cutoff
    this.lastGain = gainDb
    this.lastSampleRate = sampleRate

    const freq = f32(Mathf.max(20.0, Mathf.min(cutoff, nyquist)))
    const gain = f32(Mathf.max(-40.0, Mathf.min(gainDb, 40.0)))

    const omega: f32 = (TWO_PI * freq) / sampleRate
    const sn: f32 = Mathf.sin(omega)
    const cs: f32 = Mathf.cos(omega)
    const A: f32 = Mathf.pow(10, gain / 40)
    const beta: f32 = Mathf.sqrt(A) / 1.0

    this.b0 = A * (A + 1 - (A - 1) * cs + beta * sn)
    this.b1 = 2 * A * (A - 1 - (A + 1) * cs)
    this.b2 = A * (A + 1 - (A - 1) * cs - beta * sn)
    this.a0 = A + 1 + (A - 1) * cs + beta * sn
    this.a1 = -2 * (A - 1 + (A + 1) * cs)
    this.a2 = A + 1 + (A - 1) * cs - beta * sn
  }

  // @inline
  calculateHighshelf(cutoff: f32, gainDb: f32): void {
    if (cutoff === this.lastFreq && gainDb === this.lastGain && sampleRate === this.lastSampleRate) return

    this.lastFreq = cutoff
    this.lastGain = gainDb
    this.lastSampleRate = sampleRate

    const freq = f32(Mathf.max(20.0, Mathf.min(cutoff, nyquist)))
    const gain = f32(Mathf.max(-40.0, Mathf.min(gainDb, 40.0)))

    const omega: f32 = (TWO_PI * freq) / sampleRate
    const sn: f32 = Mathf.sin(omega)
    const cs: f32 = Mathf.cos(omega)
    const A: f32 = Mathf.pow(10, gain / 40)
    const beta: f32 = Mathf.sqrt(A) / 1.0

    this.b0 = A * (A + 1 + (A - 1) * cs + beta * sn)
    this.b1 = -2 * A * (A - 1 + (A + 1) * cs)
    this.b2 = A * (A + 1 + (A - 1) * cs - beta * sn)
    this.a0 = A + 1 - (A - 1) * cs + beta * sn
    this.a1 = 2 * (A - 1 - (A + 1) * cs)
    this.a2 = A + 1 - (A - 1) * cs - beta * sn
  }

  // @inline
  calculatePeak(cutoff: f32, q: f32, gainDb: f32): void {
    if (cutoff === this.lastFreq && q === this.lastQ && gainDb === this.lastGain
      && sampleRate === this.lastSampleRate)
    {
      return
    }

    this.lastFreq = cutoff
    this.lastQ = q
    this.lastGain = gainDb
    this.lastSampleRate = sampleRate

    const freq = f32(Mathf.max(20.0, Mathf.min(cutoff, nyquist)))
    const Q = f32(Mathf.max(0.01, Mathf.min(q, 20.0)))
    const gain = f32(Mathf.max(-40.0, Mathf.min(gainDb, 40.0)))

    const omega: f32 = (TWO_PI * freq) / sampleRate
    const sn: f32 = Mathf.sin(omega)
    const cs: f32 = Mathf.cos(omega)
    const A: f32 = Mathf.pow(10, gain / 40)
    const alpha: f32 = sn / (2 * Q)

    this.b0 = 1 + alpha * A
    this.b1 = -2 * cs
    this.b2 = 1 - alpha * A
    this.a0 = 1 + alpha / A
    this.a1 = -2 * cs
    this.a2 = 1 - alpha / A
  }

  // @inline
  calculateAllpass(cutoff: f32, q: f32): void {
    if (cutoff === this.lastFreq && q === this.lastQ && sampleRate === this.lastSampleRate) return

    this.lastFreq = cutoff
    this.lastQ = q
    this.lastSampleRate = sampleRate

    const freq = f32(Mathf.max(20.0, Mathf.min(cutoff, nyquist)))
    const Q = f32(Mathf.max(0.01, Mathf.min(q, 20.0)))

    const omega: f32 = (TWO_PI * freq) / sampleRate
    const sn: f32 = Mathf.sin(omega)
    const cs: f32 = Mathf.cos(omega)
    const alpha: f32 = sn / (2 * Q)

    this.b0 = 1 - alpha
    this.b1 = -2 * cs
    this.b2 = 1 + alpha
    this.a0 = 1 + alpha
    this.a1 = -2 * cs
    this.a2 = 1 - alpha
  }
}

export class Lp extends Biquad {
  process(out$: usize, length: i32): void {
    let cut$ = this.cut$
    let q$ = this.q$
    let in$ = this.in$

    for (let i = 0; i < length; i++) {
      this.calculateLowpass(load<f32>(cut$), load<f32>(q$))
      const sample = this.processSample(load<f32>(in$))
      store<f32>(out$, sample)
      out$ += 4
      in$ += 4
      cut$ += 4
      q$ += 4
    }
  }
}

export class Hp extends Biquad {
  process(out$: usize, length: i32): void {
    let cut$ = this.cut$
    let q$ = this.q$
    let in$ = this.in$

    for (let i = 0; i < length; i++) {
      this.calculateHighpass(load<f32>(cut$), load<f32>(q$))
      const sample = this.processSample(load<f32>(in$))
      store<f32>(out$, sample)
      out$ += 4
      in$ += 4
      cut$ += 4
      q$ += 4
    }
  }
}

export class Bp extends Biquad {
  process(out$: usize, length: i32): void {
    let cut$ = this.cut$
    let q$ = this.q$
    let in$ = this.in$

    for (let i = 0; i < length; i++) {
      this.calculateBandpass(load<f32>(cut$), load<f32>(q$))
      const sample = this.processSample(load<f32>(in$))
      store<f32>(out$, sample)
      out$ += 4
      in$ += 4
      cut$ += 4
      q$ += 4
    }
  }
}

export class Bs extends Biquad {
  process(out$: usize, length: i32): void {
    let cut$ = this.cut$
    let q$ = this.q$
    let in$ = this.in$

    for (let i = 0; i < length; i++) {
      this.calculateBandstop(load<f32>(cut$), load<f32>(q$))
      const sample = this.processSample(load<f32>(in$))
      store<f32>(out$, sample)
      out$ += 4
      in$ += 4
      cut$ += 4
      q$ += 4
    }
  }
}

export class Ls extends Biquad {
  process(out$: usize, length: i32): void {
    let cut$ = this.cut$
    let gain$ = this.gain$
    let in$ = this.in$

    for (let i = 0; i < length; i++) {
      this.calculateLowshelf(load<f32>(cut$), load<f32>(gain$))
      const sample = this.processSample(load<f32>(in$))
      store<f32>(out$, sample)
      out$ += 4
      in$ += 4
      cut$ += 4
      gain$ += 4
    }
  }
}

export class Hs extends Biquad {
  process(out$: usize, length: i32): void {
    let cut$ = this.cut$
    let gain$ = this.gain$
    let in$ = this.in$

    for (let i = 0; i < length; i++) {
      this.calculateHighshelf(load<f32>(cut$), load<f32>(gain$))
      const sample = this.processSample(load<f32>(in$))
      store<f32>(out$, sample)
      out$ += 4
      in$ += 4
      cut$ += 4
      gain$ += 4
    }
  }
}

export class Peak extends Biquad {
  process(out$: usize, length: i32): void {
    let cut$ = this.cut$
    let q$ = this.q$
    let gain$ = this.gain$
    let in$ = this.in$

    for (let i = 0; i < length; i++) {
      this.calculatePeak(load<f32>(cut$), load<f32>(q$), load<f32>(gain$))
      const sample = this.processSample(load<f32>(in$))
      store<f32>(out$, sample)
      out$ += 4
      in$ += 4
      cut$ += 4
      q$ += 4
      gain$ += 4
    }
  }
}

export class Ap extends Biquad {
  process(out$: usize, length: i32): void {
    let cut$ = this.cut$
    let q$ = this.q$
    let in$ = this.in$

    for (let i = 0; i < length; i++) {
      this.calculateAllpass(load<f32>(cut$), load<f32>(q$))
      const sample = this.processSample(load<f32>(in$))
      store<f32>(out$, sample)
      out$ += 4
      in$ += 4
      cut$ += 4
      q$ += 4
    }
  }
}
