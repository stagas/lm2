// dprint-ignore-file
import { Sah } from '../../gen/sah'
import { Program } from '../../program'
import { Op } from '../../shared'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
@inline
export function callSah(
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
  // sah(in, trig)
  if (posCount < 2) {
    stack.push(VmTag.Num, 0.0)
    return
  }

  // Get input signal
  const inTag = posTags[0] as VmTag
  const inNum = posNums[0]
  const inAux = posAux[0]
  const in$ = audio.toAudioPtr(inTag, inNum, inAux, length, program)

  // Get trigger signal
  const trigTag = posTags[1] as VmTag
  const trigNum = posNums[1]
  const trigAux = posAux[1]
  const trig$ = audio.toAudioPtr(trigTag, trigNum, trigAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const sah = program.gensPool.get(Op.Sah) as Sah
  sah.in$ = in$
  sah.trig$ = trig$
  sah.process(out$, length)

  stack.push(VmTag.Audio, 0.0, outIndex)
}
