export abstract class Gen {
  abstract process(out$: usize, length: i32): void
  abstract reset(): void
  abstract copyFrom(other: Gen): void
}
