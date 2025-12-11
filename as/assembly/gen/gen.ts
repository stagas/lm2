export abstract class Gen {
  abstract process(out$: usize, length: i32): void
  abstract copyFrom(other: Gen): void
}
