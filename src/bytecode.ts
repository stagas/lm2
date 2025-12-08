import { OPS_COUNT } from '../as/assembly/constants.ts'
import { Op } from '../as/assembly/shared.ts'

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
}
