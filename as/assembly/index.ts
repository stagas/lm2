import { Dsp } from './dsp'

export function createFloat32Buffer(size: i32): usize {
  return changetype<usize>(new StaticArray<f32>(size))
}

export function createDsp(): usize {
  return changetype<usize>(new Dsp())
}

export function processAudio(
  dspPtr: usize,
  leftPtr: usize,
  rightPtr: usize,
  begin: i32,
  end: i32,
): void {
  const dsp = changetype<Dsp>(dspPtr)
  const length = end - begin
  leftPtr += begin * 4
  rightPtr += begin * 4
  for (let i = 0; i < length; i++) {
    dsp.process()
    store<f32>(leftPtr, dsp.L)
    store<f32>(rightPtr, dsp.R)
    leftPtr += 4
    rightPtr += 4
  }
}
