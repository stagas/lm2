// dprint-ignore-file
import { Envfollow } from '../../gen/envfollow'
import { Program } from '../../program'
import { Op } from '../../shared'
import { VmTag } from '../types'
import { VmSym } from '../vm-sym'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'
import { writeEnvelopeHistory } from './adsr'

// @ts-ignore
@inline
export function callEnvfollow(
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
  // envfollow(in, attack=0.01, release=0.1)
  let envfollowIndex: i32 = 0

  // in (required)
  let inTag: VmTag = VmTag.Num
  let inNum: f64 = 0.0
  let inAux: i32 = 0

  // attack (optional, default 0.01)
  let attackTag: VmTag = VmTag.Num
  let attackNum: f64 = 0.01
  let attackAux: i32 = 0

  // release (optional, default 0.1)
  let releaseTag: VmTag = VmTag.Num
  let releaseNum: f64 = 0.1
  let releaseAux: i32 = 0

  if (posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null) {
    inTag = posTags[0] as VmTag
    inNum = posNums[0]
    inAux = posAux[0]
  }

  if (posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null) {
    attackTag = posTags[1] as VmTag
    attackNum = posNums[1]
    attackAux = posAux[1]
  }

  if (posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null) {
    releaseTag = posTags[2] as VmTag
    releaseNum = posNums[2]
    releaseAux = posAux[2]
  }

  // Check for named parameters
  for (let i = 0; i < namedCount; i++) {
    if (nameSyms[i] === VmSym.Index) {
      envfollowIndex = i32(Math.floor(nameNums[i]))
    }
    else if (nameSyms[i] === VmSym.In) {
      inTag = nameTags[i] as VmTag
      inNum = nameNums[i]
      inAux = nameAux[i]
    }
    else if (nameSyms[i] === VmSym.Attack) {
      attackTag = nameTags[i] as VmTag
      attackNum = nameNums[i]
      attackAux = nameAux[i]
    }
    else if (nameSyms[i] === VmSym.Release) {
      releaseTag = nameTags[i] as VmTag
      releaseNum = nameNums[i]
      releaseAux = nameAux[i]
    }
  }

  const in$ = audio.toAudioPtr(inTag, inNum, inAux, length, program)
  const attack$ = audio.toAudioPtr(attackTag, attackNum, attackAux, length, program)
  const release$ = audio.toAudioPtr(releaseTag, releaseNum, releaseAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const envfollow = program.gensPool.get(Op.Envfollow) as Envfollow
  envfollow.in$ = in$
  envfollow.attack$ = attack$
  envfollow.release$ = release$
  envfollow.process(out$, length)

  writeEnvelopeHistory(program, envfollowIndex, 3, attack$, release$, 0, 0, 0, envfollow.visPhase, envfollow.visPhase01,
    out$, length)
  stack.push(VmTag.Audio, 0.0, outIndex)
}
