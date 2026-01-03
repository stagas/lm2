import { Gen } from './gen'

export class Envfollow extends Gen {
  in$: usize = 0
  attack$: usize = 0
  release$: usize = 0

  private envelope: f32 = 0.0

  // Best-effort UI/debug state (read by UI history writers).
  // 0 = release, 1 = attack, 2 = steady
  visPhase: i32 = 2
  visPhase01: f32 = 0.5

  reset(): void {
    this.envelope = 0.0
    this.visPhase = 2
    this.visPhase01 = 0.5
  }

  copyFrom(other: Gen): void {
    const src = other as Envfollow
    this.envelope = src.envelope
    this.visPhase = src.visPhase
    this.visPhase01 = src.visPhase01
  }

  @inline
  generate(input: f32, attack: f32, release: f32): f32 {
    // Cache parameters
    const attackTime: f32 = Mathf.max(0.0001, Mathf.min(attack, 10))
    const releaseTime: f32 = Mathf.max(0.0001, Mathf.min(release, 10))

    const attackCoeff: f32 = Mathf.exp(-1 / (attackTime * sampleRate))
    const releaseCoeff: f32 = Mathf.exp(-1 / (releaseTime * sampleRate))

    const inputAbs: f32 = Mathf.abs(input)

    if (Mathf.abs(inputAbs - this.envelope) < 0.000001) this.visPhase = 2
    else this.visPhase = inputAbs > this.envelope ? 1 : 0
    this.visPhase01 = 0.5

    if (inputAbs > this.envelope) {
      this.envelope = inputAbs + (this.envelope - inputAbs) * attackCoeff
    }
    else {
      this.envelope = inputAbs + (this.envelope - inputAbs) * releaseCoeff
    }

    this.envelope = Mathf.max(0, Mathf.min(this.envelope, 1.0))

    return this.envelope
  }

  process(out$: usize, length: i32): void {
    let input$ = this.in$
    let attack$ = this.attack$
    let release$ = this.release$

    for (let i = 0; i < length; i++) {
      const sample = this.generate(
        load<f32>(input$),
        load<f32>(attack$),
        load<f32>(release$),
      )

      store<f32>(out$, sample)

      out$ += 4
      input$ += 4
      attack$ += 4
      release$ += 4
    }
  }
}
