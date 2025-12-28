// dprint-ignore-file
import { Program } from '../../program'
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

// note(midi) -> hz, using runtime directives: tune (multiplier), octave (octaves), transpose (semitones).
// Returns number when all inputs are scalar, otherwise returns audio-rate buffer.
//
// @ts-ignore

export function callNote(
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
  let midiTag: VmTag = VmTag.Num
  let midiNum: f64 = 0.0
  let midiAux: i32 = 0

  if (posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null) {
    midiTag = posTags[0] as VmTag
    midiNum = posNums[0]
    midiAux = posAux[0]
  }

  const tuneTag = dsp.tuneTag as VmTag
  const tuneNum = dsp.tuneNum
  const tuneAux = dsp.tuneAux

  const octaveTag = dsp.octaveTag as VmTag
  const octaveNum = dsp.octaveNum
  const octaveAux = dsp.octaveAux

  const transposeTag = dsp.transposeTag as VmTag
  const transposeNum = dsp.transposeNum
  const transposeAux = dsp.transposeAux

  const midiAudio = midiTag === VmTag.Audio || (midiTag === VmTag.Num && midiAux < 0)
  const tuneAudio = tuneTag === VmTag.Audio || (tuneTag === VmTag.Num && tuneAux < 0)
  const octaveAudio = octaveTag === VmTag.Audio || (octaveTag === VmTag.Num && octaveAux < 0)
  const transposeAudio = transposeTag === VmTag.Audio || (transposeTag === VmTag.Num && transposeAux < 0)
  const audioNeeded = midiAudio || tuneAudio || octaveAudio || transposeAudio

  if (!audioNeeded) {
    const midi = numFromTag(midiTag, midiNum)
    const tune = numFromTag(tuneTag, tuneNum)
    const oct = numFromTag(octaveTag, octaveNum)
    const tr = numFromTag(transposeTag, transposeNum)
    const semis = tr + oct * 12.0
    const hz = 440.0 * pow2(((midi + semis) - 69.0) / 12.0) * tune
    stack.push(VmTag.Num, hz)
    return
  }

  if (length <= 0) {
    stack.push(VmTag.Undef)
    return
  }

  const midi$ = midiAudio ? audio.toAudioPtr(midiTag, midiNum, midiAux, length, program) : 0
  const tune$ = tuneAudio ? audio.toAudioPtr(tuneTag, tuneNum, tuneAux, length, program) : 0
  const octave$ = octaveAudio ? audio.toAudioPtr(octaveTag, octaveNum, octaveAux, length, program) : 0
  const transpose$ = transposeAudio ? audio.toAudioPtr(transposeTag, transposeNum, transposeAux, length, program) : 0

  const midi0 = midiAudio ? 0.0 : numFromTag(midiTag, midiNum)
  const tune0 = tuneAudio ? 0.0 : numFromTag(tuneTag, tuneNum)
  const octave0 = octaveAudio ? 0.0 : numFromTag(octaveTag, octaveNum)
  const transpose0 = transposeAudio ? 0.0 : numFromTag(transposeTag, transposeNum)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  let p$ = out$
  for (let s = 0; s < length; s++) {
    const midi = midiAudio ? (load<f32>(midi$ + (s << 2)) as f64) : midi0
    const tune = tuneAudio ? (load<f32>(tune$ + (s << 2)) as f64) : tune0
    const oct = octaveAudio ? (load<f32>(octave$ + (s << 2)) as f64) : octave0
    const tr = transposeAudio ? (load<f32>(transpose$ + (s << 2)) as f64) : transpose0
    const semis = tr + oct * 12.0
    const hz = 440.0 * pow2(((midi + semis) - 69.0) / 12.0) * tune
    store<f32>(p$, hz as f32)
    p$ += 4
  }

  stack.push(VmTag.Audio, 0.0, outIndex)
}


