// dprint-ignore-file
import { Program } from '../../program'
import { clearAudio, addAudio, mulAudioScalar } from '../audio-ops'
import { Dsp } from '../dsp'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
@inline
export function callAvg(
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
  if (posCount < 1) {
    stack.push(VmTag.Num, 0.0)
    return
  }

  const arrTag = posTags[0] as VmTag
  const arrId = posAux[0]

  if (arrTag !== VmTag.Arr) {
    stack.push(VmTag.Num, 0.0)
    return
  }
  if (arrId < 0 || arrId >= dsp.arrays.count) {
    stack.push(VmTag.Num, 0.0)
    return
  }

  const n = dsp.arrays.len[arrId]
  if (n <= 0) {
    stack.push(VmTag.Num, 0.0)
    return
  }

  const elemType = dsp.arrays.elemType[arrId] as VmTag
  if (elemType === VmTag.Num) {
    const start = dsp.arrays.start[arrId]
    let sum: f64 = 0.0
    for (let i: i32 = 0; i < n; i++) {
      sum += dsp.arrays.elemNum[start + i]
    }
    stack.push(VmTag.Num, sum / (n as f64))
    return
  }

  if (elemType === VmTag.Audio) {
    const start = dsp.arrays.start[arrId]
    const outIndex = audio.allocOut(program)
    const out$ = program.getOutBuffer(outIndex)
    clearAudio(out$, length)

    for (let i: i32 = 0; i < n; i++) {
      const srcIndex = dsp.arrays.elemAux[start + i]
      if (srcIndex < 0) continue
      const src$ = program.getOutBuffer(srcIndex)
      addAudio(out$, out$, src$, length)
    }

    const inv: f32 = (1.0 as f32) / f32(n)
    mulAudioScalar(out$, out$, inv, length)

    stack.push(VmTag.Audio, 0.0, outIndex)
    return
  }

  stack.push(VmTag.Num, 0.0)
}


