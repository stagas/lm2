// dprint-ignore-file
import { ARRAY_HEADER_SIZE } from '../../constants'
import { globalSampleCount } from '../../globals'
import { Program } from '../../program'
import { Op } from '../../shared'
import { VmSym } from '../vm-sym'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'
import { Tram } from '../../gen/tram'

// @ts-ignore
@inline
export function callTram(
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
  // tram(sequence, bar?=1)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  const seqTag = posTags[0] as VmTag
  const seqNum = posNums[0]
  const seqAux = posAux[0]

  let barTag: VmTag = VmTag.Num
  let barNum: f64 = 1.0
  let barAux: i32 = 0

  // Check for positional bar parameter
  if (posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null) {
    barTag = posTags[1] as VmTag
    barNum = posNums[1]
    barAux = posAux[1]
  }

  // Check for named bar parameter
  for (let i = 0; i < namedCount; i++) {
    if (nameSyms[i] === VmSym.Bar) {
      barTag = nameTags[i] as VmTag
      barNum = nameNums[i]
      barAux = nameAux[i]
      break
    }
  }

  // For now, assume seqNum is a sequence index
  // In a full implementation, we'd parse the sequence string here
  if (seqTag !== VmTag.Num) {
    stack.push(VmTag.Num, 0.0)
    return
  }

  const sequenceIndex = i32(seqNum)
  if (sequenceIndex < 0) {
    stack.push(VmTag.Num, 0.0)
    return
  }

  const bar$ = audio.toAudioPtr(barTag, barNum, barAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const tram = program.gensPool.get(Op.Tram) as Tram
  // Get pointer to the array data (arrays[i] is already a usize pointer)
  // The bytecode starts at ARRAY_HEADER_SIZE floats offset
  const arrayPtr = program.data.arrays[sequenceIndex]
  tram.bytecode$ = arrayPtr + (ARRAY_HEADER_SIZE << 2) // ARRAY_HEADER_SIZE * 4 bytes
  tram.bar$ = bar$
  tram.process(out$, length)

  stack.push(VmTag.Audio, 0.0, outIndex)
}
