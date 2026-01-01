export abstract class Gen {
  process(out$: usize, length: i32): void {}
  processStereo(outL$: usize, outR$: usize, length: i32): void {}
  reset(): void {}
  copyFrom(other: Gen): void {}
}
