import { VmSym } from '../../../as/assembly/syms.ts'

export const builtinSyms: Record<string, number> = {
  out: VmSym.Out,
  sine: VmSym.Sine,
  ad: VmSym.Ad,
  adsr: VmSym.Adsr,
  mini: VmSym.Mini,
  analyser: VmSym.Analyser,
  t: VmSym.T,
  play: VmSym.Play,
  playPick: VmSym.PlayPick,
  timeline: VmSym.Timeline,
  sampler: VmSym.Sampler,
  slicer: VmSym.Slicer,
  every: VmSym.Every,
  at: VmSym.At,
  // Named args for adsr()
  attack: VmSym.Attack,
  decay: VmSym.Decay,
  sustain: VmSym.Sustain,
  release: VmSym.Release,
  trig: VmSym.Trig,
  // Named args for every()
  // NOTE: `bar` symbol id is shared with `at()`'s `bar` named arg.
  prob: VmSym.Prob,
  swing: VmSym.Swing,
  offset: VmSym.Offset,
  seed: VmSym.Seed,
  // Named args for at()
  bar: VmSym.Bar,
  // NOTE: `every` key for at() reuses the builtin `every` symbol id (12).
}
