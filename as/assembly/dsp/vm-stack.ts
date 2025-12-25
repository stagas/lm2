import { setVmError } from '../globals'
import { VmTag } from './types'

export class VmStack {
  sp: i32 = 0
  tag: StaticArray<i32> = new StaticArray<i32>(1024)
  num: StaticArray<f64> = new StaticArray<f64>(1024)
  aux: StaticArray<i32> = new StaticArray<i32>(1024)

  push(tag: VmTag, num: f64 = 0.0, aux: i32 = 0): void {
    const sp = this.sp
    if (sp < 0 || sp >= this.tag.length) {
      setVmError(10, 0)
      return
    }
    this.tag[sp] = tag
    this.num[sp] = num
    this.aux[sp] = aux
    this.sp = sp + 1
  }

  pop(): i32 {
    if (this.sp <= 0) {
      setVmError(11, 0)
      this.sp = 0
      return 0
    }
    this.sp--
    return this.sp
  }

  peek(): i32 {
    if (this.sp <= 0) {
      setVmError(11, 0)
      return 0
    }
    return this.sp - 1
  }

  reset(): void {
    this.sp = 0
  }

  truthy(tag: VmTag, num: f64): bool {
    if (tag === VmTag.Undef || tag === VmTag.Null) return false
    if (tag === VmTag.Bool) return num != 0.0
    if (tag === VmTag.Num) return num != 0.0
    return true
  }
}
