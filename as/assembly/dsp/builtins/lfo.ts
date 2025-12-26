// dprint-ignore-file
import { LfoRamp, LfoSah, LfoSaw, LfoSine, LfoSqr, LfoTri } from '../../gen/lfo'
import { Program } from '../../program'
import { Op } from '../../shared'
import { VmSym } from '../vm-sym'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore

function getBar(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
): StaticArray<f64> {
  // (bar)
  const barIsSet = posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null
  let barTag: VmTag = barIsSet ? (posTags[0] as VmTag) : VmTag.Num
  let barNum: f64 = barIsSet ? posNums[0] : 1.0
  let barAux: i32 = barIsSet ? posAux[0] : 0

  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Bar) {
      barTag = nameTags[i] as VmTag
      barNum = nameNums[i]
      barAux = nameAux[i]
    }
  }

  const out: StaticArray<f64> = new StaticArray<f64>(3)
  out[0] = barTag as f64
  out[1] = barNum
  out[2] = barAux as f64
  return out
}

export function callLfoSine(
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
  // lfosine(bar)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  const bar = getBar(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux)
  const bar$ = audio.toAudioPtr(bar[0] as VmTag, bar[1], bar[2] as i32, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const gen = program.gensPool.get(Op.LfoSine) as LfoSine
  gen.bar$ = bar$
  gen.process(out$, length)

  stack.push(VmTag.Audio, 0.0, outIndex)
}

export function callLfoTri(
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
  // lfotri(bar)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  const bar = getBar(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux)
  const bar$ = audio.toAudioPtr(bar[0] as VmTag, bar[1], bar[2] as i32, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const gen = program.gensPool.get(Op.LfoTri) as LfoTri
  gen.bar$ = bar$
  gen.process(out$, length)

  stack.push(VmTag.Audio, 0.0, outIndex)
}

export function callLfoSaw(
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
  // lfosaw(bar)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  const bar = getBar(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux)
  const bar$ = audio.toAudioPtr(bar[0] as VmTag, bar[1], bar[2] as i32, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const gen = program.gensPool.get(Op.LfoSaw) as LfoSaw
  gen.bar$ = bar$
  gen.process(out$, length)

  stack.push(VmTag.Audio, 0.0, outIndex)
}

export function callLfoRamp(
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
  // lforamp(bar)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  const bar = getBar(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux)
  const bar$ = audio.toAudioPtr(bar[0] as VmTag, bar[1], bar[2] as i32, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const gen = program.gensPool.get(Op.LfoRamp) as LfoRamp
  gen.bar$ = bar$
  gen.process(out$, length)

  stack.push(VmTag.Audio, 0.0, outIndex)
}

export function callLfoSqr(
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
  // lfosqr(bar)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  const bar = getBar(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux)
  const bar$ = audio.toAudioPtr(bar[0] as VmTag, bar[1], bar[2] as i32, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const gen = program.gensPool.get(Op.LfoSqr) as LfoSqr
  gen.bar$ = bar$
  gen.process(out$, length)

  stack.push(VmTag.Audio, 0.0, outIndex)
}

export function callLfoSah(
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
  // lfosah(bar, seed=1234)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  const bar = getBar(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux)
  const bar$ = audio.toAudioPtr(bar[0] as VmTag, bar[1], bar[2] as i32, length, program)

  const seedIsSet = posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null
  let seedTag: VmTag = seedIsSet ? (posTags[1] as VmTag) : VmTag.Num
  let seedNum: f64 = seedIsSet ? posNums[1] : 1234.0
  let seedAux: i32 = seedIsSet ? posAux[1] : 0

  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Seed) {
      seedTag = nameTags[i] as VmTag
      seedNum = nameNums[i]
      seedAux = nameAux[i]
    }
  }

  const seed$ = audio.toAudioPtr(seedTag, seedNum, seedAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const gen = program.gensPool.get(Op.LfoSah) as LfoSah
  gen.bar$ = bar$
  gen.seed$ = seed$
  gen.process(out$, length)

  stack.push(VmTag.Audio, 0.0, outIndex)
}


