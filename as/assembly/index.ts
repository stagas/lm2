export function div(a: i32, b: i32): i32 {
  console.log(`div(${a}, ${b})`)
  return a / b
}

export function createFloat32Buffer(size: i32): usize {
  const buffer = new StaticArray<f32>(size)
  return changetype<usize>(buffer)
}

export function dsp(): f32 {
  return Mathf.random() * 2.0 - 1.0
}

export function processAudio(leftPtr: usize, rightPtr: usize, begin: i32, end: i32): void {
  const length = end - begin
  leftPtr += begin * 4
  rightPtr += begin * 4
  for (let i = 0; i < length; i++) {
    store<f32>(leftPtr, dsp())
    store<f32>(rightPtr, dsp())
    leftPtr += 4
    rightPtr += 4
  }
}
