// dprint-ignore-file
import { Ad } from '../../gen/ad'
import { Program } from '../../program'
import { Op } from '../../shared'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
@inline
export function callAd(
  posCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  const attackTag = posCount >= 1 ? (posTags[0] as VmTag) : VmTag.Num
  const attackNum = posCount >= 1 ? posNums[0] : 0.0
  const attackAux = posCount >= 1 ? posAux[0] : 0
  const decayTag = posCount >= 2 ? (posTags[1] as VmTag) : VmTag.Num
  const decayNum = posCount >= 2 ? posNums[1] : 0.0
  const decayAux = posCount >= 2 ? posAux[1] : 0
  const trigTag = posCount >= 3 ? (posTags[2] as VmTag) : VmTag.Num
  const trigNum = posCount >= 3 ? posNums[2] : 0.0
  const trigAux = posCount >= 3 ? posAux[2] : 0

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

  stack.push(VmTag.Audio, 0.0, outIndex)
}

