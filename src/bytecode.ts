import { OPS_COUNT, SEQ_VOICES } from '../as/assembly/constants.ts'
import { Op, SeqOp } from '../as/assembly/shared.ts'

export { Op, SEQ_VOICES, SeqOp }

export class Bytecode {
  ops = new Int32Array(OPS_COUNT)
  pc = 0

  stack: number[] = []
  outsCount = 0

  emit(op: Op, ...args: any[]) {
    this.ops[this.pc++] = op
    for (const arg of args) {
      this.ops[this.pc++] = arg
    }
  }

  End = () => {
    this.emit(Op.End)
  }

  Push = (value: number) => {
    if (this.stack.length >= 1024) {
      throw new Error('Stack overflow')
    }
    this.stack.push(value)
  }

  Pop = () => {
    if (this.stack.length === 0) {
      throw new Error('Stack underflow')
    }
    return this.stack.pop()!
  }

  Peek = () => {
    if (this.stack.length === 0) {
      throw new Error('Stack underflow')
    }
    return this.stack.at(-1)!
  }

  Dup = () => {
    this.stack.push(this.stack.at(-1)!)
  }

  Pick = (depth: number) => {
    // Pick value at depth from top of stack and push copy
    // depth=0 is top (same as Dup), depth=1 is one below top, etc.
    if (depth >= this.stack.length) {
      throw new Error('Stack underflow in Pick')
    }
    this.stack.push(this.stack[this.stack.length - 1 - depth]!)
  }

  SeqVoice = (voiceIndex: number) => {
    // Extract voice triplet from Seq outputs
    // Expects Seq outputs at bottom of stack (24 values)
    // Pushes (trig, velocity, value) for the specified voice
    const baseDepth = this.stack.length - 24
    if (baseDepth < 0) {
      throw new Error('Not enough values on stack for SeqVoice')
    }
    const voiceBase = baseDepth + voiceIndex * 3
    this.stack.push(this.stack[voiceBase]!) // trig
    this.stack.push(this.stack[voiceBase + 1]!) // velocity
    this.stack.push(this.stack[voiceBase + 2]!) // value
  }

  Out = () => {
    const outRight = this.stack.pop()
    const outLeft = this.stack.pop()
    this.emit(Op.Out, outLeft, outRight)
  }

  ArrayAt = (index: number) => {
    const out = this.outsCount++
    const element = this.stack.pop()
    this.emit(Op.ArrayAt, out, index, element)
    this.stack.push(out)
  }

  Literal = (index: number) => {
    const out = this.outsCount++
    this.emit(Op.Literal, out, index)
    this.stack.push(out)
  }

  LiteralSmoothed = (index: number) => {
    const out = this.outsCount++
    this.emit(Op.LiteralSmoothed, out, index)
    this.stack.push(out)
  }

  Add = () => {
    const out = this.outsCount++
    const a2 = this.Pop()
    const a1 = this.Pop()
    this.emit(Op.Add, out, a1, a2)
    this.stack.push(out)
  }

  Mul = () => {
    const out = this.outsCount++
    const a2 = this.Pop()
    const a1 = this.Pop()
    this.emit(Op.Mul, out, a1, a2)
    this.stack.push(out)
  }

  Sin = () => {
    const out = this.outsCount++
    const trig = this.stack.pop()
    const hz = this.stack.pop()
    this.emit(Op.Sin, out, hz, trig)
    this.stack.push(out)
  }

  Ad = () => {
    const out = this.outsCount++
    const trig = this.stack.pop()
    const decay = this.stack.pop()
    const attack = this.stack.pop()
    this.emit(Op.Ad, out, attack, decay, trig)
    this.stack.push(out)
  }

  Adsr = () => {
    const out = this.outsCount++
    const trig = this.stack.pop()
    const release = this.stack.pop()
    const sustain = this.stack.pop()
    const decay = this.stack.pop()
    const attack = this.stack.pop()
    this.emit(Op.Adsr, out, attack, decay, sustain, release, trig)
    this.stack.push(out)
  }

  Seq = (arrayIndex: number) => {
    const voiceCountOut = this.outsCount++
    const voiceOuts: number[][] = []

    for (let v = 0; v < SEQ_VOICES; v++) {
      const outTrig = this.outsCount++
      const outVelocity = this.outsCount++
      const outValue = this.outsCount++
      voiceOuts.push([outTrig, outVelocity, outValue])
    }

    const emitArgs = [arrayIndex, voiceCountOut]
    for (const voice of voiceOuts) {
      emitArgs.push(...voice)
    }

    this.emit(Op.Seq, ...emitArgs)

    // Push voice outputs first, then voice count last (so it's on top for SeqForEach to pop)
    for (const voice of voiceOuts) {
      this.stack.push(voice[0]) // trig
      this.stack.push(voice[1]) // velocity
      this.stack.push(voice[2]) // value
    }
    this.stack.push(voiceCountOut) // voice count (on top)
  }

  SeqForEach = (bodyFn: () => void) => {
    // Runtime loop: execute body for each active voice
    // Voice count is on top of stack from Seq

    const voiceCount = this.stack.pop()! // Pop voice count

    const seqForEachPc = this.pc
    this.emit(Op.SeqForEach, voiceCount, 0, 0) // voiceCount buffer, body start, body length

    const bodyStartPc = this.pc
    bodyFn() // Generate the loop body bytecode once
    const bodyLength = this.pc - bodyStartPc

    // Patch the offsets
    this.ops[seqForEachPc + 2] = bodyStartPc // body start offset
    this.ops[seqForEachPc + 3] = bodyLength // body length
  }

  SeqVoiceTrig = () => {
    // Runtime: reads current voice's trig (voice index determined at runtime)
    const out = this.outsCount++
    this.emit(Op.SeqVoiceTrig, out)
    this.stack.push(out)
  }

  SeqVoiceVelocity = () => {
    // Runtime: reads current voice's velocity
    const out = this.outsCount++
    this.emit(Op.SeqVoiceVelocity, out)
    this.stack.push(out)
  }

  SeqVoiceValue = () => {
    // Runtime: reads current voice's value
    const out = this.outsCount++
    this.emit(Op.SeqVoiceValue, out)
    this.stack.push(out)
  }

  SeqMap = () => {
    // Mixes audio from voices (audio indices tracked in runtime by SeqForEach)
    const out = this.outsCount++
    this.emit(Op.SeqMap, out)
    this.stack.push(out)
  }
}
