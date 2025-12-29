// dprint-ignore-file
import { Program } from '../../program'
import { globalSampleCount } from '../../globals'
import { Dsp } from '../dsp'
import { VmSym } from '../vm-sym'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'
import { applyCurve } from '../../util'

// @ts-ignore

function wrapIndex(i: i32, len: i32): i32 {
  let j: i32 = i % len
  if (j < 0) j += len
  return j
}

export function callGlide(
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
  dsp: Dsp,
): void {
  // glide(array, bar, exp=1)
  if (posCount < 2) {
    stack.push(VmTag.Undef)
    return
  }

  const arrTag = posTags[0] as VmTag
  const arrId = posAux[0]
  if (arrTag !== VmTag.Arr || arrId < 0 || arrId >= dsp.arrays.count) {
    stack.push(VmTag.Undef)
    return
  }

  const n: i32 = dsp.arrays.len[arrId]
  if (n <= 0) {
    stack.push(VmTag.Undef)
    return
  }

  if ((dsp.arrays.elemType[arrId] as VmTag) !== VmTag.Num) {
    stack.push(VmTag.Undef)
    return
  }

  let barTag: VmTag = posTags[1] as VmTag
  let barNum: f64 = posNums[1]
  let barAux: i32 = posAux[1]

  const expIsSet = posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null
  let expTag: VmTag = expIsSet ? (posTags[2] as VmTag) : VmTag.Num
  let expNum: f64 = expIsSet ? posNums[2] : 1.0
  let expAux: i32 = expIsSet ? posAux[2] : 0

  for (let i: i32 = 0; i < namedCount; i++) {
    const k: i32 = nameSyms[i]
    if (k === VmSym.Bar) {
      barTag = nameTags[i] as VmTag
      barNum = nameNums[i]
      barAux = nameAux[i]
    }
    else if (k === VmSym.Exponent) {
      expTag = nameTags[i] as VmTag
      expNum = nameNums[i]
      expAux = nameAux[i]
    }
  }

  if (length <= 0) {
    stack.push(VmTag.Undef)
    return
  }

  const bar$ = audio.toAudioPtr(barTag, barNum, barAux, length, program)
  const exp$ = audio.toAudioPtr(expTag, expNum, expAux, length, program)

  const outIndex: i32 = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const start: i32 = dsp.arrays.start[arrId]

  const safeBpm: f64 = Math.max(1.0, bpm as f64)
  const rate: f64 = sampleRate as f64
  const samplesPerWholeNote: f64 = (60.0 / safeBpm) * rate * 4.0
  const minBar: f64 = 1.0 / samplesPerWholeNote
  const beatsPerSample: f64 = (safeBpm / 60.0) / rate
  let beatAbs: f64 = (globalSampleCount as f64) * beatsPerSample

  const bar0: f64 = Math.max(minBar, load<f32>(bar$) as f64)
  const stepBeats0: f64 = bar0 * 4.0
  const cycle0: i32 = stepBeats0 > 0.0 ? i32(Math.floor(beatAbs / stepBeats0)) : 0
  dsp.arrays.recordAccess(program, dsp.arrays.createPc[arrId], wrapIndex(cycle0, n))

  let o$ = out$
  let b$ = bar$
  let e$ = exp$
  let p: f64 = 0.0

  for (let s: i32 = 0; s < length; s++) {
    const barV: f64 = Math.max(minBar, load<f32>(b$) as f64)
    const stepBeats: f64 = barV * 4.0
    const c: i32 = stepBeats > 0.0 ? i32(Math.floor(beatAbs / stepBeats)) : 0
    const i0: i32 = wrapIndex(c, n)
    const i1: i32 = wrapIndex(i0 + 1, n)
    const localBeat: f64 = beatAbs - (c as f64) * stepBeats
    const t: f64 = stepBeats > 0.0 ? localBeat / stepBeats : 0.0
    const curve: f64 = load<f32>(e$) as f64
    p = applyCurve(t, curve)

    const a: f64 = dsp.arrays.elemNum[start + i0]
    const bb: f64 = dsp.arrays.elemNum[start + i1]
    store<f32>(o$, (a + (bb - a) * p) as f32)

    o$ += 4
    b$ += 4
    e$ += 4
    beatAbs += beatsPerSample
  }

  stack.push(VmTag.Audio, 0.0, outIndex)
}


