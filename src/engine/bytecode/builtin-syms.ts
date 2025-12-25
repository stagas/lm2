import { VmSym } from '../../../as/assembly/dsp/vm-sym.ts'

export const builtinSyms: Record<string, number> = {
  out: VmSym.Out,
  solo: VmSym.Solo,
  post: VmSym.Post,
  sine: VmSym.Sine,
  tri: VmSym.Tri,
  saw: VmSym.Saw,
  ramp: VmSym.Ramp,
  sqr: VmSym.Sqr,
  pwm: VmSym.Pwm,
  phasor: VmSym.Phasor,
  ad: VmSym.Ad,
  adsr: VmSym.Adsr,
  mini: VmSym.Mini,
  analyser: VmSym.Analyser,
  t: VmSym.T,
  co: VmSym.Co,
  play: VmSym.Play,
  playPick: VmSym.PlayPick,
  timeline: VmSym.Timeline,
  sampler: VmSym.Sampler,
  slicer: VmSym.Slicer,
  every: VmSym.Every,
  at: VmSym.At,
  note: VmSym.Note,
  degree: VmSym.Degree,
  map: VmSym.Map,
  sum: VmSym.Sum,
  slew: VmSym.Slew,
  lp: VmSym.Lp,
  // Runtime directive globals (stable ids so VM can provide defaults)
  tune: VmSym.Tune,
  octave: VmSym.Octave,
  transpose: VmSym.Transpose,
  scale: VmSym.Scale,
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
  // Named args for pwm()
  width: VmSym.Width,
  seed: VmSym.Seed,
  // Named args for at()
  bar: VmSym.Bar,
  // NOTE: `every` key for at() reuses the builtin `every` symbol id (12).
}
