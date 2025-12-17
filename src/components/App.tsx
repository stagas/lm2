import { CodeEditor } from 'mini-code'
import { useState } from 'react'

const sampleCode = `// Sample file for CodeEditor
function greet(name: string) {
  return 'Hello, ' + name
}

console.log(greet('World'))`

export function App() {
  const [value, setValue] = useState<string>(sampleCode)

  return (
    <div className="min-h-screen flex items-center justify-center text-white bg-black">
      <div className="w-[500px] h-[200px]">
        <CodeEditor value={value} setValue={setValue} />
      </div>
    </div>
  )
}
