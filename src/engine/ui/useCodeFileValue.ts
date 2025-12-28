import { type CodeFile } from 'mini-code'
import { useEffect, useState } from 'preact/hooks'

export function useCodeFileValue(codeFile: CodeFile | undefined) {
  const [value, setValue] = useState(codeFile?.value ?? '')

  useEffect(() => {
    if (!codeFile) {
      setValue('')
      return
    }

    setValue(codeFile.value)
    return codeFile.subscribe(() => {
      const next = codeFile.value
      setValue(prev => (prev === next ? prev : next))
    })
  }, [codeFile])

  return value
}
