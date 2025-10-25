export class Dsp {
  L: f32 = 0
  R: f32 = 0

  process(): void {
    const sample = Mathf.random() * 2.0 - 1.0
    this.L = sample
    this.R = sample
  }
}
