import { Gen } from './gen'

export class Step extends Gen {
  arrId: i32 = -1
  trig$: usize = 0
  currentIndex: i32 = 0
  lastTrig: f32 = 0.0

  reset(): void {
    this.currentIndex = 0
    this.lastTrig = 0.0
  }

  copyFrom(other: Gen): void {
    const src = other as Step
    this.arrId = src.arrId
    this.currentIndex = src.currentIndex
    this.lastTrig = src.lastTrig
  }

  process(out$: usize, length: i32): void {
    // This gen maintains state but doesn't produce audio directly
    // The builtin handles the array access and output
    if (this.trig$ === 0) {
      // No trigger provided, advance on each call for testing
      this.currentIndex++
      return
    }

    let trig$ = this.trig$
    for (let i = 0; i < length; i++) {
      const trig = load<f32>(trig$)
      if (trig > 0.0 && this.lastTrig <= 0.0) {
        // Trigger rising edge - advance index
        this.currentIndex++
      }
      this.lastTrig = trig
      trig$ += 4
    }
  }
}
