// dprint-ignore-file
import { Ad } from '../../gen/ad'
import { Program } from '../../program'
import { Op } from '../../shared'
import { VmTag } from '../types'
import { VmSym } from '../vm-sym'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'
import { writeEnvelopeHistory } from './adsr'

// @ts-ignore
@inline
export function callAd(
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
  let adIndex: i32 = 0

  // attack (required, no default)
  let attackTag: VmTag = VmTag.Num
  let attackNum: f64 = 0.0
  let attackAux: i32 = 0

  // decay (required, no default)
  let decayTag: VmTag = VmTag.Num
  let decayNum: f64 = 0.0
  let decayAux: i32 = 0

  // trig (optional, default 0)
  let trigTag: VmTag = VmTag.Num
  let trigNum: f64 = 0.0
  let trigAux: i32 = 0

  if (posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null) {
    attackTag = posTags[0] as VmTag
    attackNum = posNums[0]
    attackAux = posAux[0]
  }

  if (posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null) {
    decayTag = posTags[1] as VmTag
    decayNum = posNums[1]
    decayAux = posAux[1]
  }

  if (posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null) {
    trigTag = posTags[2] as VmTag
    trigNum = posNums[2]
    trigAux = posAux[2]
  }

  // Check for named parameters
  for (let i = 0; i < namedCount; i++) {
    if (nameSyms[i] === VmSym.Index) {
      adIndex = i32(Math.floor(nameNums[i]))
      if (adIndex < 0) adIndex = 0
      else if (adIndex > 63) adIndex = 63
    }
    else if (nameSyms[i] === VmSym.Attack) {
      attackTag = nameTags[i] as VmTag
      attackNum = nameNums[i]
      attackAux = nameAux[i]
    }
    else if (nameSyms[i] === VmSym.Decay) {
      decayTag = nameTags[i] as VmTag
      decayNum = nameNums[i]
      decayAux = nameAux[i]
    }
    else if (nameSyms[i] === VmSym.Trig) {
      trigTag = nameTags[i] as VmTag
      trigNum = nameNums[i]
      trigAux = nameAux[i]
    }
  }

  const attack$ = audio.toAudioPtr(attackTag, attackNum, attackAux, length, program)
  const decay$ = audio.toAudioPtr(decayTag, decayNum, decayAux, length, program)
  const trig$ = audio.toAudioPtr(trigTag, trigNum, trigAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const ad = program.gensPool.get(Op.Ad) as Ad
  ad.attack$ = attack$
  ad.decay$ = decay$
  ad.trig$ = trig$
  ad.process(out$, length)

  writeEnvelopeHistory(program, adIndex, 0, attack$, decay$, 0, 0, length)
  stack.push(VmTag.Audio, 0.0, outIndex)
}
