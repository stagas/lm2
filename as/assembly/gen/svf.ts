import { Gen } from './gen'

export class Svf extends Gen {
  in$: usize = 0
  cut$: usize = 0
  q$: usize = 0

  c1: f32 = 0
  c2: f32 = 0

  a1: f32 = 1
  a2: f32 = 0
  a3: f32 = 0

  v0: f32 = 0
  v1: f32 = 0
  v2: f32 = 0
  v3: f32 = 0

  k: f32 = 0

  lastFreq: f32 = -1
  lastQ: f32 = -1
  lastSampleRate: f32 = -1

  reset(): void {
    this.c1 = 0
    this.c2 = 0
    this.a1 = 1
    this.a2 = 0
    this.a3 = 0
    this.v0 = 0
    this.v1 = 0
    this.v2 = 0
    this.v3 = 0
    this.k = 0
    this.lastFreq = -1
    this.lastQ = -1
    this.lastSampleRate = -1
  }

  copyFrom(other: Gen): void {
    const src = other as Svf
    this.c1 = src.c1
    this.c2 = src.c2
    this.a1 = src.a1
    this.a2 = src.a2
    this.a3 = src.a3
    this.v0 = src.v0
    this.v1 = src.v1
    this.v2 = src.v2
    this.v3 = src.v3
    this.k = src.k
    this.lastFreq = src.lastFreq
    this.lastQ = src.lastQ
    this.lastSampleRate = src.lastSampleRate
  }

  @inline
  processSample(input: f32): f32 {
    this.v0 = input
    this.v3 = input - this.c2
    this.v1 = this.a1 * this.c1 + this.a2 * this.v3
    this.v2 = this.c2 + this.a2 * this.c1 + this.a3 * this.v3
    this.c1 = 2.0 * this.v1 - this.c1
    this.c2 = 2.0 * this.v2 - this.c2
    return this.v2 // lowpass by default
  }

  @inline
  updateCoeffs(freq: f32, Q: f32): void {
    if (freq === this.lastFreq && Q === this.lastQ && sampleRate === this.lastSampleRate) return

    this.lastFreq = freq
    this.lastQ = Q
    this.lastSampleRate = sampleRate

    const freqClamped = f32(Mathf.max(50.0, Mathf.min(freq, nyquist)))
    const QClamped = f32(Mathf.max(0.01, Mathf.min(Q, 0.985)))

    const g: f32 = Mathf.tan((Mathf.PI * freqClamped) / sampleRate)
    this.k = 2.0 - 2.0 * QClamped
    this.a1 = 1.0 / (1.0 + g * (g + this.k))
    this.a2 = g * this.a1
    this.a3 = g * this.a2
  }
}

export class Slp extends Svf {
  process(out$: usize, length: i32): void {
    let cut$ = this.cut$
    let q$ = this.q$
    let in$ = this.in$

    for (let i = 0; i < length; i++) {
      this.updateCoeffs(load<f32>(cut$), load<f32>(q$))
      this.processSample(load<f32>(in$))
      store<f32>(out$, this.v2)
      out$ += 4
      in$ += 4
      cut$ += 4
      q$ += 4
    }
  }
}

export class Shp extends Svf {
  process(out$: usize, length: i32): void {
    let cut$ = this.cut$
    let q$ = this.q$
    let in$ = this.in$

    for (let i = 0; i < length; i++) {
      this.updateCoeffs(load<f32>(cut$), load<f32>(q$))
      this.processSample(load<f32>(in$))
      const output = this.v0 - this.k * this.v1 - this.v2
      store<f32>(out$, output)
      out$ += 4
      in$ += 4
      cut$ += 4
      q$ += 4
    }
  }
}

export class Sbp extends Svf {
  process(out$: usize, length: i32): void {
    let cut$ = this.cut$
    let q$ = this.q$
    let in$ = this.in$

    for (let i = 0; i < length; i++) {
      this.updateCoeffs(load<f32>(cut$), load<f32>(q$))
      this.processSample(load<f32>(in$))
      store<f32>(out$, this.v1)
      out$ += 4
      in$ += 4
      cut$ += 4
      q$ += 4
    }
  }
}

export class Sbs extends Svf {
  process(out$: usize, length: i32): void {
    let cut$ = this.cut$
    let q$ = this.q$
    let in$ = this.in$

    for (let i = 0; i < length; i++) {
      this.updateCoeffs(load<f32>(cut$), load<f32>(q$))
      this.processSample(load<f32>(in$))
      const output = this.v0 - this.k * this.v1
      store<f32>(out$, output)
      out$ += 4
      in$ += 4
      cut$ += 4
      q$ += 4
    }
  }
}

export class Speak extends Svf {
  process(out$: usize, length: i32): void {
    let cut$ = this.cut$
    let q$ = this.q$
    let in$ = this.in$

    for (let i = 0; i < length; i++) {
      this.updateCoeffs(load<f32>(cut$), load<f32>(q$))
      this.processSample(load<f32>(in$))
      const output = this.v0 - this.k * this.v1 - 2.0 * this.v2
      store<f32>(out$, output)
      out$ += 4
      in$ += 4
      cut$ += 4
      q$ += 4
    }
  }
}

export class Sap extends Svf {
  process(out$: usize, length: i32): void {
    let cut$ = this.cut$
    let q$ = this.q$
    let in$ = this.in$

    for (let i = 0; i < length; i++) {
      this.updateCoeffs(load<f32>(cut$), load<f32>(q$))
      this.processSample(load<f32>(in$))
      const output = this.v0 - 2.0 * this.k * this.v1
      store<f32>(out$, output)
      out$ += 4
      in$ += 4
      cut$ += 4
      q$ += 4
    }
  }
}
