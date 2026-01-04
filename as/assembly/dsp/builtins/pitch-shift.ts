// dprint-ignore-file
import { Program } from '../../program'
import { PitchShift } from '../../gen/pitch-shift'
import { Op } from '../../shared'
import { Dsp } from '../dsp'
import { VmSym } from '../vm-sym'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
@inline
export function callPitchShift(
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
  left$: usize,
  right$: usize,
  dsp: Dsp,
  cbArgTags: StaticArray<i32>,
  cbArgNums: StaticArray<f64>,
  cbArgAux: StaticArray<i32>,
): void {
  // pitchShift(in, ratio)
  if (posCount < 2) {
    stack.push(VmTag.Undef)
    return
  }

  let inTag: VmTag = VmTag.Num
  let inNum: f64 = 0.0
  let inAux: i32 = 0

  let ratioTag: VmTag = VmTag.Undef
  let ratioNum: f64 = 1.0
  let ratioAux: i32 = 0

  if (posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null) {
    inTag = posTags[0] as VmTag
    inNum = posNums[0]
    inAux = posAux[0]
  }

  if (posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null) {
    ratioTag = posTags[1] as VmTag
    ratioNum = posNums[1]
    ratioAux = posAux[1]
  }

  for (let i: i32 = 0; i < namedCount; i++) {
    const k: i32 = nameSyms[i]
    if (k === VmSym.In) {
      inTag = nameTags[i] as VmTag
      inNum = nameNums[i]
      inAux = nameAux[i]
    }
    else if (k === VmSym.Ratio) {
      ratioTag = nameTags[i] as VmTag
      ratioNum = nameNums[i]
      ratioAux = nameAux[i]
    }
  }

  if (ratioTag === VmTag.Undef || ratioTag === VmTag.Null) {
    stack.push(VmTag.Undef)
    return
  }

  const in$ = audio.toAudioPtr(inTag, inNum, inAux, length, program)
  const ratio$ = audio.toAudioPtr(ratioTag, ratioNum, ratioAux, length, program)

  const pitchShift = program.gensPool.get(Op.PitchShift) as PitchShift
  pitchShift.in$ = in$
  pitchShift.ratio$ = ratio$

  const outIndex: i32 = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)
  pitchShift.process(out$, length)
  stack.push(VmTag.Audio, 0.0, outIndex)
}
