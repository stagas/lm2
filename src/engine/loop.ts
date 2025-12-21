import { CodeFile } from 'mini-code'
import type { LoopData } from '../../deno/types.ts'

export class Loop {
  codeFile: CodeFile
  constructor(public data: LoopData, codeFile?: CodeFile) {
    this.codeFile = codeFile ?? new CodeFile(data.code ?? '')
  }
  get isNew() {
    return this.data.timestamp === 0
  }
  get isDirty() {
    if (this.data.code == null) return false
    return this.codeFile.value !== this.data.code
  }
}
