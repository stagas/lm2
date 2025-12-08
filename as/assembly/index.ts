import './globals'

import { ARRAY_HEADER_SIZE, ARRAY_SIZE } from './constants'
import { Dsp } from './dsp'
import { Program } from './program'

export function createFloat32Buffer(size: i32): usize {
  return changetype<usize>(new StaticArray<f32>(size))
}

export function createDsp(): usize {
  console.warn('createDsp')
  return changetype<usize>(new Dsp())
}

export function createProgram(): usize {
  console.warn('createProgram')
  return changetype<usize>(new Program())
}

export function createArray(): usize {
  const array = new StaticArray<f32>(ARRAY_SIZE + ARRAY_HEADER_SIZE)
  array[1] = -1
  return changetype<usize>(array)
}

export function processAudio(dsp$: usize, left$: usize, right$: usize, begin: i32, length: i32): void {
  const dsp = changetype<Dsp>(dsp$)
  dsp.process(left$, right$, begin, length)
}
