export abstract class Gen {
  abstract process(out$: usize, length: i32): void
  reset(): void {}
  copyFrom(other: Gen): void {}
}
