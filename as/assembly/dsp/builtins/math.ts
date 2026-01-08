// dprint-ignore-file
import { Program } from '../../program'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'
import { VmSym } from '../vm-sym'

// @ts-ignore
@inline
function numFromTag(tag: VmTag, num: f64): f64 {
  if (tag === VmTag.Bool) return num != 0.0 ? 1.0 : 0.0
  if (tag === VmTag.Num) return num
  return 0.0
}

// @ts-ignore
@inline
function findNamed(
  nameSyms: StaticArray<i32>,
  namedCount: i32,
  sym: i32,
): i32 {
  for (let i: i32 = 0; i < namedCount; i++) {
    if (nameSyms[i] === sym) return i
  }
  return -1
}

// Unary math functions (sin, cos, tan, etc.)
// @ts-ignore
@inline
function callUnaryMath(
  posCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
  fn: (x: f64) => f64,
): void {
  let xTag: VmTag = VmTag.Num
  let xNum: f64 = 0.0
  let xAux: i32 = 0

  if (posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null) {
    xTag = posTags[0] as VmTag
    xNum = posNums[0]
    xAux = posAux[0]
  }

  const audioNeeded = xTag === VmTag.Audio || (xTag === VmTag.Num && xAux < 0)

  if (!audioNeeded) {
    const x = numFromTag(xTag, xNum)
    const result = fn(x)
    stack.push(VmTag.Num, result)
    return
  }

  if (length <= 0) {
    stack.push(VmTag.Undef)
    return
  }

  const x$ = audio.toAudioPtr(xTag, xNum, xAux, length, program)
  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  let p$ = out$
  for (let s: i32 = 0, y: i32 = 0, x: f64, result: f64; s < length; s += 16) {
    unroll(16, () => {
      x = load<f32>(x$ + y) as f64
      result = fn(x)
      store<f32>(p$, result as f32)
      p$ += 4
      y += 4
    })
  }

  stack.push(VmTag.Audio, 0.0, outIndex)
}

// Binary math functions (min, max, hypot, etc.)
// @ts-ignore
@inline
function callBinaryMath(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
  fn: (a: f64, b: f64) => f64,
  xSym: i32,
  ySym: i32,
): void {
  let xTag: VmTag = VmTag.Num
  let xNum: f64 = 0.0
  let xAux: i32 = 0

  let yTag: VmTag = VmTag.Num
  let yNum: f64 = 0.0
  let yAux: i32 = 0

  if (posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null) {
    xTag = posTags[0] as VmTag
    xNum = posNums[0]
    xAux = posAux[0]
  }

  if (posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null) {
    yTag = posTags[1] as VmTag
    yNum = posNums[1]
    yAux = posAux[1]
  }

  const xIdx = findNamed(nameSyms, namedCount, xSym)
  if (xIdx >= 0 && nameTags[xIdx] !== VmTag.Undef && nameTags[xIdx] !== VmTag.Null) {
    xTag = nameTags[xIdx] as VmTag
    xNum = nameNums[xIdx]
    xAux = nameAux[xIdx]
  }

  const yIdx = findNamed(nameSyms, namedCount, ySym)
  if (yIdx >= 0 && nameTags[yIdx] !== VmTag.Undef && nameTags[yIdx] !== VmTag.Null) {
    yTag = nameTags[yIdx] as VmTag
    yNum = nameNums[yIdx]
    yAux = nameAux[yIdx]
  }

  const xAudio = xTag === VmTag.Audio || (xTag === VmTag.Num && xAux < 0)
  const yAudio = yTag === VmTag.Audio || (yTag === VmTag.Num && yAux < 0)
  const audioNeeded = xAudio || yAudio

  if (!audioNeeded) {
    const x = numFromTag(xTag, xNum)
    const y = numFromTag(yTag, yNum)
    const result = fn(x, y)
    stack.push(VmTag.Num, result)
    return
  }

  if (length <= 0) {
    stack.push(VmTag.Undef)
    return
  }

  const x$ = xAudio ? audio.toAudioPtr(xTag, xNum, xAux, length, program) : 0
  const y$ = yAudio ? audio.toAudioPtr(yTag, yNum, yAux, length, program) : 0

  const x0 = xAudio ? 0.0 : numFromTag(xTag, xNum)
  const y0 = yAudio ? 0.0 : numFromTag(yTag, yNum)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  let p$ = out$
  for (let s: i32 = 0, z: i32 = 0, x: f64, y: f64, result: f64; s < length; s += 16) {
    unroll(16, () => {
      x = xAudio ? (load<f32>(x$ + z) as f64) : x0
      y = yAudio ? (load<f32>(y$ + z) as f64) : y0
      result = fn(x, y)
      store<f32>(p$, result as f32)
      p$ += 4
      z += 4
    })
  }

  stack.push(VmTag.Audio, 0.0, outIndex)
}

// Ternary math functions (clamp, lerp, etc.)
// @ts-ignore
@inline
function callTernaryMath(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
  fn: (a: f64, b: f64, c: f64) => f64,
  aSym: i32,
  bSym: i32,
  cSym: i32,
): void {
  let aTag: VmTag = VmTag.Num
  let aNum: f64 = 0.0
  let aAux: i32 = 0

  let bTag: VmTag = VmTag.Num
  let bNum: f64 = 0.0
  let bAux: i32 = 0

  let cTag: VmTag = VmTag.Num
  let cNum: f64 = 0.0
  let cAux: i32 = 0

  if (posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null) {
    aTag = posTags[0] as VmTag
    aNum = posNums[0]
    aAux = posAux[0]
  }

  if (posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null) {
    bTag = posTags[1] as VmTag
    bNum = posNums[1]
    bAux = posAux[1]
  }

  if (posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null) {
    cTag = posTags[2] as VmTag
    cNum = posNums[2]
    cAux = posAux[2]
  }

  const aIdx = findNamed(nameSyms, namedCount, aSym)
  if (aIdx >= 0 && nameTags[aIdx] !== VmTag.Undef && nameTags[aIdx] !== VmTag.Null) {
    aTag = nameTags[aIdx] as VmTag
    aNum = nameNums[aIdx]
    aAux = nameAux[aIdx]
  }

  const bIdx = findNamed(nameSyms, namedCount, bSym)
  if (bIdx >= 0 && nameTags[bIdx] !== VmTag.Undef && nameTags[bIdx] !== VmTag.Null) {
    bTag = nameTags[bIdx] as VmTag
    bNum = nameNums[bIdx]
    bAux = nameAux[bIdx]
  }

  const cIdx = findNamed(nameSyms, namedCount, cSym)
  if (cIdx >= 0 && nameTags[cIdx] !== VmTag.Undef && nameTags[cIdx] !== VmTag.Null) {
    cTag = nameTags[cIdx] as VmTag
    cNum = nameNums[cIdx]
    cAux = nameAux[cIdx]
  }

  const aAudio = aTag === VmTag.Audio || (aTag === VmTag.Num && aAux < 0)
  const bAudio = bTag === VmTag.Audio || (bTag === VmTag.Num && bAux < 0)
  const cAudio = cTag === VmTag.Audio || (cTag === VmTag.Num && cAux < 0)
  const audioNeeded = aAudio || bAudio || cAudio

  if (!audioNeeded) {
    const a = numFromTag(aTag, aNum)
    const b = numFromTag(bTag, bNum)
    const c = numFromTag(cTag, cNum)
    const result = fn(a, b, c)
    stack.push(VmTag.Num, result)
    return
  }

  if (length <= 0) {
    stack.push(VmTag.Undef)
    return
  }

  const a$ = aAudio ? audio.toAudioPtr(aTag, aNum, aAux, length, program) : 0
  const b$ = bAudio ? audio.toAudioPtr(bTag, bNum, bAux, length, program) : 0
  const c$ = cAudio ? audio.toAudioPtr(cTag, cNum, cAux, length, program) : 0

  const a0 = aAudio ? 0.0 : numFromTag(aTag, aNum)
  const b0 = bAudio ? 0.0 : numFromTag(bTag, bNum)
  const c0 = cAudio ? 0.0 : numFromTag(cTag, cNum)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  let p$ = out$
  for (let s: i32 = 0, z: i32 = 0, a: f64, b: f64, c: f64, result: f64; s < length; s += 16) {
    unroll(16, () => {
      a = aAudio ? (load<f32>(a$ + z) as f64) : a0
      b = bAudio ? (load<f32>(b$ + z) as f64) : b0
      c = cAudio ? (load<f32>(c$ + z) as f64) : c0
      result = fn(a, b, c)
      store<f32>(p$, result as f32)
      p$ += 4
      z += 4
    })
  }

  stack.push(VmTag.Audio, 0.0, outIndex)
}

// sin(x)
// @ts-ignore
@inline
export function callSin(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callUnaryMath(posCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64): f64 => Mathf.sin(x as f32) as f64)
}

// cos(x)
// @ts-ignore
@inline
export function callCos(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callUnaryMath(posCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64): f64 => Mathf.cos(x as f32) as f64)
}

// tan(x)
// @ts-ignore
@inline
export function callTan(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callUnaryMath(posCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64): f64 => Mathf.tan(x as f32) as f64)
}

// asin(x)
// @ts-ignore
@inline
export function callAsin(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callUnaryMath(posCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64): f64 => Mathf.asin(x as f32) as f64)
}

// acos(x)
// @ts-ignore
@inline
export function callAcos(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callUnaryMath(posCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64): f64 => Mathf.acos(x as f32) as f64)
}

// tanh(x)
// @ts-ignore
@inline
export function callTanh(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callUnaryMath(posCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64): f64 => Mathf.tanh(x as f32) as f64)
}

// atan(x)
// @ts-ignore
@inline
export function callAtan(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callUnaryMath(posCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64): f64 => Mathf.atan(x as f32) as f64)
}

// abs(x)
// @ts-ignore
@inline
export function callAbs(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callUnaryMath(posCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64): f64 => Mathf.abs(x as f32) as f64)
}

// sqrt(x)
// @ts-ignore
@inline
export function callSqrt(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callUnaryMath(posCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64): f64 => Mathf.sqrt(x as f32) as f64)
}

// square(x)
// @ts-ignore
@inline
export function callSquare(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callUnaryMath(posCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64): f64 => x * x)
}

// cube(x)
// @ts-ignore
@inline
export function callCube(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callUnaryMath(posCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64): f64 => x * x * x)
}

// log(x)
// @ts-ignore
@inline
export function callLog(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callUnaryMath(posCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64): f64 => Mathf.log(x as f32) as f64)
}

// exp(x)
// @ts-ignore
@inline
export function callExp(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callUnaryMath(posCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64): f64 => Mathf.exp(x as f32) as f64)
}

// log10(x)
// @ts-ignore
@inline
export function callLog10(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callUnaryMath(posCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64): f64 => (Mathf.log(x as f32) / Mathf.LN10) as f64)
}

// log2(x)
// @ts-ignore
@inline
export function callLog2(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callUnaryMath(posCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64): f64 => (Mathf.log(x as f32) / Mathf.LN2) as f64)
}

// exp2(x)
// @ts-ignore
@inline
export function callExp2(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callUnaryMath(posCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64): f64 => Mathf.pow(2.0, x as f32) as f64)
}

// floor(x)
// @ts-ignore
@inline
export function callFloor(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callUnaryMath(posCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64): f64 => Mathf.floor(x as f32) as f64)
}

// ceil(x)
// @ts-ignore
@inline
export function callCeil(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callUnaryMath(posCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64): f64 => Mathf.ceil(x as f32) as f64)
}

// round(x)
// @ts-ignore
@inline
export function callRound(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callUnaryMath(posCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64): f64 => Mathf.round(x as f32) as f64)
}

// trunc(x)
// @ts-ignore
@inline
export function callTrunc(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callUnaryMath(posCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64): f64 => Mathf.trunc(x as f32) as f64)
}

// fract(x)
// @ts-ignore
@inline
export function callFract(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callUnaryMath(posCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64): f64 => x - Mathf.floor(x as f32) as f64)
}

// sign(x)
// @ts-ignore
@inline
export function callSign(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callUnaryMath(posCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64): f64 => x < 0.0 ? -1.0 : x > 0.0 ? 1.0 : 0.0)
}

// isnan(x)
// @ts-ignore
@inline
export function callIsnan(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callUnaryMath(posCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64): f64 => isNaN(x) ? 1.0 : 0.0)
}

// isinf(x)
// @ts-ignore
@inline
export function callIsinf(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callUnaryMath(posCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64): f64 => !isFinite(x) && !isNaN(x) ? 1.0 : 0.0)
}

// min(x, y)
// @ts-ignore
@inline
export function callMin(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callBinaryMath(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio, program, length, (a: f64, b: f64): f64 => Mathf.min(a as f32, b as f32) as f64, VmSym.X, VmSym.Y)
}

// max(x, y)
// @ts-ignore
@inline
export function callMax(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callBinaryMath(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio, program, length, (a: f64, b: f64): f64 => Mathf.max(a as f32, b as f32) as f64, VmSym.X, VmSym.Y)
}

// hypot(x, y)
// @ts-ignore
@inline
export function callHypot(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callBinaryMath(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio, program, length, (a: f64, b: f64): f64 => Mathf.sqrt((a * a + b * b) as f32) as f64, VmSym.X, VmSym.Y)
}

// mod(x, y) - x - y * floor(x / y)
// @ts-ignore
@inline
export function callMod(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callBinaryMath(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64, y: f64): f64 => x - y * Mathf.floor((x / y) as f32) as f64, VmSym.X, VmSym.Y)
}

// wrap(x, lo, hi)
// @ts-ignore
@inline
export function callWrap(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callTernaryMath(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64, lo: f64, hi: f64): f64 => {
    const range = hi - lo
    if (range <= 0.0) return lo
    const offset = x - lo
    return lo + (offset - Mathf.floor((offset / range) as f32) as f64 * range)
  }, VmSym.X, VmSym.Lo, VmSym.Hi)
}

// pingpong(x, lo, hi)
// @ts-ignore
@inline
export function callPingpong(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callTernaryMath(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64, lo: f64, hi: f64): f64 => {
    const range = hi - lo
    if (range <= 0.0) return lo
    const normalized = (x - lo) / range
    const cycle = normalized - 2.0 * Mathf.floor((normalized * 0.5) as f32) as f64
    const triangle = cycle > 1.0 ? 2.0 - cycle : cycle
    return lo + triangle * range
  }, VmSym.X, VmSym.Lo, VmSym.Hi)
}

// fold(x, lo, hi)
// @ts-ignore
@inline
export function callFold(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callTernaryMath(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64, lo: f64, hi: f64): f64 => {
    const range = hi - lo
    if (range <= 0.0) return lo
    let val = x
    const range2 = range * 2.0
    if (val < lo) {
      val = lo - val
      val = val - range2 * Mathf.floor((val / range2) as f32) as f64
      if (val > range) val = range2 - val
      val = val + lo
    } else if (val > hi) {
      val = val - hi
      val = val - range2 * Mathf.floor((val / range2) as f32) as f64
      if (val > range) val = range2 - val
      val = hi - val
    }
    return val
  }, VmSym.X, VmSym.Lo, VmSym.Hi)
}

// clamp(x, lo, hi)
// @ts-ignore
@inline
export function callClamp(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callTernaryMath(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64, lo: f64, hi: f64): f64 => {
    if (x < lo) return lo
    if (x > hi) return hi
    return x
  }, VmSym.X, VmSym.Lo, VmSym.Hi)
}

// lerp(a, b, t)
// @ts-ignore
@inline
export function callLerp(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callTernaryMath(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio, program, length, (a: f64, b: f64, t: f64): f64 => a + (b - a) * t, VmSym.A, VmSym.B, VmSym.X)
}

// snap(x, step)
// @ts-ignore
@inline
export function callSnap(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callBinaryMath(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64, step: f64): f64 => Mathf.round((x / step) as f32) as f64 * step, VmSym.X, VmSym.Y)
}

// step(x, edge)
// @ts-ignore
@inline
export function callStep(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32
): void {
  callBinaryMath(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64, edge: f64): f64 => x < edge ? 0.0 : 1.0, VmSym.X, VmSym.Edge)
}

// heaviside(x)
// @ts-ignore
@inline
export function callHeaviside(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callUnaryMath(posCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64): f64 => x < 0.0 ? 0.0 : x > 0.0 ? 1.0 : 0.5)
}

// smoothstep(x, edge0, edge1)
// @ts-ignore
@inline
export function callSmoothstep(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callTernaryMath(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64, edge0: f64, edge1: f64): f64 => {
    const t = Mathf.min(Mathf.max(((x - edge0) / (edge1 - edge0)) as f32, 0.0), 1.0) as f64
    return t * t * (3.0 - 2.0 * t)
  }, VmSym.X, VmSym.Edge0, VmSym.Edge1)
}

// smootherstep(x, edge0, edge1)
// @ts-ignore
@inline
export function callSmootherstep(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callTernaryMath(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64, edge0: f64, edge1: f64): f64 => {
    const t = Mathf.min(Mathf.max(((x - edge0) / (edge1 - edge0)) as f32, 0.0), 1.0) as f64
    return t * t * t * (t * (6.0 * t - 15.0) + 10.0)
  }, VmSym.X, VmSym.Edge0, VmSym.Edge1)
}

// select(a, b, cond)
// @ts-ignore
@inline
export function callSelect(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callTernaryMath(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio, program, length, (a: f64, b: f64, cond: f64): f64 => cond != 0.0 ? b : a, VmSym.A, VmSym.B, VmSym.Cond)
}

// safediv(x, y)
// @ts-ignore
@inline
export function callSafediv(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callBinaryMath(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio, program, length, (x: f64, y: f64): f64 => y == 0.0 ? 0.0 : x / y, VmSym.X, VmSym.Y)
}

// swing(t, amount)
// @ts-ignore
@inline
export function callSwing(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  callBinaryMath(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio, program, length, (t: f64, amount: f64): f64 => {
    // Match Every.process(): clamp to [0, 1] and shift odd cycles earlier by interval*swing*0.5.
    const s: f64 = Mathf.min(Mathf.max(amount as f32, 0.0), 1.0) as f64
    if (s === 0.0) return t

    const interval: f64 = 1.0
    const swingOffset: f64 = interval * s * 0.5

    const cycle: i32 = i32(Math.floor(t / interval))
    if ((cycle & 1) === 1) return t - swingOffset
    return t
  }, VmSym.X, VmSym.Y)
}


