// Shared symbol ids between the TS bytecode encoder and the AssemblyScript VM runtime.
// Keep this file TS+AS compatible (no TS-only types).

export enum VmSym {
  // Builtins
  Out = 1,
  Sine = 2,
  Ad = 3,
  Adsr = 4,
  Mini = 5,
  Analyser = 6,
  T = 7,
  Play = 8,
  Timeline = 9,
  Sampler = 10,
  Slicer = 11,
  Every = 12,
  At = 13,

  // Named args (adsr)
  Attack = 100,
  Decay = 101,
  Sustain = 102,
  Release = 103,
  Trig = 104,

  // Named args (shared)
  Prob = 106,
  Swing = 107,
  Offset = 108,
  SkipFirst = 109,
  Seed = 110,

  // Named args (at/every)
  Bar = 111,

  // Legacy named args (older bytecode)
  AtEveryLegacy = 112,
}


