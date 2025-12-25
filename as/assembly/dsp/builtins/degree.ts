// dprint-ignore-file
import { Program } from '../../program'
import { degreeToMidi } from '../../mini/scales'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'
import { Dsp } from '../dsp'

// @ts-ignore

function pow2(x: f64): f64 {
  return Math.pow(2.0, x)
}

// @ts-ignore

function numFromTag(tag: VmTag, num: f64): f64 {
  if (tag === VmTag.Bool) return num != 0.0 ? 1.0 : 0.0
  if (tag === VmTag.Num) return num
  return 0.0
}

// degree(n, semitoneAdjust=0) -> hz of scale degree n, using `scale` directive and C-1 base root (midi 0).
// Applies tune/octave/transpose directives the same way `note(midi)` does.
// Optional second parameter adds semitone adjustment (for altered extensions like b9, #11, etc.)
//
// @ts-ignore

export function callDegree(
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
  const degTag = posCount >= 1 ? (posTags[0] as VmTag) : VmTag.Num
  const degNum = posCount >= 1 ? posNums[0] : 0.0
  const degAux = posCount >= 1 ? posAux[0] : 0

  const adjTag = posCount >= 2 ? (posTags[1] as VmTag) : VmTag.Num
  const adjNum = posCount >= 2 ? posNums[1] : 0.0
  const adjAux = posCount >= 2 ? posAux[1] : 0

  const tuneTag = dsp.tuneTag as VmTag
  const tuneNum = dsp.tuneNum
  const tuneAux = dsp.tuneAux

  const octaveTag = dsp.octaveTag as VmTag
  const octaveNum = dsp.octaveNum
  const octaveAux = dsp.octaveAux

  const transposeTag = dsp.transposeTag as VmTag
  const transposeNum = dsp.transposeNum
  const transposeAux = dsp.transposeAux

  const degAudio = degTag === VmTag.Audio || (degTag === VmTag.Num && degAux < 0)
  const adjAudio = adjTag === VmTag.Audio || (adjTag === VmTag.Num && adjAux < 0)
  const tuneAudio = tuneTag === VmTag.Audio || (tuneTag === VmTag.Num && tuneAux < 0)
  const octaveAudio = octaveTag === VmTag.Audio || (octaveTag === VmTag.Num && octaveAux < 0)
  const transposeAudio = transposeTag === VmTag.Audio || (transposeTag === VmTag.Num && transposeAux < 0)
  const audioNeeded = degAudio || adjAudio || tuneAudio || octaveAudio || transposeAudio

  if (!audioNeeded) {
    const d = i32(numFromTag(degTag, degNum))
    const adj = numFromTag(adjTag, adjNum)
    const midi0: i32 = degreeToMidi(0, dsp.scaleIndex, d)
    if (midi0 < 0) {
      stack.push(VmTag.Num, 0.0)
      return
    }
    const tune = numFromTag(tuneTag, tuneNum)
    const oct = numFromTag(octaveTag, octaveNum)
    const tr = numFromTag(transposeTag, transposeNum)
    const semis = tr + oct * 12.0 + adj
    const hz = 440.0 * pow2(((f64(midi0) + semis) - 69.0) / 12.0) * tune
    stack.push(VmTag.Num, hz)
    return
  }

  if (length <= 0) {
    stack.push(VmTag.Undef)
    return
  }

  const deg$ = degAudio ? audio.toAudioPtr(degTag, degNum, degAux, length, program) : 0
  const adj$ = adjAudio ? audio.toAudioPtr(adjTag, adjNum, adjAux, length, program) : 0
  const tune$ = tuneAudio ? audio.toAudioPtr(tuneTag, tuneNum, tuneAux, length, program) : 0
  const octave$ = octaveAudio ? audio.toAudioPtr(octaveTag, octaveNum, octaveAux, length, program) : 0
  const transpose$ = transposeAudio ? audio.toAudioPtr(transposeTag, transposeNum, transposeAux, length, program) : 0

  const deg0 = degAudio ? 0.0 : numFromTag(degTag, degNum)
  const adj0 = adjAudio ? 0.0 : numFromTag(adjTag, adjNum)
  const tune0 = tuneAudio ? 0.0 : numFromTag(tuneTag, tuneNum)
  const octave0 = octaveAudio ? 0.0 : numFromTag(octaveTag, octaveNum)
  const transpose0 = transposeAudio ? 0.0 : numFromTag(transposeTag, transposeNum)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  let p$ = out$
  for (let s = 0; s < length; s++) {
    const d = degAudio ? i32(load<f32>(deg$ + (s << 2))) : i32(deg0)
    const adj = adjAudio ? (load<f32>(adj$ + (s << 2)) as f64) : adj0
    const midi0: i32 = degreeToMidi(0, dsp.scaleIndex, d)
    if (midi0 < 0) {
      store<f32>(p$, 0.0 as f32)
      p$ += 4
      continue
    }
    const tune = tuneAudio ? (load<f32>(tune$ + (s << 2)) as f64) : tune0
    const oct = octaveAudio ? (load<f32>(octave$ + (s << 2)) as f64) : octave0
    const tr = transposeAudio ? (load<f32>(transpose$ + (s << 2)) as f64) : transpose0
    const semis = tr + oct * 12.0 + adj
    const hz = 440.0 * pow2(((f64(midi0) + semis) - 69.0) / 12.0) * tune
    store<f32>(p$, hz as f32)
    p$ += 4
  }

  stack.push(VmTag.Audio, 0.0, outIndex)
}


