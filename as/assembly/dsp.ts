import { ARRAY_HEADER_SIZE, SEQ_VOICES } from './constants'
import { Ad } from './gen/ad'
import { Adsr } from './gen/adsr'
import { Analyser } from './gen/analyser'
import { Seq } from './gen/seq'
import { SeqMap } from './gen/seqmap'
import { Sin } from './gen/sin'
import { Program } from './program'
import { Op } from './shared'

function clearAudio(out$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    store<f32>(out$, 0)
    out$ += 4
  }
}

function addAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const s1 = load<f32>(a1$)
    const s2 = load<f32>(a2$)
    const sample = s1 + s2
    store<f32>(out$, sample)
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

function mulAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const s1 = load<f32>(a1$)
    const s2 = load<f32>(a2$)
    const sample = s1 * s2
    store<f32>(out$, sample)
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

function copyAudio(out$: usize, in$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    store<f32>(out$, load<f32>(in$))
    out$ += 4
    in$ += 4
  }
}

export class Dsp {
  program: Program = new Program()

  // Execute a single op, returns new PC
  executeOp(op: Op, pc: i32, pos: i32, length: i32, left$: usize, right$: usize): i32 {
    const ops = this.program.ops
    const gensPool = this.program.gensPool
    const program = this.program

    switch (op) {
      case Op.End: {
        globalSampleCount += length
        return -1 // Signal to stop
      }

      case Op.Out: {
        const outLeft$ = program.getOutBuffer(ops[pc++])
        const outRight$ = program.getOutBuffer(ops[pc++])
        addAudio(left$, left$, outLeft$, length)
        addAudio(right$, right$, outRight$, length)
        break
      }

      case Op.ArrayAt: {
        let out$ = program.getOutBuffer(ops[pc++])
        const arrayIndex = ops[pc++]
        const array = changetype<StaticArray<f32>>(program.data.arrays[arrayIndex])
        let element$ = program.getOutBuffer(ops[pc++])
        for (let i = 0; i < length; i++) {
          const element = load<f32>(element$)
          const index = Mathf.round(element)
          const value = array[index as i32 + ARRAY_HEADER_SIZE]
          store<f32>(out$, value)
          element$ += 4
          out$ += 4
        }
        break
      }

      case Op.Literal: {
        let out$ = program.getOutBuffer(ops[pc++])
        const literalIndex = ops[pc++]
        const literal = program.data.readLiteral(literalIndex)
        for (let i = 0; i < length; i++) {
          store<f32>(out$, literal)
          out$ += 4
        }
        break
      }

      case Op.LiteralSmoothed: {
        let out$ = program.getOutBuffer(ops[pc++])
        const literalIndex = ops[pc++]
        const literalSmoothed = program.literalsSmoothed[literalIndex]
        const literalTarget = program.data.readLiteral(literalIndex)
        literalSmoothed.set(literalTarget)
        for (let i = 0; i < length; i++) {
          literalSmoothed.update()
          store<f32>(out$, literalSmoothed.value as f32)
          out$ += 4
        }
        break
      }

      case Op.Add: {
        const out$ = program.getOutBuffer(ops[pc++])
        const a1$ = program.getOutBuffer(ops[pc++])
        const a2$ = program.getOutBuffer(ops[pc++])
        addAudio(out$, a1$, a2$, length)
        break
      }

      case Op.Mul: {
        const out$ = program.getOutBuffer(ops[pc++])
        const a1$ = program.getOutBuffer(ops[pc++])
        const a2$ = program.getOutBuffer(ops[pc++])
        mulAudio(out$, a1$, a2$, length)
        break
      }

      case Op.Sin: {
        const sin = gensPool.get(Op.Sin) as Sin
        const out$ = program.getOutBuffer(ops[pc++])
        const hz$ = program.getOutBuffer(ops[pc++])
        const trig$ = program.getOutBuffer(ops[pc++])
        sin.hz$ = hz$
        sin.trig$ = trig$
        sin.process(out$, length)
        break
      }

      case Op.Ad: {
        const ad = gensPool.get(Op.Ad) as Ad
        const out$ = program.getOutBuffer(ops[pc++])
        const attack$ = program.getOutBuffer(ops[pc++])
        const decay$ = program.getOutBuffer(ops[pc++])
        const trig$ = program.getOutBuffer(ops[pc++])
        ad.attack$ = attack$
        ad.decay$ = decay$
        ad.trig$ = trig$
        ad.process(out$, length)
        break
      }

      case Op.Adsr: {
        const adsr = gensPool.get(Op.Adsr) as Adsr
        const out$ = program.getOutBuffer(ops[pc++])
        const attack$ = program.getOutBuffer(ops[pc++])
        const decay$ = program.getOutBuffer(ops[pc++])
        const sustain$ = program.getOutBuffer(ops[pc++])
        const release$ = program.getOutBuffer(ops[pc++])
        const trig$ = program.getOutBuffer(ops[pc++])
        adsr.attack$ = attack$
        adsr.decay$ = decay$
        adsr.sustain$ = sustain$
        adsr.release$ = release$
        adsr.trig$ = trig$
        adsr.process(out$, length)
        break
      }

      case Op.Seq: {
        const seq = gensPool.get(Op.Seq) as Seq
        const arrayIndex = ops[pc++]
        const voiceCountOut = ops[pc++]

        for (let v = 0; v < SEQ_VOICES; v++) {
          const trigOut = ops[pc++]
          const velocityOut = ops[pc++]
          const valueOut = ops[pc++]
          program.lastSeqTrigOuts[v] = trigOut
          program.lastSeqVelocityOuts[v] = velocityOut
          program.lastSeqValueOuts[v] = valueOut
          seq.outTrig$[v] = program.outsPool.get(trigOut)
          seq.outVelocity$[v] = program.outsPool.get(velocityOut)
          seq.outValue$[v] = program.outsPool.get(valueOut)
        }

        seq.bytecode$ = changetype<usize>(program.data.arrays[arrayIndex])
        seq.outVoiceCount$ = program.outsPool.get(voiceCountOut)

        seq.process(0, length)
        program.lastSeqVoiceCountOut = voiceCountOut
        break
      }

      case Op.SeqVoiceTrig: {
        const outBuf = ops[pc++]
        const out$ = program.getOutBuffer(outBuf)
        const voiceIndex = program.currentVoiceIndex
        // Copy from Seq output (not remapped) to body buffer (remapped)
        const src$ = program.outsPool.get(program.lastSeqTrigOuts[voiceIndex])
        copyAudio(out$, src$, length)
        break
      }

      case Op.SeqVoiceVelocity: {
        const outBuf = ops[pc++]
        const out$ = program.getOutBuffer(outBuf)
        const voiceIndex = program.currentVoiceIndex
        const src$ = program.outsPool.get(program.lastSeqVelocityOuts[voiceIndex])
        copyAudio(out$, src$, length)
        break
      }

      case Op.SeqVoiceValue: {
        const outBuf = ops[pc++]
        const out$ = program.getOutBuffer(outBuf)
        const voiceIndex = program.currentVoiceIndex
        const src$ = program.outsPool.get(program.lastSeqValueOuts[voiceIndex])
        copyAudio(out$, src$, length)
        break
      }

      case Op.SeqForEach: {
        const voiceCountIndex = ops[pc++]
        const bodyStartPc = ops[pc++]
        const bodyLength = ops[pc++]
        const bodyBufBase = ops[pc++]
        const audioOutBuf = ops[pc++] // Compile-time audio output buffer

        program.seqForEachAudioOutsCount = 0

        const voiceCount$ = program.outsPool.get(voiceCountIndex)
        const numVoices = Mathf.round(load<f32>(voiceCount$)) as i32
        const voicesToProcess = numVoices < SEQ_VOICES ? numVoices : SEQ_VOICES

        // Set up remapping context
        program.bodyBufferBase = bodyBufBase
        program.inSeqForEach = true

        // Execute body for each active voice
        for (let v = 0; v < voicesToProcess; v++) {
          program.currentVoiceIndex = v

          // Execute body bytecode with remapping active
          let bodyPc = bodyStartPc
          const bodyEndPc = bodyStartPc + bodyLength
          while (bodyPc < bodyEndPc) {
            const bodyOp = ops[bodyPc] as Op
            bodyPc++
            bodyPc = this.executeOp(bodyOp, bodyPc, pos, length, left$, right$)
          }

          // Track remapped audio output for this voice
          const remappedAudio = 500 + v * 32 + (audioOutBuf - bodyBufBase)
          program.seqForEachAudioOuts[program.seqForEachAudioOutsCount++] = remappedAudio
        }

        program.inSeqForEach = false
        break
      }

      case Op.SeqMap: {
        const seqmap = gensPool.get(Op.SeqMap) as SeqMap
        const out$ = program.getOutBuffer(ops[pc++])

        const numVoices = program.seqForEachAudioOutsCount
        seqmap.numVoices = numVoices

        for (let v = 0; v < numVoices; v++) {
          seqmap.inTrig$[v] = program.outsPool.get(program.lastSeqTrigOuts[v])
          seqmap.inVelocity$[v] = program.outsPool.get(program.lastSeqVelocityOuts[v])
          seqmap.inValue$[v] = program.outsPool.get(program.lastSeqValueOuts[v])
          seqmap.inAudio$[v] = program.outsPool.get(program.seqForEachAudioOuts[v])
        }

        seqmap.process(out$, length)
        break
      }

      case Op.Analyser: {
        const analyser = gensPool.get(Op.Analyser) as Analyser
        const out$ = program.analyserOutsPool.get(ops[pc++]) + pos
        const in$ = program.getOutBuffer(ops[pc++])
        analyser.in$ = in$
        analyser.process(out$, length)
        break
      }
    }

    return pc
  }

  process(left$: usize, right$: usize, begin: i32, length: i32): void {
    const ops = this.program.ops
    this.program.gensPool.resetIndices()

    const pos = begin * 4
    left$ += pos
    right$ += pos
    clearAudio(left$, length)
    clearAudio(right$, length)

    let pc = 0
    while (pc < ops.length && pc >= 0) {
      const op = ops[pc] as Op
      pc++
      pc = this.executeOp(op, pc, pos, length, left$, right$)
    }
  }
}
