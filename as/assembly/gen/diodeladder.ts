import { DIODELADDER_K_COMP, DIODELADDER_Q_COMP } from '../shared'
import { Gen } from './gen'

export class DiodeLadderFilterBlock extends Gen {
  in$: usize = 0
  cut$: usize = 0
  q$: usize = 0
  k$: usize = 0
  sat$: usize = 0

  z0: f32 = 0
  z1: f32 = 0
  z2: f32 = 0
  z3: f32 = 0
  z4: f32 = 0

  A: f32 = 0
  a: f32 = 0
  a2: f32 = 0
  b: f32 = 0
  b2: f32 = 0
  c: f32 = 0
  g: f32 = 0
  g0: f32 = 0
  ah: f32 = 0
  bh: f32 = 0
  ainv: f32 = 0
  k: f32 = 0

  lastCut: f32 = -1
  lastQ: f32 = -1
  lastK: f32 = -1
  lastSampleRate: f32 = -1

  reset(): void {
    this.z0 = 0
    this.z1 = 0
    this.z2 = 0
    this.z3 = 0
    this.z4 = 0
    this.A = 0
    this.a = 0
    this.a2 = 0
    this.b = 0
    this.b2 = 0
    this.c = 0
    this.g = 0
    this.g0 = 0
    this.ah = 0
    this.bh = 0
    this.ainv = 0
    this.k = 0
    this.lastCut = -1
    this.lastQ = -1
    this.lastK = -1
    this.lastSampleRate = -1
  }

  copyFrom(other: Gen): void {
    const src = other as DiodeLadderFilterBlock
    this.z0 = src.z0
    this.z1 = src.z1
    this.z2 = src.z2
    this.z3 = src.z3
    this.z4 = src.z4
    this.A = src.A
    this.a = src.a
    this.a2 = src.a2
    this.b = src.b
    this.b2 = src.b2
    this.c = src.c
    this.g = src.g
    this.g0 = src.g0
    this.ah = src.ah
    this.bh = src.bh
    this.ainv = src.ainv
    this.k = src.k
    this.lastCut = src.lastCut
    this.lastQ = src.lastQ
    this.lastK = src.lastK
    this.lastSampleRate = src.lastSampleRate
  }

  process(out$: usize, length: i32): void {
    let cut$ = this.cut$
    let q$ = this.q$
    let k$ = this.k$
    let sat$ = this.sat$
    let in$ = this.in$

    for (let i = 0; i < length; i++) {
      const sat = f32(Mathf.max(0.1, Mathf.min(load<f32>(sat$), 10.0)))
      this.updateCoeffs(load<f32>(cut$), load<f32>(q$), load<f32>(k$))
      const sample = this.processSample(load<f32>(in$), sat)
      store<f32>(out$, sample)
      out$ += 4
      in$ += 4
      cut$ += 4
      q$ += 4
      k$ += 4
      sat$ += 4
    }
  }

  @inline
  processSample(sample: f32, sat: f32): f32 {
    const A = this.A
    const a = this.a
    const a2 = this.a2
    const b = this.b
    const b2 = this.b2
    const c = this.c
    const g = this.g
    const g0 = this.g0
    const ah = this.ah
    const bh = this.bh
    const ainv = this.ainv
    const k = this.k

    // Current state
    const s0: f32 = (a2 * a * this.z0
      + a2 * b * this.z1
      + this.z2 * (b2 - 2.0 * a2) * a
      + this.z3 * (b2 - 3.0 * a2) * b)
      * c
    const s: f32 = bh * s0 - this.z4

    // Solve feedback loop (linear)
    let y5: f32 = (g * sample + s) / (1.0 + g * k)

    // Input clipping
    const y0: f32 = this.soft(sample - k * y5, sat)
    y5 = g * y0 + s

    // Compute integrator outputs
    const y4: f32 = g0 * y0 + s0
    const y3: f32 = (b * y4 - this.z3) * ainv
    const y2: f32 = (b * y3 - a * y4 - this.z2) * ainv
    const y1: f32 = (b * y2 - a * y3 - this.z1) * ainv

    // Update filter state
    this.z0 += 4.0 * a * (y0 - y1 + y2)
    this.z1 += 2.0 * a * (y1 - 2.0 * y2 + y3)
    this.z2 += 2.0 * a * (y2 - 2.0 * y3 + y4)
    this.z3 += 2.0 * a * (y3 - 2.0 * y4)
    this.z4 = bh * y4 + ah * y5

    return A * y4
  }

  @inline
  soft(x: f32, amount: f32): f32 {
    return x / (1.0 / amount + Mathf.abs(x))
  }

  @inline
  updateCoeffs(cut: f32, q: f32, k: f32): void {
    if (cut === this.lastCut && q === this.lastQ && k === this.lastK && sampleRate === this.lastSampleRate) return

    this.lastCut = cut
    this.lastQ = q
    this.lastK = k
    this.lastSampleRate = sampleRate

    const cutClamped = f32(Mathf.max(20.0, Mathf.min(cut, nyquist)))
    const qClamped = f32(Mathf.max(0.0, Mathf.min(q, 1.0)))
    const kClamped = f32(Mathf.max(0.0, Mathf.min(k, 1.0)))

    // HPF - k parameter controls the HPF coefficient directly (0..1 scaled to PI)
    const K: f32 = kClamped * Mathf.PI
    this.ah = (K - 2.0) / (K + 2.0)
    this.bh = 2.0 / (K + 2.0)

    // Resonance
    this.k = 20.0 * qClamped
    this.A = 1.0 + 0.5 * this.k

    // Main filter
    // Ladder resonance shifts the apparent cutoff; compensate so the peak lands nearer `cut`.
    // This keeps the control feel closer to SVF/biquad style “resonance at cutoff”.
    const cutNorm: f32 = cutClamped / nyquist
    // Empirically, the resonance peak can sit above the parameter cutoff.
    // Compensate by lowering the internal cutoff, but make it nonlinear in `q` so we don't
    // over-compensate at moderate resonance (which would put the peak *below* the playhead).
    const qq: f32 = qClamped * qClamped
    const comp: f32 = 1.0 + DIODELADDER_Q_COMP * qq + DIODELADDER_K_COMP * (kClamped * qClamped)
    const cutComp: f32 = f32(Mathf.max(20.0, Mathf.min((cutNorm / comp) * nyquist, nyquist)))

    let a: f32 = Mathf.PI * (cutComp / nyquist)
    a = 2.0 * Mathf.tan(0.5 * a)
    this.ainv = 1.0 / a
    const a2: f32 = a * a
    const b: f32 = 2.0 * a + 1.0
    const b2: f32 = b * b
    const c: f32 = 1.0 / (2.0 * a2 * a2 - 4.0 * a2 * b2 + b2 * b2)
    const g0: f32 = 2.0 * a2 * a2 * c
    this.g = g0 * this.bh

    this.a = a
    this.a2 = a2
    this.b = b
    this.b2 = b2
    this.c = c
    this.g0 = g0
  }
}

export class DiodeLadder extends DiodeLadderFilterBlock {
  // Inherits process method from DiodeLadderFilterBlock
}
