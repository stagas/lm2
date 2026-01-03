// dprint-ignore-file
import { Slew } from '../../gen/slew'
import { Program } from '../../program'
import { Op } from '../../shared'
import { VmSym } from '../vm-sym'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'
import { writeEnvelopeHistory } from './adsr'

// @ts-ignore
@inline
export function callSlew(
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
  let slewIndex: i32 = 0
  // Positional fallback: (in, up, down, exp)
  let inTag: VmTag = VmTag.Num
  let inNum: f64 = 0.0
  let inAux: i32 = 0

  let upTag: VmTag = VmTag.Num
  let upNum: f64 = 0.0
  let upAux: i32 = 0

  let downTag: VmTag = VmTag.Num
  let downNum: f64 = 0.0
  let downAux: i32 = 0

  let expTag: VmTag = VmTag.Num
  let expNum: f64 = 1.0
  let expAux: i32 = 0

  if (posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null) {
    inTag = posTags[0] as VmTag
    inNum = posNums[0]
    inAux = posAux[0]
  }

  if (posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null) {
    upTag = posTags[1] as VmTag
    upNum = posNums[1]
    upAux = posAux[1]
  }

  if (posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null) {
    downTag = posTags[2] as VmTag
    downNum = posNums[2]
    downAux = posAux[2]
  }

  if (posCount >= 4 && posTags[3] !== VmTag.Undef && posTags[3] !== VmTag.Null) {
    expTag = posTags[3] as VmTag
    expNum = posNums[3]
    expAux = posAux[3]
  }

  // Named overrides (in/up/down/exp)
  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Index) {
      slewIndex = i32(Math.floor(nameNums[i]))
    }
    else if (k === VmSym.In) {
      inTag = nameTags[i] as VmTag
      inNum = nameNums[i]
      inAux = nameAux[i]
    }
    else if (k === VmSym.Up) {
      upTag = nameTags[i] as VmTag
      upNum = nameNums[i]
      upAux = nameAux[i]
    }
    else if (k === VmSym.Down) {
      downTag = nameTags[i] as VmTag
      downNum = nameNums[i]
      downAux = nameAux[i]
    }
    else if (k === VmSym.Exponent) {
      expTag = nameTags[i] as VmTag
      expNum = nameNums[i]
      expAux = nameAux[i]
    }
  }

  const in$ = audio.toAudioPtr(inTag, inNum, inAux, length, program)
  const up$ = audio.toAudioPtr(upTag, upNum, upAux, length, program)
  const down$ = audio.toAudioPtr(downTag, downNum, downAux, length, program)
  const exp$ = audio.toAudioPtr(expTag, expNum, expAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const slew = program.gensPool.get(Op.Slew) as Slew
  slew.in$ = in$
  slew.up$ = up$
  slew.down$ = down$
  slew.exp$ = exp$
  slew.process(out$, length)

  writeEnvelopeHistory(program, slewIndex, 2, up$, down$, 0, 0, exp$, slew.visPhase, slew.visPhase01, out$, length)
  stack.push(VmTag.Audio, 0.0, outIndex)
}
