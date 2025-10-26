import { Dsp } from './dsp'

export function createFloat32Buffer(size: i32): usize {
  return changetype<usize>(new StaticArray<f32>(size))
}

export function createDsp(): usize {
  return changetype<usize>(new Dsp())
}

export function processAudio(dsp$: usize, left$: usize, right$: usize, begin: i32, end: i32): void {
  const dsp = changetype<Dsp>(dsp$)
  const length = end - begin
  left$ += begin * 4
  right$ += begin * 4
  for (let i = 0; i < length; i++) {
    dsp.process()
    store<f32>(left$, dsp.L)
    store<f32>(right$, dsp.R)
    left$ += 4
    right$ += 4
  }
}
