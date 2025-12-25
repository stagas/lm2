// dprint-ignore-file
import { Program } from '../../program'
import { Dsp } from '../dsp'
import { VmTag } from '../types'
import { VmSym } from '../vm-sym'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'
import { callPlay } from './play'

// @ts-ignore

export function callMini(
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
  miniTrigOuts: StaticArray<i32>,
  miniVelOuts: StaticArray<i32>,
  miniValOuts: StaticArray<i32>,
  cbArgTags: StaticArray<i32>,
  cbArgNums: StaticArray<f64>,
  cbArgAux: StaticArray<i32>,
): void {
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  let seqTag = posTags[0] as VmTag
  let seqNum = posNums[0]
  let seqAux = posAux[0]

  // Check for named 'seq' parameter
  for (let i = 0; i < namedCount; i++) {
    if (nameSyms[i] === VmSym.Seq) {
      seqTag = nameTags[i] as VmTag
      seqNum = nameNums[i]
      seqAux = nameAux[i]
      break
    }
  }

  if (seqTag !== VmTag.Num && seqTag !== VmTag.Audio) {
    stack.push(VmTag.Undef)
    return
  }

  // mini(seq) -> seq
  if (posCount === 1) {
    stack.push(seqTag, seqNum, seqAux)
    return
  }

  let cbTag = posTags[1] as VmTag
  let cbAux = posAux[1]

  // Check for named 'cb' parameter
  for (let i = 0; i < namedCount; i++) {
    if (nameSyms[i] === VmSym.Cb) {
      cbTag = nameTags[i] as VmTag
      cbAux = nameAux[i]
      break
    }
  }

  if (cbTag !== VmTag.Func) {
    stack.push(VmTag.Undef)
    return
  }

  // Delegate to play() implementation so `seq` can be a per-sample buffer (audio-rate selection).
  callPlay(
    2,
    nameSyms,
    nameTags,
    nameNums,
    nameAux,
    namedCount,
    posTags,
    posNums,
    posAux,
    stack,
    audio,
    program,
    length,
    left$,
    right$,
    dsp,
    miniTrigOuts,
    miniVelOuts,
    miniValOuts,
    cbArgTags,
    cbArgNums,
    cbArgAux,
  )
}

