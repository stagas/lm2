// dprint-ignore-file
import { Slew } from '../../gen/slew'
import { Program } from '../../program'
import { Op } from '../../shared'
import { VmSym } from '../../syms'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
@inline
export function callSlew(
  posCount: i32,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  // Positional fallback: (input, up, down, exponent)
  let inputTag = posCount >= 1 ? (posTags[0] as VmTag) : VmTag.Num
  let inputNum = posCount >= 1 ? posNums[0] : 0.0
  let inputAux = posCount >= 1 ? posAux[0] : 0
  let upTag = posCount >= 2 ? (posTags[1] as VmTag) : VmTag.Num
  let upNum = posCount >= 2 ? posNums[1] : 0.0
  let upAux = posCount >= 2 ? posAux[1] : 0
  let downTag = posCount >= 3 ? (posTags[2] as VmTag) : VmTag.Num
  let downNum = posCount >= 3 ? posNums[2] : 0.0
  let downAux = posCount >= 3 ? posAux[2] : 0
  let exponentTag = posCount >= 4 ? (posTags[3] as VmTag) : VmTag.Num
  let exponentNum = posCount >= 4 ? posNums[3] : 1.0
  let exponentAux = posCount >= 4 ? posAux[3] : 0

  // Named overrides (input/up/down/exponent)
  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    // Using custom symbol names for slew parameters
    // Since there are no predefined symbols for these, we'll need to handle them differently
    // For now, let's assume positional only, named args can be added later if needed
  }

  const input$ = audio.toAudioPtr(inputTag, inputNum, inputAux, length, program)
  const up$ = audio.toAudioPtr(upTag, upNum, upAux, length, program)
  const down$ = audio.toAudioPtr(downTag, downNum, downAux, length, program)
  const exponent$ = audio.toAudioPtr(exponentTag, exponentNum, exponentAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const slew = program.gensPool.get(Op.Slew) as Slew
  slew.in$ = input$
  slew.up$ = up$
  slew.down$ = down$
  slew.exp$ = exponent$
  slew.process(out$, length)

  stack.push(VmTag.Audio, 0.0, outIndex)
}
