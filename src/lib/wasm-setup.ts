import { wasmSourceMap } from './wasm-sourcemap.ts'

interface SetupOptions {
  binary: ArrayBuffer
  sourcemapUrl: string
  config: {
    options: {
      importMemory: boolean
      initialMemory: number
      maximumMemory: number
      sharedMemory: boolean
    }
  }
  imports?: WebAssembly.Imports | ((ctx: { memory: WebAssembly.Memory }) => WebAssembly.Imports)
}

export type WasmSetup<T> = Awaited<ReturnType<typeof wasmSetup<T>>>
export async function wasmSetup<T>({ binary, sourcemapUrl, config, imports }: SetupOptions) {
  const buffer = wasmSourceMap.setSourceMapURL(binary, sourcemapUrl)
  const uint8 = new Uint8Array(buffer)

  const memory = new WebAssembly.Memory({
    initial: config.options.initialMemory,
    maximum: config.options.maximumMemory,
    shared: config.options.sharedMemory,
  })
  const mod = await WebAssembly.compile(uint8.buffer)

  function __liftString(pointer: number) {
    if (!pointer) return null
    const end = (pointer + new Uint32Array(memory.buffer)[(pointer - 4) >>> 2]) >>> 1,
      memoryU16 = new Uint16Array(memory.buffer)
    let start = pointer >>> 1,
      string = ''
    while (end - start > 1024) {
      string += String.fromCharCode(...memoryU16.subarray(start, start += 1024))
    }
    return string + String.fromCharCode(...memoryU16.subarray(start, end))
  }

  const extraImports = typeof imports === 'function' ? imports({ memory }) : imports
  const importObject: WebAssembly.Imports = {
    env: {
      memory,
      abort(message$: number, fileName$: number, lineNumber$: number, columnNumber$: number) {
        const message = __liftString(message$ >>> 0)
        const fileName = __liftString(fileName$ >>> 0)
        const lineNumber = lineNumber$ >>> 0
        const columnNumber = columnNumber$ >>> 0
        throw new Error(`${message} in ${fileName}:${lineNumber}:${columnNumber}`)
      },
      seed: () => Date.now() * Math.random(),
      log: console.log,
      'console.log': (textPtr: number) => {
        console.log(__liftString(textPtr))
      },
      'console.warn': (textPtr: number) => {
        console.warn(__liftString(textPtr))
      },
    },
    host: {
      // Default stubs so tooling instantiations (e.g. visual wasm) don't fail.
      sampleVersion: (_sampleIndex: number) => 0,
      sampleLen: (_sampleIndex: number) => 0,
      sampleRead: (_sampleIndex: number, _start: number, _length: number, _outPtr: number) => 0,
      sampleSet: (_sampleIndex: number, _length: number, _inPtr: number) => {},
      sampleSlices: (_sampleIndex: number, _threshold: number, _outPtr: number, _max: number) => 0,
    },
  }

  if (extraImports) {
    for (const k of Object.keys(extraImports)) {
      const mod = (extraImports as any)[k]
      if (!mod) continue
      ;(importObject as any)[k] = { ...(importObject as any)[k], ...mod }
    }
  }

  const instance = await WebAssembly.instantiate(mod, importObject)

  const wasm: T = instance.exports as any

  return {
    wasm,
    memory,
  }
}
