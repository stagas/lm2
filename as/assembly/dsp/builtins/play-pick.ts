// dprint-ignore-file
import { Program } from '../../program'
import { playMini } from './play-mini'
import { Dsp } from '../dsp'
import { VmTag } from '../types'
import { VmSym } from '../vm-sym'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
@inline
export function callPlayPick(
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
  if (posCount < 3) {
    stack.push(VmTag.Undef)
    return
  }

  const seqsTag = posTags[0] as VmTag
  const seqsId = posAux[0]
  const idxTag = posTags[1] as VmTag
  const idxNum = posNums[1]
  const idxAux = posAux[1]
  const cbTag = posTags[2] as VmTag
  const cbAux = posAux[2]
  let voicesTag = VmTag.Undef
  let voicesNum: f64 = 0.0
  let voicesAux: i32 = 0

  // Check for positional voices parameter (4th positional arg)
  if (posCount >= 4) {
    voicesTag = posTags[3] as VmTag
    voicesNum = posNums[3]
    voicesAux = posAux[3]
  }

  // Check for named parameters
  for (let i = 0; i < namedCount; i++) {
    if (nameSyms[i] === VmSym.Voices) {
      voicesTag = nameTags[i] as VmTag
      voicesNum = nameNums[i]
      voicesAux = nameAux[i]
    }
  }

  if (seqsTag !== VmTag.Arr || cbTag !== VmTag.Func) {
    stack.push(VmTag.Undef)
    return
  }

  if (seqsId < 0 || seqsId >= dsp.arrays.count) {
    stack.push(VmTag.Undef)
    return
  }
  if ((dsp.arrays.elemType[seqsId] as VmTag) !== VmTag.Num) {
    stack.push(VmTag.Undef)
    return
  }

  const seqStart = dsp.arrays.start[seqsId]
  const seqLen = dsp.arrays.len[seqsId]
  if (seqLen <= 0) {
    stack.push(VmTag.Undef)
    return
  }

  // Segment-rate selection: use sample-0 of `idx` to pick the sequence for this VM segment.
  let pick: i32 = i32(idxNum)
  if (idxTag === VmTag.Audio) {
    const idx$ = audio.toAudioPtr(idxTag, idxNum, idxAux, length, program)
    pick = i32(load<f32>(idx$))
  }

  let i = pick % seqLen
  if (i < 0) i += seqLen
  const seqIndex = i32(dsp.arrays.elemNum[seqStart + i])

  audio.tHas = 0
  playMini(seqIndex, cbAux, voicesTag, voicesNum, voicesAux, stack, audio, program, length, left$, right$, dsp, miniTrigOuts, miniVelOuts, miniValOuts,
    cbArgTags, cbArgNums, cbArgAux)
}


